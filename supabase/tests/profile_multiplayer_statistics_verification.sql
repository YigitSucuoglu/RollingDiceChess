begin;

do $$
declare recorder_definition text; settlement_definition text; profile_definition text;
begin
  if not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'player_ratings'
      and column_name = 'unranked_games' and data_type = 'integer') then
    raise exception 'canonical unranked_games counter is missing';
  end if;
  if not exists (select 1 from pg_constraint
    where conrelid = 'public.player_ratings'::regclass
      and conname = 'player_ratings_unranked_games_nonnegative' and convalidated) then
    raise exception 'unranked_games nonnegative invariant is missing';
  end if;
  if not (select relrowsecurity from pg_class
    where oid = 'private.unranked_match_completions'::regclass) then
    raise exception 'unranked completion ledger RLS is disabled';
  end if;
  if has_table_privilege('anon', 'private.unranked_match_completions', 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'private.unranked_match_completions', 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('anon', 'public.player_ratings', 'UPDATE')
      or has_table_privilege('authenticated', 'public.player_ratings', 'UPDATE') then
    raise exception 'browser can access canonical multiplayer mutation state';
  end if;
  select pg_get_functiondef('private.record_unranked_match_completion(private.multiplayer_matches)'::regprocedure)
    into recorder_definition;
  if recorder_definition not like '%on conflict (match_id) do nothing%'
      or recorder_definition not like '%inserted_count = row_count%' then
    raise exception 'unranked exactly-once recorder contract is incorrect';
  end if;
  select pg_get_functiondef('private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)'::regprocedure)
    into settlement_definition;
  if settlement_definition not like '%private.settle_ranked_match%'
      or settlement_definition not like '%private.record_unranked_match_completion%' then
    raise exception 'terminal settlement boundary does not preserve both modes';
  end if;
  select pg_get_functiondef('private.current_player_profile_json()'::regprocedure)
    into profile_definition;
  if profile_definition not like '%unrankedGames%'
      or profile_definition not like '%rankedWinRate%'
      or profile_definition not like '%rankedWins%'
      or profile_definition not like '%rankedLosses%' then
    raise exception 'profile multiplayer read contract is incomplete';
  end if;
end;
$$;

insert into public.players (player_id, display_name, ownership_kind) values
  ('f5000000-0000-4000-8000-000000000001', 'Guest9501', 'guest'),
  ('f5000000-0000-4000-8000-000000000002', 'Guest9502', 'guest');
insert into public.player_ratings (player_id) values
  ('f5000000-0000-4000-8000-000000000001'),
  ('f5000000-0000-4000-8000-000000000002');

insert into private.multiplayer_lobbies (
  lobby_id, host_player_id, opponent_player_id, visibility, mode, side_preference,
  time_control_id, initial_ms, increment_ms, status, private_code
) values
  ('f5000000-0000-4000-8000-000000000011', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'public', 'unranked', 'white', 'rapid-10-0', 600000, 0, 'closed', null),
  ('f5000000-0000-4000-8000-000000000012', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'private', 'ranked', 'random', 'rapid-10-0', 600000, 0, 'closed', '950012'),
  ('f5000000-0000-4000-8000-000000000013', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'private', 'unranked', 'black', 'rapid-10-0', 600000, 0, 'closed', '950013'),
  ('f5000000-0000-4000-8000-000000000014', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'public', 'unranked', 'random', 'rapid-10-0', 600000, 0, 'closed', null),
  ('f5000000-0000-4000-8000-000000000015', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'private', 'unranked', 'white', 'rapid-10-0', 600000, 0, 'closed', '950015'),
  ('f5000000-0000-4000-8000-000000000016', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'public', 'unranked', 'black', 'rapid-10-0', 600000, 0, 'closed', null);

insert into private.multiplayer_matches (
  match_id, lobby_id, player_a_id, player_b_id, white_player_id, black_player_id,
  mode, time_control_id, initial_ms, increment_ms, status, revision,
  winner_player_id, termination_reason
) values
  ('f5000000-0000-4000-8000-000000000021', 'f5000000-0000-4000-8000-000000000011', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'unranked', 'rapid-10-0', 600000, 0, 'terminal', 2, 'f5000000-0000-4000-8000-000000000001', 'king-captured'),
  ('f5000000-0000-4000-8000-000000000022', 'f5000000-0000-4000-8000-000000000012', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'ranked', 'rapid-10-0', 600000, 0, 'terminal', 2, 'f5000000-0000-4000-8000-000000000001', 'timeout'),
  ('f5000000-0000-4000-8000-000000000023', 'f5000000-0000-4000-8000-000000000013', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'unranked', 'rapid-10-0', 600000, 0, 'technical-abort', 2, null, 'technical-abort'),
  ('f5000000-0000-4000-8000-000000000024', 'f5000000-0000-4000-8000-000000000014', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'unranked', 'rapid-10-0', 600000, 0, 'terminal', 2, 'f5000000-0000-4000-8000-000000000002', 'timeout'),
  ('f5000000-0000-4000-8000-000000000025', 'f5000000-0000-4000-8000-000000000015', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'unranked', 'rapid-10-0', 600000, 0, 'terminal', 2, 'f5000000-0000-4000-8000-000000000001', 'forfeit'),
  ('f5000000-0000-4000-8000-000000000026', 'f5000000-0000-4000-8000-000000000016', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002', 'unranked', 'rapid-10-0', 600000, 0, 'terminal', 2, 'f5000000-0000-4000-8000-000000000002', 'disconnect-forfeit');

do $$
declare unranked_match private.multiplayer_matches%rowtype;
  ranked_match private.multiplayer_matches%rowtype;
  technical_match private.multiplayer_matches%rowtype;
  first_recorded boolean; replay_recorded boolean;
begin
  select * into unranked_match from private.multiplayer_matches where match_id = 'f5000000-0000-4000-8000-000000000021';
  select * into ranked_match from private.multiplayer_matches where match_id = 'f5000000-0000-4000-8000-000000000022';
  select * into technical_match from private.multiplayer_matches where match_id = 'f5000000-0000-4000-8000-000000000023';
  first_recorded := private.record_unranked_match_completion(unranked_match);
  replay_recorded := private.record_unranked_match_completion(unranked_match);
  perform private.settle_multiplayer_match_if_eligible(candidate)
    from private.multiplayer_matches candidate
    where candidate.match_id in (
      'f5000000-0000-4000-8000-000000000024',
      'f5000000-0000-4000-8000-000000000025',
      'f5000000-0000-4000-8000-000000000026'
    );
  perform private.settle_multiplayer_match_if_eligible(ranked_match);
  perform private.settle_multiplayer_match_if_eligible(technical_match);
  if not first_recorded or replay_recorded then raise exception 'unranked replay was not idempotent'; end if;
  if (select count(*) from private.unranked_match_completions where match_id = unranked_match.match_id) <> 1 then
    raise exception 'unranked completion ledger cardinality is incorrect';
  end if;
  if exists (select 1 from public.player_ratings where player_id in (
      'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002'
    ) and unranked_games <> 4) then
    raise exception 'completed unranked match did not increment both participants exactly once';
  end if;
  if (select count(*) from private.rating_settlements where match_id = ranked_match.match_id) <> 1
      or exists (select 1 from private.unranked_match_completions where match_id in (ranked_match.match_id, technical_match.match_id)) then
    raise exception 'ranked or technical result contaminated unranked activity';
  end if;
end;
$$;

select
  (select count(*) = 4 from private.unranked_match_completions
    where match_id in ('f5000000-0000-4000-8000-000000000021','f5000000-0000-4000-8000-000000000024','f5000000-0000-4000-8000-000000000025','f5000000-0000-4000-8000-000000000026')) as replay_exactly_once,
  (select bool_and(unranked_games = 4) from public.player_ratings where player_id in (
    'f5000000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000002')) as both_participants_incremented,
  not has_table_privilege('authenticated', 'public.player_ratings', 'UPDATE') as browser_counter_mutation_denied,
  not has_table_privilege('authenticated', 'private.unranked_match_completions', 'SELECT') as browser_ledger_access_denied,
  pg_get_functiondef('private.current_player_profile_json()'::regprocedure) like '%unrankedGames%' as profile_contract_extended,
  pg_get_functiondef('private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)'::regprocedure) like '%private.settle_ranked_match%' as ranked_settlement_preserved;

rollback;
