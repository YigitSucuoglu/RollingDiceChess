select
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'multiplayer_lobby_events'
      and policyname = 'multiplayer_lobby_events_read_safe'
      and 'authenticated' = any(roles)
      and cmd = 'SELECT'
      and qual ilike '%player_auth_owners%'
      and qual ilike '%auth.uid%'
      and qual not ilike '%current_player_id%'
  ) as participant_event_policy_safe,
  not has_function_privilege(
    'authenticated', 'private.current_player_id()', 'execute'
  ) as private_identity_helper_still_denied,
  has_table_privilege(
    'authenticated', 'public.multiplayer_lobby_events', 'select'
  ) and not has_table_privilege(
    'authenticated', 'public.multiplayer_lobby_events', 'insert'
  ) as event_table_remains_read_only;
