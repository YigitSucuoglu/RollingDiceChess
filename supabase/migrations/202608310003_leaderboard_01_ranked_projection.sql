-- LEADERBOARD-01 Phase 2: authoritative ranked statistics projection and read-safe contracts.
begin;

alter table public.player_ratings
  add column if not exists ranked_wins integer not null default 0
    check (ranked_wins >= 0),
  add column if not exists ranked_losses integer not null default 0
    check (ranked_losses >= 0),
  add column if not exists ranked_win_rate numeric generated always as (
    case when rated_games = 0 then 0::numeric
      else ranked_wins::numeric / rated_games::numeric end
  ) stored;

-- Refuse to conceal an existing authority discrepancy. The transaction rolls back before
-- any projection is published if rated_games and the append-only ledger disagree.
do $$
declare mismatch_count bigint;
begin
  with ledger_games as (
    select participant.player_id, count(*)::integer as games
    from (
      select settlement.player_a_id as player_id from private.rating_settlements settlement
      union all
      select settlement.player_b_id as player_id from private.rating_settlements settlement
    ) participant
    group by participant.player_id
  )
  select count(*) into mismatch_count
  from public.player_ratings rating
  left join ledger_games ledger using (player_id)
  where rating.rated_games <> coalesce(ledger.games, 0);

  if mismatch_count <> 0 then
    raise exception
      'ranked projection backfill refused: % rating rows disagree with the settlement ledger',
      mismatch_count using errcode = '23514';
  end if;
end;
$$;

-- Idempotent source-of-truth backfill. A rerun derives the same values rather than adding.
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
  select outcome.player_id, sum(outcome.wins)::integer as wins,
    sum(outcome.losses)::integer as losses
  from ledger_outcomes outcome
  group by outcome.player_id
)
update public.player_ratings rating set
  ranked_wins = coalesce(ledger.wins, 0),
  ranked_losses = coalesce(ledger.losses, 0)
from (
  select rating_source.player_id, totals.wins, totals.losses
  from public.player_ratings rating_source
  left join ledger_totals totals using (player_id)
) ledger
where rating.player_id = ledger.player_id;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.player_ratings'::regclass
      and conname = 'player_ratings_ranked_outcome_count_check'
  ) then
    alter table public.player_ratings
      add constraint player_ratings_ranked_outcome_count_check
      check (rated_games = ranked_wins + ranked_losses) not valid;
  end if;
end;
$$;

alter table public.player_ratings
  validate constraint player_ratings_ranked_outcome_count_check;

create index if not exists player_ratings_leaderboard_rank_idx
  on public.player_ratings (
    multiplayer_rating desc,
    ranked_wins desc,
    ranked_win_rate desc,
    rated_games desc,
    player_id asc
  )
  where rated_games >= 1;

create or replace function private.settle_ranked_match(
  requested_match_id uuid,
  requested_match_mode text,
  requested_player_a_id uuid,
  requested_player_b_id uuid,
  requested_winner_id uuid,
  requested_termination_reason text
) returns table (
  match_id uuid,
  player_a_id uuid,
  player_b_id uuid,
  winner_id uuid,
  player_a_rating_before integer,
  player_b_rating_before integer,
  player_a_rating_after integer,
  player_b_rating_after integer,
  player_a_delta integer,
  player_b_delta integer,
  nominal_movement integer,
  effective_difference integer,
  floor_applied boolean
) language plpgsql security definer set search_path = '' as $$
declare
  existing private.rating_settlements%rowtype;
  locked_count integer;
  a_before integer;
  b_before integer;
  a_after integer;
  b_after integer;
  a_delta integer;
  b_delta integer;
  capped_difference integer;
  movement integer;
  favorite_won boolean;
