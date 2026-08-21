-- DEV-DATA-CLEANUP-01 / PHASE 1
-- READ-ONLY ADMIN INVENTORY. This file contains SELECT statements only.
-- Run in the Supabase SQL Editor before reviewing any destructive reset plan.

-- 1. Auth and identity totals.
select
  count(*) as auth_users_total,
  count(*) filter (where coalesce(is_anonymous, false)) as anonymous_auth_users,
  count(*) filter (where not coalesce(is_anonymous, false)) as permanent_auth_users
from auth.users;

select provider, count(*) as identity_count
from auth.identities
group by provider
order by provider;

-- 2. Application player totals and lifecycle/ownership distribution.
select
  count(*) as players_total,
  count(*) filter (where lifecycle = 'active') as active_players,
  count(*) filter (where lifecycle = 'retired') as retired_players,
  count(*) filter (where superseded_by is not null) as replaced_players,
  count(*) filter (where ownership_kind = 'account') as account_players,
  count(*) filter (where ownership_kind = 'guest') as guest_players
from public.players;

select
  (select count(*) from public.player_auth_owners) as player_auth_owners,
  (select count(*) from public.player_progression) as player_progression,
  (select count(*) from public.player_piece_statistics) as player_piece_statistics,
  (select count(*) from public.player_ratings) as player_ratings,
  (select count(*) from public.player_progression_operations) as progression_operations,
  (select count(*) from public.local_profile_bootstraps) as local_profile_bootstraps,
  (select count(*) from public.player_migration_intents) as player_migration_intents,
  (select count(*) from private.rating_settlements) as rating_settlements;

-- 3. Human-readable per-player inventory. UUIDs are included only in this
-- admin result so ownership/FK relationships can be reviewed before reset.
select
  player.player_id,
  player.display_name,
  player.public_discriminator,
  player.ownership_kind,
  player.lifecycle,
  player.superseded_by,
  player.username_onboarding_required,
  rating.multiplayer_rating,
  progression.total_xp,
  count(distinct membership.player_id) as active_multiplayer_membership_count,
  owner.auth_user_id is not null as owner_row_exists,
  auth_user.id is not null as auth_user_exists,
  coalesce(auth_user.is_anonymous, false) as auth_user_is_anonymous,
  exists (
    select 1 from auth.identities identity
    where identity.user_id = owner.auth_user_id and identity.provider = 'google'
  ) as google_identity_exists
from public.players player
left join public.player_auth_owners owner using (player_id)
left join auth.users auth_user on auth_user.id = owner.auth_user_id
left join public.player_ratings rating using (player_id)
left join public.player_progression progression using (player_id)
left join private.multiplayer_active_participants membership using (player_id)
group by player.player_id, player.display_name, player.public_discriminator,
  player.ownership_kind, player.lifecycle, player.superseded_by,
  player.username_onboarding_required, rating.multiplayer_rating,
  progression.total_xp, owner.auth_user_id, auth_user.id, auth_user.is_anonymous
order by player.lifecycle, player.ownership_kind, player.display_name,
  player.public_discriminator;

-- 4. Multiplayer runtime inventory.
select status::text as lobby_status, visibility::text as visibility, count(*) as lobby_count
from private.multiplayer_lobbies
group by status, visibility
order by status, visibility;

select status::text as match_status, count(*) as match_count,
  count(*) filter (where canonical_state is not null) as canonical_snapshot_count,
  count(*) filter (where current_roll is not null) as current_roll_count,
  count(*) filter (where current_turn is not null) as current_turn_count,
  count(*) filter (where white_reconnect_deadline is not null
    or black_reconnect_deadline is not null) as reconnect_deadline_count
from private.multiplayer_matches
group by status
order by status;

select
  (select count(*) from private.multiplayer_active_participants) as active_memberships,
  (select count(*) from private.multiplayer_private_join_attempts) as private_join_attempts,
  (select count(*) from public.multiplayer_lobby_events) as lobby_events,
  (select count(*) from public.multiplayer_match_events) as match_events,
  (select count(*) from private.multiplayer_matches
    where status = 'technical-abort') as technical_abort_matches,
  (select count(*) from private.multiplayer_matches
    where status = 'terminal') as terminal_matches;

-- Canonical stale-starting baseline, counted per match rather than membership.
select count(*) as stale_multiplayer_match_count
from private.multiplayer_matches match
join private.multiplayer_lobbies lobby using (lobby_id)
where lobby.status = 'starting'
  and match.status = 'initializing'
  and match.updated_at < now() - interval '5 minutes';

