-- DEV-DATA-CLEANUP-01 post-reset verification. READ-ONLY.
select
  (select count(*) from auth.users) as auth_users_total,
  (select count(*) from auth.identities) as auth_identities_total,
  (select count(*) from public.players) as players_total,
  (select count(*) from public.player_auth_owners) as player_auth_owners,
  (select count(*) from public.player_progression) as player_progression,
  (select count(*) from public.player_piece_statistics) as player_piece_statistics,
  (select count(*) from public.player_ratings) as player_ratings,
  (select count(*) from public.player_progression_operations) as progression_operations,
  (select count(*) from public.local_profile_bootstraps) as local_profile_bootstraps,
  (select count(*) from public.player_migration_intents) as player_migration_intents,
  (select count(*) from private.rating_settlements) as rating_settlements,
  (select count(*) from private.multiplayer_lobbies) as multiplayer_lobbies,
  (select count(*) from private.multiplayer_matches) as multiplayer_matches,
  (select count(*) from private.multiplayer_active_participants) as active_memberships,
  (select count(*) from private.multiplayer_private_join_attempts) as private_join_attempts,
  (select count(*) from public.multiplayer_lobby_events) as lobby_events,
  (select count(*) from public.multiplayer_match_events) as match_events,
  (select count(*) from private.multiplayer_matches match
    join private.multiplayer_lobbies lobby using (lobby_id)
    where lobby.status = 'starting' and match.status = 'initializing'
      and match.updated_at < now() - interval '5 minutes') as stale_multiplayer_matches;

select
  to_regclass('public.players') is not null as player_schema_preserved,
  to_regprocedure('private.allocate_public_discriminator(text[])') is not null
    as discriminator_allocator_preserved,
  to_regprocedure('public.trusted_resolve_multiplayer_player(uuid)') is not null
    as trusted_player_resolver_preserved,
  to_regprocedure('public.trusted_reconcile_multiplayer_state(uuid)') is not null
    as stale_reconciliation_preserved,
  coalesce((select column_default = '1000' from information_schema.columns
    where table_schema = 'public' and table_name = 'player_ratings'
      and column_name = 'multiplayer_rating'), false) as rating_default_preserved,
  exists(select 1 from pg_trigger where tgname = 'roulettechess_on_auth_user_created'
    and not tgisinternal) as auth_bootstrap_trigger_preserved,
  not has_function_privilege('authenticated',
    'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE')
    as browser_trusted_resolver_denied,
  not has_table_privilege('authenticated', 'public.player_ratings', 'UPDATE')
    as browser_rating_update_denied;

select 'auth-user-without-player-owner' as anomaly, count(*) as row_count
from auth.users auth_user
left join public.player_auth_owners owner on owner.auth_user_id = auth_user.id
where owner.auth_user_id is null
union all
select 'owner-without-auth-user', count(*)
from public.player_auth_owners owner left join auth.users auth_user on auth_user.id = owner.auth_user_id
where auth_user.id is null
union all
select 'owner-without-player', count(*)
from public.player_auth_owners owner left join public.players player using (player_id)
where player.player_id is null
union all
select 'membership-without-runtime-parent', count(*)
from private.multiplayer_active_participants membership
left join private.multiplayer_lobbies lobby on lobby.lobby_id = membership.lobby_id
left join private.multiplayer_matches match on match.match_id = membership.match_id
where (membership.lobby_id is not null and lobby.lobby_id is null)
   or (membership.match_id is not null and match.match_id is null)
union all
select 'rating-settlement-without-player', count(*)
from private.rating_settlements settlement
left join public.players player_a on player_a.player_id = settlement.player_a_id
left join public.players player_b on player_b.player_id = settlement.player_b_id
where player_a.player_id is null or player_b.player_id is null
order by anomaly;