begin
  if requested_match_id is null then
    raise exception 'authoritative match id is required' using errcode = '22023';
  end if;
  if requested_match_mode is distinct from 'multiplayer-ranked' then
    raise exception 'only ranked multiplayer results are rating eligible' using errcode = '22023';
  end if;
  if requested_player_a_id is null or requested_player_b_id is null
      or requested_player_a_id = requested_player_b_id then
    raise exception 'two distinct PlayerIds are required' using errcode = '22023';
  end if;
  if requested_winner_id is null
      or requested_winner_id not in (requested_player_a_id, requested_player_b_id) then
    raise exception 'winner must be a match participant' using errcode = '22023';
  end if;
  if requested_termination_reason is null
      or requested_termination_reason not in ('normal', 'forfeit') then
    raise exception 'technical aborts and unsupported outcomes are not rating eligible'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 1));

  select settlement.* into existing
  from private.rating_settlements settlement
  where settlement.match_id = requested_match_id;

  if existing.match_id is not null then
    if existing.match_mode <> requested_match_mode
        or existing.player_a_id <> requested_player_a_id
        or existing.player_b_id <> requested_player_b_id
        or existing.winner_id <> requested_winner_id
        or existing.termination_reason <> requested_termination_reason then
      raise exception 'match id was already settled with a different result' using errcode = '23505';
    end if;
    return query select
      existing.match_id, existing.player_a_id, existing.player_b_id, existing.winner_id,
      existing.player_a_rating_before, existing.player_b_rating_before,
      existing.player_a_rating_after, existing.player_b_rating_after,
      existing.player_a_delta, existing.player_b_delta, existing.nominal_movement,
      existing.effective_difference,
      existing.player_a_delta + existing.player_b_delta <> 0;
    return;
  end if;

  perform rating.player_id
  from public.player_ratings rating
  where rating.player_id in (requested_player_a_id, requested_player_b_id)
  order by rating.player_id
  for update;
  get diagnostics locked_count = row_count;
  if locked_count <> 2 then
    raise exception 'authoritative rating rows were not found' using errcode = 'P0002';
  end if;

  select rating.multiplayer_rating into a_before
  from public.player_ratings rating where rating.player_id = requested_player_a_id;
  select rating.multiplayer_rating into b_before
  from public.player_ratings rating where rating.player_id = requested_player_b_id;

  capped_difference := least(abs(a_before - b_before), 200);
  favorite_won := a_before <> b_before and (
    (a_before > b_before and requested_winner_id = requested_player_a_id)
    or (b_before > a_before and requested_winner_id = requested_player_b_id)
  );
  movement := round((15 + case
    when a_before = b_before then 0
    when favorite_won then -(capped_difference / 20.0)
    else capped_difference / 20.0
  end)::numeric)::integer;

  if requested_winner_id = requested_player_a_id then
    if a_before > 2147483647 - movement then
      raise exception 'winner rating exceeds the supported integer range' using errcode = '22003';
    end if;
    a_after := a_before + movement;
    b_after := greatest(0, b_before - movement);
  else
    if b_before > 2147483647 - movement then
      raise exception 'winner rating exceeds the supported integer range' using errcode = '22003';
    end if;
    a_after := greatest(0, a_before - movement);
    b_after := b_before + movement;
  end if;
  a_delta := a_after - a_before;
  b_delta := b_after - b_before;

  update public.player_ratings rating set
    multiplayer_rating = case
      when rating.player_id = requested_player_a_id then a_after else b_after end,
    rated_games = rating.rated_games + 1,
    ranked_wins = rating.ranked_wins
      + case when rating.player_id = requested_winner_id then 1 else 0 end,
    ranked_losses = rating.ranked_losses
      + case when rating.player_id = requested_winner_id then 0 else 1 end,
    rating_version = rating.rating_version + 1,
    rating_updated_at = now()
  where rating.player_id in (requested_player_a_id, requested_player_b_id);

  insert into private.rating_settlements (
    match_id, match_mode, player_a_id, player_b_id, winner_id, termination_reason,
    player_a_rating_before, player_b_rating_before,
    player_a_rating_after, player_b_rating_after,
    player_a_delta, player_b_delta, nominal_movement, effective_difference
  ) values (
    requested_match_id, requested_match_mode, requested_player_a_id, requested_player_b_id,
    requested_winner_id, requested_termination_reason, a_before, b_before, a_after, b_after,
    a_delta, b_delta, movement, capped_difference
  );

  return query select
    requested_match_id, requested_player_a_id, requested_player_b_id, requested_winner_id,
    a_before, b_before, a_after, b_after, a_delta, b_delta, movement, capped_difference,
    a_delta + b_delta <> 0;
end;
$$;

