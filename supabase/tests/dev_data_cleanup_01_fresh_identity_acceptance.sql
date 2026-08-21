-- DEV-DATA-CLEANUP-01 fresh account/Guest acceptance. READ-ONLY.
-- Run after clean-context Google restoration and fresh cloud Guest creation.

with identity_rows as (
  select
    player.player_id,
    player.display_name,
    player.public_discriminator,
    player.ownership_kind,
    player.lifecycle,
    player.superseded_by,
    player.username_onboarding_required,
    progression.total_xp,
    progression.games_played,
    progression.wins,
    progression.losses,
    rating.multiplayer_rating,
    rating.rated_games,
    auth_user.is_anonymous,
    not exists (
      select 1 from public.player_piece_statistics stats
      where stats.player_id = player.player_id
        and (stats.rolls <> 0 or stats.moves <> 0 or stats.captures <> 0)
    ) as piece_statistics_zero,
    (select count(*) from public.local_profile_bootstraps bootstrap
      where bootstrap.player_id = player.player_id) as bootstrap_count,
    (select count(*) from public.player_progression_operations operation
      where operation.player_id = player.player_id) as operation_count
  from public.players player
  join public.player_auth_owners owner using (player_id)
  join auth.users auth_user on auth_user.id = owner.auth_user_id
  join public.player_progression progression using (player_id)
  join public.player_ratings rating using (player_id)
  where player.lifecycle = 'active'
)
select
  encode(substring(extensions.digest(identity.player_id::text, 'sha256') from 1 for 6), 'hex')
    as player_fingerprint,
  identity.display_name,
  identity.public_discriminator,
  identity.ownership_kind,
  identity.is_anonymous,
  identity.username_onboarding_required,
  identity.total_xp,
  identity.games_played,
  identity.wins,
  identity.losses,
  identity.multiplayer_rating,
  identity.rated_games,
  identity.piece_statistics_zero,
  identity.bootstrap_count,
  identity.operation_count,
  (
    identity.lifecycle = 'active'
    and identity.superseded_by is null
    and identity.total_xp = 0
    and identity.games_played = 0
    and identity.wins = 0
    and identity.losses = 0
    and identity.multiplayer_rating = 1000
    and identity.rated_games = 0
    and identity.piece_statistics_zero
    and identity.operation_count = 0
    and (
      (identity.ownership_kind = 'account'
        and not identity.is_anonymous
        and not identity.username_onboarding_required
        and identity.bootstrap_count = 0)
      or
      (identity.ownership_kind = 'guest'
        and identity.is_anonymous
        and identity.display_name ~ '^Guest[0-9]{4}$')
    )
  ) as identity_acceptance_pass
from identity_rows identity
order by identity.ownership_kind, identity.display_name;

select
  count(*) filter (where player.ownership_kind = 'account' and player.lifecycle = 'active')
    as active_accounts,
  count(*) filter (where player.ownership_kind = 'guest' and player.lifecycle = 'active')
    as active_guests,
  (select count(*) from private.multiplayer_lobbies) as multiplayer_lobbies,
  (select count(*) from private.multiplayer_matches) as multiplayer_matches,
  (select count(*) from private.multiplayer_active_participants) as active_memberships,
  (select count(*) from public.multiplayer_lobby_events) as lobby_events,
  (select count(*) from public.multiplayer_match_events) as match_events,
  (select count(*) from private.rating_settlements) as rating_settlements
from public.players player;

