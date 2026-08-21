-- Read-only production diagnosis for MULTIPLAYER-01C-HF2-DIAG2.
-- Identifies the public Yigit #HMORC profile without returning raw UUIDs.
with target as (
  select player_id, display_name, public_discriminator, ownership_kind, lifecycle,
    superseded_by, username_onboarding_required
  from public.players
  where display_name = 'Yigit' and public_discriminator = 'HMORC'
), owner as (
  select ownership.auth_user_id, ownership.player_id
  from public.player_auth_owners ownership
  join target on target.player_id = ownership.player_id
)
select
  (select count(*) from target) as matching_player_count,
  (select ownership_kind::text from target limit 1) as ownership_kind,
  (select lifecycle::text from target limit 1) as lifecycle,
  coalesce((select superseded_by is not null from target limit 1), false) as is_superseded,
  (select username_onboarding_required from target limit 1) as username_onboarding_required,
  exists(select 1 from owner) as owner_row_exists,
  exists(select 1 from owner join auth.users users on users.id = owner.auth_user_id) as auth_user_exists,
  coalesce((select users.is_anonymous from owner
    join auth.users users on users.id = owner.auth_user_id limit 1), false) as auth_user_is_anonymous,
  exists(select 1 from owner join auth.identities identity on identity.user_id = owner.auth_user_id
    where identity.provider = 'google') as google_identity_exists,
  (select left(encode(extensions.digest(owner.auth_user_id::text, 'sha256'), 'hex'), 10)
    from owner limit 1) as owner_auth_fingerprint,
  exists(select 1 from target join public.player_progression progression using (player_id)) as progression_exists,
  exists(select 1 from target join public.player_ratings rating using (player_id)) as rating_exists,
  (select count(*) from target join private.multiplayer_active_participants membership using (player_id))
    as active_membership_count,
  (select count(*) from target join public.player_migration_intents migration
    on migration.surviving_player_id = target.player_id and migration.resolved_at is not null)
    as resolved_survivor_migration_count;