-- 5. Structural and semantic orphan inventory.
select 'player-owner-without-auth-user' as anomaly, count(*) as row_count
from public.player_auth_owners owner
left join auth.users auth_user on auth_user.id = owner.auth_user_id
where auth_user.id is null
union all
select 'auth-user-without-player-owner', count(*)
from auth.users auth_user
left join public.player_auth_owners owner on owner.auth_user_id = auth_user.id
where owner.auth_user_id is null
union all
select 'owner-without-player', count(*)
from public.player_auth_owners owner
left join public.players player using (player_id)
where player.player_id is null
union all
select 'progression-without-player', count(*)
from public.player_progression progression
left join public.players player using (player_id)
where player.player_id is null
union all
select 'rating-without-player', count(*)
from public.player_ratings rating
left join public.players player using (player_id)
where player.player_id is null
union all
select 'progression-operation-without-player', count(*)
from public.player_progression_operations operation
left join public.players player using (player_id)
where player.player_id is null
union all
select 'membership-without-player', count(*)
from private.multiplayer_active_participants membership
left join public.players player using (player_id)
where player.player_id is null
union all
select 'membership-without-lobby-or-match', count(*)
from private.multiplayer_active_participants membership
left join private.multiplayer_lobbies lobby on lobby.lobby_id = membership.lobby_id
left join private.multiplayer_matches match on match.match_id = membership.match_id
where (membership.lobby_id is not null and lobby.lobby_id is null)
   or (membership.match_id is not null and match.match_id is null)
union all
select 'closed-lobby-with-membership', count(*)
from private.multiplayer_active_participants membership
join private.multiplayer_lobbies lobby on lobby.lobby_id = membership.lobby_id
where lobby.status = 'closed'
union all
select 'terminal-match-with-membership', count(*)
from private.multiplayer_active_participants membership
join private.multiplayer_matches match on match.match_id = membership.match_id
where match.status in ('terminal', 'technical-abort')
union all
select 'rating-settlement-without-match', count(*)
from private.rating_settlements settlement
left join private.multiplayer_matches match using (match_id)
where match.match_id is null
union all
select 'migration-without-guest-player', count(*)
from public.player_migration_intents migration
left join public.players player on player.player_id = migration.guest_player_id
where player.player_id is null
union all
select 'migration-without-guest-auth-user', count(*)
from public.player_migration_intents migration
left join auth.users auth_user on auth_user.id = migration.guest_auth_user_id
where auth_user.id is null
union all
select 'resolved-migration-without-survivor', count(*)
from public.player_migration_intents migration
left join public.players player on player.player_id = migration.surviving_player_id
where migration.resolved_at is not null and player.player_id is null
union all
select 'lobby-event-without-lobby', count(*)
from public.multiplayer_lobby_events event
left join private.multiplayer_lobbies lobby using (lobby_id)
where event.lobby_id is not null and lobby.lobby_id is null
union all
select 'match-event-without-match', count(*)
from public.multiplayer_match_events event
left join private.multiplayer_matches match using (match_id)
where match.match_id is null
order by anomaly;

-- 6. Catalog discovery: all non-system tables carrying identity/runtime keys.
-- Review this result for tables added after this script was authored.
select table_schema, table_name,
  string_agg(column_name, ', ' order by ordinal_position) as relevant_columns
from information_schema.columns
where table_schema in ('public', 'private')
  and column_name in (
    'player_id', 'auth_user_id', 'guest_auth_user_id', 'account_auth_user_id',
    'guest_player_id', 'surviving_player_id', 'player_a_id', 'player_b_id',
    'host_player_id', 'opponent_player_id', 'winner_player_id',
    'recipient_player_id', 'lobby_id', 'match_id', 'migration_id'
  )
group by table_schema, table_name
order by table_schema, table_name;

-- 7. Actual FK graph needed to design Phase 2 deletion order safely.
select
  source_namespace.nspname as source_schema,
  source_table.relname as source_table,
  constraint_row.conname as constraint_name,
  target_namespace.nspname as target_schema,
  target_table.relname as target_table,
  case constraint_row.confdeltype
    when 'a' then 'NO ACTION'
    when 'r' then 'RESTRICT'
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
  end as on_delete
from pg_constraint constraint_row
join pg_class source_table on source_table.oid = constraint_row.conrelid
join pg_namespace source_namespace on source_namespace.oid = source_table.relnamespace
join pg_class target_table on target_table.oid = constraint_row.confrelid
join pg_namespace target_namespace on target_namespace.oid = target_table.relnamespace
where constraint_row.contype = 'f'
  and source_namespace.nspname in ('public', 'private')
  and target_namespace.nspname in ('public', 'private', 'auth')
order by target_schema, target_table, source_schema, source_table, constraint_name;
