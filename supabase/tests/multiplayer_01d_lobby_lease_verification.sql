-- Read-only catalog/runtime verification after applying MULTIPLAYER-01D migration.
with definitions as (
  select
    lower(pg_get_functiondef('public.list_open_multiplayer_lobbies()'::regprocedure)) as list_def,
    lower(pg_get_functiondef('public.join_multiplayer_lobby(uuid,text)'::regprocedure)) as join_def,
    lower(pg_get_functiondef('public.heartbeat_multiplayer_lobby(uuid)'::regprocedure)) as heartbeat_def,
    lower(pg_get_functiondef('public.trusted_reconcile_multiplayer_state(uuid)'::regprocedure)) as reconcile_def
)
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'private' and table_name = 'multiplayer_lobbies'
      and column_name = 'host_lease_expires_at'
  ) as lease_column_exists,
  position('host_lease_expires_at > now()' in list_def) > 0 as discovery_checks_lease,
  position('host_lease_expires_at <= now()' in join_def) > 0 as join_checks_lease,
  position('least(expires_at, now() + interval ''3 minutes'')' in heartbeat_def) > 0
    as heartbeat_is_bounded,
  position('host_lease_expires_at <= now()' in reconcile_def) > 0
    as reconcile_checks_lease,
  has_function_privilege('authenticated', 'public.heartbeat_multiplayer_lobby(uuid)', 'EXECUTE')
    as browser_can_call_narrow_heartbeat,
  not has_function_privilege('anon', 'public.heartbeat_multiplayer_lobby(uuid)', 'EXECUTE')
    as anon_heartbeat_denied,
  not has_function_privilege('authenticated', 'public.trusted_reconcile_multiplayer_state(uuid)', 'EXECUTE')
    as browser_trusted_reconcile_denied
from definitions;

select
  count(*) filter (where status in ('waiting', 'ready')) as open_lobby_count,
  count(*) filter (
    where status in ('waiting', 'ready')
      and (expires_at <= now() or host_lease_expires_at <= now())
  ) as expired_open_lobby_count,
  count(*) filter (
    where status in ('waiting', 'ready') and host_lease_expires_at > expires_at
  ) as lease_beyond_hard_ttl_count
from private.multiplayer_lobbies;

select
  count(*) filter (
    where membership.lobby_id is not null and lobby.lobby_id is null
  ) as orphan_lobby_membership_count,
  count(*) filter (
    where lobby.status = 'closed'
      or (lobby.status in ('waiting', 'ready')
        and (lobby.expires_at <= now() or lobby.host_lease_expires_at <= now()))
  ) as stale_pre_match_membership_count
from private.multiplayer_active_participants membership
left join private.multiplayer_lobbies lobby on lobby.lobby_id = membership.lobby_id
where membership.lobby_id is not null;
