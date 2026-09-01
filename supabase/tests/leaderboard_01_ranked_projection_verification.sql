-- Run in Supabase SQL Editor after 202608310003_leaderboard_01_ranked_projection.sql.
-- Read-only production verification: every returned boolean must be true and mismatch counts 0.
with ledger_outcomes as (
  select settlement.player_a_id as player_id,
    (settlement.winner_id = settlement.player_a_id)::integer as wins,
    (settlement.winner_id <> settlement.player_a_id)::integer as losses
  from private.rating_settlements settlement
  union all
  select settlement.player_b_id as player_id,
    (settlement.winner_id = settlement.player_b_id)::integer as wins,
    (settlement.winner_id <> settlement.player_b_id)::integer as losses
  from private.rating_settlements settlement
), ledger_totals as (
  select outcome.player_id, count(*)::integer as games,
    sum(outcome.wins)::integer as wins, sum(outcome.losses)::integer as losses
  from ledger_outcomes outcome group by outcome.player_id
), aggregate_mismatches as (
  select rating.player_id
  from public.player_ratings rating
  left join ledger_totals ledger using (player_id)
  where rating.rated_games <> coalesce(ledger.games, 0)
    or rating.ranked_wins <> coalesce(ledger.wins, 0)
    or rating.ranked_losses <> coalesce(ledger.losses, 0)
), top_contract_columns as (
  select array_agg(parameter_name::text order by ordinal_position)
    filter (where parameter_mode = 'OUT') as names
  from information_schema.parameters
  where specific_schema = 'public'
    and specific_name like 'get_ranked_leaderboard_top_100_%'
), own_contract_columns as (
  select array_agg(parameter_name::text order by ordinal_position)
    filter (where parameter_mode = 'OUT') as names
  from information_schema.parameters
  where specific_schema = 'public'
    and specific_name like 'get_current_player_ranked_rank_%'
), definitions as (
  select
    pg_get_functiondef('public.get_ranked_leaderboard_top_100()'::regprocedure) as top_definition,
    pg_get_functiondef('public.get_current_player_ranked_rank()'::regprocedure) as own_definition,
    pg_get_functiondef(
      'private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)'::regprocedure
    ) as settlement_definition
)
select
  not exists (
    select 1 from public.player_ratings
    where rated_games <> ranked_wins + ranked_losses
  ) as rated_games_invariant,
  not exists (select 1 from aggregate_mismatches) as ledger_projection_matches,
  (select count(*) from aggregate_mismatches) as aggregate_mismatch_count,
  not exists (
    select 1 from private.rating_settlements
    where match_mode <> 'multiplayer-ranked'
      or termination_reason not in ('normal', 'forfeit')
  ) as no_unranked_or_abort_contamination,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.player_ratings'::regclass
      and conname = 'player_ratings_ranked_outcome_count_check'
      and convalidated
  ) as invariant_constraint_validated,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'player_ratings'
      and indexname = 'player_ratings_leaderboard_rank_idx'
      and indexdef like '%multiplayer_rating DESC, ranked_wins DESC, ranked_win_rate DESC, rated_games DESC, player_id%'
      and indexdef like '%WHERE (rated_games >= 1)%'
  ) as leaderboard_index_present,
  not has_table_privilege('authenticated', 'public.player_ratings', 'INSERT,UPDATE,DELETE')
    as browser_rating_mutation_denied,
  not has_table_privilege('authenticated', 'private.rating_settlements', 'SELECT,INSERT,UPDATE,DELETE')
    as browser_ledger_access_denied,
  has_function_privilege('authenticated', 'public.get_ranked_leaderboard_top_100()', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.get_current_player_ranked_rank()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_ranked_leaderboard_top_100()', 'EXECUTE')
    and not has_function_privilege('anon', 'public.get_current_player_ranked_rank()', 'EXECUTE')
    as cloud_guest_and_account_contract_only,
  (select names = array[
    'rank','username','discriminator','rating','ranked_games','ranked_wins',
    'ranked_losses','ranked_win_rate','is_current_player'
  ] from top_contract_columns) as top_contract_public_safe,
  (select names = array[
    'qualified','rank','username','discriminator','rating','ranked_games','ranked_wins',
    'ranked_losses','ranked_win_rate','is_current_player'
  ] from own_contract_columns) as own_contract_public_safe,
  definitions.top_definition like '%private.current_player_id()%'
    and definitions.own_definition like '%private.current_player_id()%'
    and definitions.top_definition not like '%auth_user_id%'
    and definitions.own_definition not like '%auth_user_id%'
    as caller_resolved_without_auth_leak,
  lower(definitions.top_definition) like '%multiplayer_rating desc%ranked_wins desc%ranked_win_rate desc%rated_games desc%player_id asc%'
    and lower(definitions.own_definition) like '%multiplayer_rating > caller_rating.multiplayer_rating%ranked_wins > caller_rating.ranked_wins%ranked_win_rate > caller_rating.ranked_win_rate%rated_games > caller_rating.rated_games%player_id < caller_rating.player_id%'
    as top_and_own_ordering_match,
  definitions.settlement_definition like '%pg_advisory_xact_lock%'
    and definitions.settlement_definition like '%ranked_wins = rating.ranked_wins%'
    and definitions.settlement_definition like '%ranked_losses = rating.ranked_losses%'
    and definitions.settlement_definition like '%if existing.match_id is not null then%'
    as settlement_exactly_once_projection
from definitions;
