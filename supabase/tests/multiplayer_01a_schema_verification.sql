begin;

do $$
declare
  join_definition text;
  start_definition text;
  activate_definition text;
begin
  if not exists (select 1 from pg_class where oid = 'private.multiplayer_lobbies'::regclass and relrowsecurity)
      or not exists (select 1 from pg_class where oid = 'private.multiplayer_matches'::regclass and relrowsecurity)
      or not exists (select 1 from pg_class where oid = 'private.multiplayer_active_participants'::regclass and relrowsecurity) then
    raise exception 'multiplayer authority tables must have RLS enabled';
  end if;
  if not exists (
    select 1 from pg_indexes where schemaname = 'private'
      and indexname = 'multiplayer_active_private_code_unique'
      and indexdef like '%private_code%WHERE%'
  ) then raise exception 'active private-code uniqueness index is missing'; end if;

  select pg_get_functiondef('public.join_multiplayer_lobby(uuid,text)'::regprocedure) into join_definition;
  select pg_get_functiondef('public.request_multiplayer_match_start(uuid)'::regprocedure) into start_definition;
  select pg_get_functiondef('private.activate_multiplayer_match(uuid,jsonb)'::regprocedure) into activate_definition;
  if position('for update' in lower(join_definition)) = 0
      or position('status <> ''waiting''' in lower(join_definition)) = 0 then
    raise exception 'atomic first-write-wins join guard is missing';
  end if;
  if position('host authorization required' in lower(start_definition)) = 0
      or position('status <> ''ready''' in lower(start_definition)) = 0 then
    raise exception 'host start authorization/state guard is missing';
  end if;
  if position('random()' in lower(activate_definition)) = 0
      or position('current_roll' in lower(activate_definition)) = 0
      or position('status = ''active''' in lower(activate_definition)) = 0 then
    raise exception 'trusted activation does not own side/RNG/ACTIVE state';
  end if;
end;
$$;

do $$
begin
  if has_table_privilege('anon', 'private.multiplayer_lobbies', 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'private.multiplayer_lobbies', 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('anon', 'private.multiplayer_matches', 'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated', 'private.multiplayer_matches', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'browser role has direct multiplayer authority-table privileges';
  end if;
  if has_function_privilege('anon', 'private.activate_multiplayer_match(uuid,jsonb)', 'EXECUTE')
      or has_function_privilege('authenticated', 'private.activate_multiplayer_match(uuid,jsonb)', 'EXECUTE') then
    raise exception 'browser role can activate a match';
  end if;
  if not has_function_privilege('service_role', 'private.activate_multiplayer_match(uuid,jsonb)', 'EXECUTE') then
    raise exception 'trusted service role cannot activate a match';
  end if;
  if has_function_privilege('anon', 'public.create_multiplayer_lobby(public.multiplayer_lobby_visibility,public.multiplayer_mode,public.multiplayer_side_preference,text,integer,integer)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.create_multiplayer_lobby(public.multiplayer_lobby_visibility,public.multiplayer_mode,public.multiplayer_side_preference,text,integer,integer)', 'EXECUTE') then
    raise exception 'lobby intent RPC role grants are incorrect';
  end if;
end;
$$;

insert into public.players (player_id, display_name, ownership_kind) values
  ('f2000000-0000-4000-8000-000000000001', 'Guest9101', 'guest'),
  ('f2000000-0000-4000-8000-000000000002', 'Guest9102', 'guest'),
  ('f2000000-0000-4000-8000-000000000003', 'Guest9103', 'guest');
insert into public.player_ratings(player_id) values
  ('f2000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-000000000003');

insert into private.multiplayer_lobbies (
  lobby_id, host_player_id, opponent_player_id, visibility, mode, side_preference,
  time_control_id, initial_ms, increment_ms, status, private_code
) values (
  'f2000000-0000-4000-8000-000000000010',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'private', 'ranked', 'random', 'blitz-5-1', 300000, 1000, 'starting', '004921'
), (
  'f2000000-0000-4000-8000-000000000011',
  'f2000000-0000-4000-8000-000000000003', null,
  'public', 'unranked', 'white', 'rapid-10-0', 600000, 0, 'waiting', null
);
insert into private.multiplayer_matches (
  match_id, lobby_id, player_a_id, player_b_id, mode,
  time_control_id, initial_ms, increment_ms
) values (
  'f2000000-0000-4000-8000-000000000020',
  'f2000000-0000-4000-8000-000000000010',
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'ranked', 'blitz-5-1', 300000, 1000
);
insert into private.multiplayer_active_participants(player_id, lobby_id) values
  ('f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000010'),
  ('f2000000-0000-4000-8000-000000000002', 'f2000000-0000-4000-8000-000000000010'),
  ('f2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000011');

do $$
declare
  activated private.multiplayer_matches%rowtype;
  replayed private.multiplayer_matches%rowtype;
begin
  activated := private.activate_multiplayer_match(
    'f2000000-0000-4000-8000-000000000020',
    '{"board":"trusted-engine-initial-state","remainingRights":{}}'::jsonb
  );
  replayed := private.activate_multiplayer_match(
    'f2000000-0000-4000-8000-000000000020',
    '{"ignored":"idempotent-replay"}'::jsonb
  );
  if activated.status <> 'active' or activated.revision <> 1
      or cardinality(activated.current_roll) <> 3
      or activated.current_turn <> 'white'
      or activated.realtime_topic <> 'match:f2000000-0000-4000-8000-000000000020'
      or activated.white_player_id is null or activated.black_player_id is null
      or activated.white_remaining_ms <> 300000 or activated.black_remaining_ms <> 300000
      or replayed.revision <> 1 then
    raise exception 'trusted match activation invariant failed';
  end if;
  if (select status from private.multiplayer_lobbies
      where lobby_id = 'f2000000-0000-4000-8000-000000000010') <> 'closed' then
    raise exception 'activated lobby was not closed';
  end if;
  if (select count(*) from private.multiplayer_active_participants
      where match_id = 'f2000000-0000-4000-8000-000000000020' and lobby_id is null) <> 2 then
    raise exception 'participants were not atomically rebound to match';
  end if;
end;
$$;

select
  (select count(*) from public.list_open_multiplayer_lobbies()
    where lobby_id = 'f2000000-0000-4000-8000-000000000011') as public_waiting_visible,
  (select count(*) from public.list_open_multiplayer_lobbies()
    where lobby_id = 'f2000000-0000-4000-8000-000000000010') as private_or_filled_hidden,
  not has_function_privilege('authenticated', 'private.activate_multiplayer_match(uuid,jsonb)', 'EXECUTE')
    as browser_activation_denied,
  has_function_privilege('service_role', 'private.activate_multiplayer_match(uuid,jsonb)', 'EXECUTE')
    as trusted_activation_enabled,
  (select current_roll from private.multiplayer_matches
    where match_id = 'f2000000-0000-4000-8000-000000000020') as server_roll;

rollback;
