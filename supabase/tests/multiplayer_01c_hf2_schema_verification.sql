select
  has_function_privilege('service_role', 'public.trusted_reconcile_multiplayer_state(uuid)', 'EXECUTE') as service_can_reconcile,
  not has_function_privilege('authenticated', 'public.trusted_reconcile_multiplayer_state(uuid)', 'EXECUTE') as browser_cannot_reconcile,
  not has_function_privilege('authenticated', 'public.get_current_multiplayer_context()', 'EXECUTE') as legacy_browser_context_disabled,
  exists (select 1 from pg_trigger where tgname = 'release_terminal_match_membership' and not tgisinternal) as terminal_cleanup_trigger,
  exists (select 1 from pg_trigger where tgname = 'release_closed_lobby_membership' and not tgisinternal) as lobby_cleanup_trigger;

select count(*) as remaining_stale_match_count,
  coalesce(bool_and(membership_count = 2), true) as remaining_stale_matches_have_two_memberships
from (
  select match.match_id, count(membership.player_id) as membership_count
  from private.multiplayer_matches match
  join private.multiplayer_lobbies lobby on lobby.lobby_id = match.lobby_id
  join private.multiplayer_active_participants membership
    on membership.match_id = match.match_id or membership.lobby_id = lobby.lobby_id
  where lobby.status = 'starting' and match.status = 'initializing'
    and match.updated_at < now() - interval '5 minutes'
  group by match.match_id
) stale;