create or replace function public.get_ranked_leaderboard_top_100()
returns table (
  rank bigint,
  username text,
  discriminator text,
  rating integer,
  ranked_games integer,
  ranked_wins integer,
  ranked_losses integer,
  ranked_win_rate numeric,
  is_current_player boolean
) language plpgsql stable security definer set search_path = '' as $$
declare caller_player_id uuid := private.current_player_id();
begin
  if caller_player_id is null then
    raise exception 'canonical player required' using errcode = '42501';
  end if;
  return query
  with top_players as materialized (
    select player.player_id, player.display_name, player.public_discriminator,
      rating.multiplayer_rating, rating.rated_games, rating.ranked_wins,
      rating.ranked_losses, rating.ranked_win_rate
    from public.player_ratings rating
    join public.players player using (player_id)
    where rating.rated_games >= 1 and player.lifecycle = 'active'
    order by rating.multiplayer_rating desc, rating.ranked_wins desc,
      rating.ranked_win_rate desc, rating.rated_games desc, rating.player_id asc
    limit 100
  )
  select row_number() over (
      order by top.multiplayer_rating desc, top.ranked_wins desc,
        top.ranked_win_rate desc, top.rated_games desc, top.player_id asc
    ),
    top.display_name, top.public_discriminator, top.multiplayer_rating,
    top.rated_games, top.ranked_wins, top.ranked_losses, top.ranked_win_rate,
    top.player_id = caller_player_id
  from top_players top
  order by top.multiplayer_rating desc, top.ranked_wins desc,
    top.ranked_win_rate desc, top.rated_games desc, top.player_id asc;
end;
$$;

create or replace function public.get_current_player_ranked_rank()
returns table (
  qualified boolean,
  rank bigint,
  username text,
  discriminator text,
  rating integer,
  ranked_games integer,
  ranked_wins integer,
  ranked_losses integer,
  ranked_win_rate numeric,
  is_current_player boolean
) language plpgsql stable security definer set search_path = '' as $$
declare
  caller_player_id uuid := private.current_player_id();
  caller_player public.players%rowtype;
  caller_rating public.player_ratings%rowtype;
  caller_rank bigint;
begin
  select player.* into caller_player from public.players player
  where player.player_id = caller_player_id and player.lifecycle = 'active';
  select rating.* into caller_rating from public.player_ratings rating
  where rating.player_id = caller_player_id;
  if caller_player.player_id is null or caller_rating.player_id is null then
    raise exception 'canonical player required' using errcode = '42501';
  end if;
  if caller_rating.rated_games = 0 then
    return query select false, null::bigint, caller_player.display_name,
      caller_player.public_discriminator, caller_rating.multiplayer_rating,
      caller_rating.rated_games, caller_rating.ranked_wins, caller_rating.ranked_losses,
      caller_rating.ranked_win_rate, true;
    return;
  end if;

  select count(*) + 1 into caller_rank
  from public.player_ratings rating
  join public.players player using (player_id)
  where rating.rated_games >= 1 and player.lifecycle = 'active' and (
    rating.multiplayer_rating > caller_rating.multiplayer_rating
    or (rating.multiplayer_rating = caller_rating.multiplayer_rating
      and rating.ranked_wins > caller_rating.ranked_wins)
    or (rating.multiplayer_rating = caller_rating.multiplayer_rating
      and rating.ranked_wins = caller_rating.ranked_wins
      and rating.ranked_win_rate > caller_rating.ranked_win_rate)
    or (rating.multiplayer_rating = caller_rating.multiplayer_rating
      and rating.ranked_wins = caller_rating.ranked_wins
      and rating.ranked_win_rate = caller_rating.ranked_win_rate
      and rating.rated_games > caller_rating.rated_games)
    or (rating.multiplayer_rating = caller_rating.multiplayer_rating
      and rating.ranked_wins = caller_rating.ranked_wins
      and rating.ranked_win_rate = caller_rating.ranked_win_rate
      and rating.rated_games = caller_rating.rated_games
      and rating.player_id < caller_rating.player_id)
  );

  return query select true, caller_rank, caller_player.display_name,
    caller_player.public_discriminator, caller_rating.multiplayer_rating,
    caller_rating.rated_games, caller_rating.ranked_wins, caller_rating.ranked_losses,
    caller_rating.ranked_win_rate, true;
end;
$$;

revoke all on function private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)
  to service_role;

revoke all on function public.get_ranked_leaderboard_top_100()
  from public, anon, authenticated;
revoke all on function public.get_current_player_ranked_rank()
  from public, anon, authenticated;
grant execute on function public.get_ranked_leaderboard_top_100(),
  public.get_current_player_ranked_rank() to authenticated;

commit;
