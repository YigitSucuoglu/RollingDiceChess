-- Run after 202608190003_multiplayer_01b_lobby_runtime.sql.
-- Catalog-only verification; no persistent rows are created.
select
  to_regclass('public.multiplayer_lobby_events') is not null
    as event_table_exists,
  to_regprocedure('public.get_current_multiplayer_context()') is not null
    as current_context_rpc_exists,
  to_regprocedure('public.get_multiplayer_lobby_snapshot(uuid)') is not null
    as participant_snapshot_rpc_exists,
  exists (
    select 1
    from pg_class relation
    where relation.oid = 'public.multiplayer_lobby_events'::regclass
      and relation.relrowsecurity
  ) as event_rls_enabled,
  has_table_privilege('authenticated', 'public.multiplayer_lobby_events', 'select')
    and not has_table_privilege('authenticated', 'public.multiplayer_lobby_events', 'insert')
    and not has_table_privilege('authenticated', 'public.multiplayer_lobby_events', 'update')
    and not has_table_privilege('authenticated', 'public.multiplayer_lobby_events', 'delete')
    as browser_event_privileges_safe,
  has_function_privilege(
    'authenticated', 'public.get_current_multiplayer_context()', 'execute'
  ) as current_context_callable,
  has_function_privilege(
    'authenticated', 'public.get_multiplayer_lobby_snapshot(uuid)', 'execute'
  ) as participant_snapshot_callable,
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'multiplayer_lobby_events'
  ) as event_realtime_enabled,
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'private.multiplayer_lobbies'::regclass
      and tgname = 'multiplayer_lobby_event_trigger'
      and not tgisinternal
  ) as event_trigger_exists;

select
  not has_table_privilege('anon', 'public.multiplayer_lobby_events', 'select')
    as anonymous_event_read_denied,
  not has_function_privilege(
    'anon', 'public.get_current_multiplayer_context()', 'execute'
  ) as anonymous_context_denied,
  not has_function_privilege(
    'anon', 'public.get_multiplayer_lobby_snapshot(uuid)', 'execute'
  ) as anonymous_snapshot_denied;
