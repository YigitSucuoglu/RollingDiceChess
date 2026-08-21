-- PROFILE-IDENTITY-01B-HF2 final remote acceptance. READ-ONLY.
-- Returns no raw Auth user ID or PlayerId.

with canonical_account as (
  select
    player.player_id,
    owner.auth_user_id,
    player.display_name,
    player.public_discriminator,
    player.username_onboarding_required,
    player.lifecycle,
    player.superseded_by,
    progression.total_xp,
    progression.games_played,
    progression.wins,
    progression.losses,
    progression.current_win_streak,
    progression.best_win_streak,
    progression.total_play_time_seconds,
    progression.kings_captured,
    progression.roulette_rolls,
    progression.player_turns_completed,
    progression.three_rights_turns,
    progression.triple_pawn_rolls,
    progression.triple_knight_rolls,
    progression.triple_queen_rolls,
    rating.multiplayer_rating,
    rating.rated_games,
    rating.rating_version
  from public.players player
  join public.player_auth_owners owner using (player_id)
  join auth.users auth_user on auth_user.id = owner.auth_user_id
  join public.player_progression progression using (player_id)
  join public.player_ratings rating using (player_id)
  where player.ownership_kind = 'account'
    and not coalesce(auth_user.is_anonymous, false)
    and player.lifecycle = 'active'
),
account_result as (
  select
    encode(substring(extensions.digest(account.auth_user_id::text, 'sha256') from 1 for 6), 'hex')
      as auth_fingerprint,
    encode(substring(extensions.digest(account.player_id::text, 'sha256') from 1 for 6), 'hex')
      as player_fingerprint,
    account.display_name as username,
    account.public_discriminator,
    account.username_onboarding_required,
    account.lifecycle,
    account.superseded_by is null as is_canonical,
    account.total_xp,
    account.games_played,
    account.wins,
    account.losses,
    account.current_win_streak,
    account.best_win_streak,
    account.total_play_time_seconds,
    account.kings_captured,
    account.roulette_rolls,
    account.player_turns_completed,
    account.three_rights_turns,
    account.triple_pawn_rolls,
    account.triple_knight_rolls,
    account.triple_queen_rolls,
    account.multiplayer_rating,
    account.rated_games,
    account.rating_version,
    not exists (
      select 1 from public.player_piece_statistics stats
      where stats.player_id = account.player_id
        and (stats.rolls <> 0 or stats.moves <> 0 or stats.captures <> 0)
    ) as all_piece_statistics_zero,
    (select count(*) from public.player_progression_operations operation
      where operation.player_id = account.player_id) as progression_operation_count,
    (select count(*) from public.local_profile_bootstraps bootstrap
      where bootstrap.player_id = account.player_id) as local_bootstrap_count,
    not exists (
      select 1 from public.local_profile_bootstraps bootstrap
      where bootstrap.player_id = account.player_id
        and bootstrap.source_profile_id <> account.player_id::text
    ) as no_cross_player_bootstrap,
    (select count(*) from public.player_migration_intents intent
      where intent.guest_player_id = account.player_id
         or intent.surviving_player_id = account.player_id
         or intent.account_auth_user_id = account.auth_user_id
         or intent.guest_auth_user_id = account.auth_user_id) as migration_intent_count
  from canonical_account account
)
select
  result.*,
  (
    result.total_xp = 0
    and result.games_played = 0
    and result.wins = 0
    and result.losses = 0
    and result.current_win_streak = 0
    and result.best_win_streak = 0
    and result.total_play_time_seconds = 0
    and result.kings_captured = 0
    and result.roulette_rolls = 0
    and result.player_turns_completed = 0
    and result.three_rights_turns = 0
    and result.triple_pawn_rolls = 0
    and result.triple_knight_rolls = 0
    and result.triple_queen_rolls = 0
    and result.all_piece_statistics_zero
    and result.progression_operation_count = 0
    and result.local_bootstrap_count = 0
    and result.no_cross_player_bootstrap
    and result.migration_intent_count = 0
    and result.multiplayer_rating = 1000
    and result.rated_games = 0
    and result.is_canonical
    and not result.username_onboarding_required
  ) as hf2_remote_acceptance_pass
from account_result result;

select
  (select count(*) from private.multiplayer_lobbies) as multiplayer_lobbies,
  (select count(*) from private.multiplayer_matches) as multiplayer_matches,
  (select count(*) from private.multiplayer_active_participants) as active_memberships,
  (select count(*) from private.multiplayer_private_join_attempts) as private_join_attempts,
  (select count(*) from public.multiplayer_lobby_events) as lobby_events,
  (select count(*) from public.multiplayer_match_events) as match_events,
  (select count(*) from private.rating_settlements) as rating_settlements,
  not exists (
    select 1 from private.multiplayer_matches match
    join private.multiplayer_lobbies lobby using (lobby_id)
    where lobby.status = 'starting'
      and match.status = 'initializing'
      and match.updated_at < now() - interval '5 minutes'
  ) as no_stale_multiplayer_matches;
