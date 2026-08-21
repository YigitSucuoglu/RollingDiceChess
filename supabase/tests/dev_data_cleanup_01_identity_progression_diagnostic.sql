-- DEV-DATA-CLEANUP-01 identity/progression isolation diagnostic. READ-ONLY.
-- Run in Supabase SQL Editor after the fresh Google account has completed
-- username onboarding. No UUID, auth token, or secret is returned.

with account_players as (
  select
    player.player_id,
    owner.auth_user_id,
    player.display_name,
    player.public_discriminator,
    player.ownership_kind,
    player.lifecycle,
    player.superseded_by,
    player.username_onboarding_required,
    player.created_at
  from public.players player
  join public.player_auth_owners owner using (player_id)
  join auth.users auth_user on auth_user.id = owner.auth_user_id
  where not coalesce(auth_user.is_anonymous, false)
),
piece_totals as (
  select
    stats.player_id,
    jsonb_object_agg(
      stats.piece_type,
      jsonb_build_object(
        'rolls', stats.rolls,
        'moves', stats.moves,
        'captures', stats.captures
      ) order by stats.piece_type
    ) as piece_statistics
  from public.player_piece_statistics stats
  group by stats.player_id
)
select
  encode(substring(extensions.digest(account.auth_user_id::text, 'sha256') from 1 for 6), 'hex')
    as auth_fingerprint,
  encode(substring(extensions.digest(account.player_id::text, 'sha256') from 1 for 6), 'hex')
    as player_fingerprint,
  account.display_name as username,
  account.public_discriminator,
  account.ownership_kind,
  account.lifecycle,
  account.superseded_by is not null as is_superseded,
  account.username_onboarding_required,
  progression.total_xp,
  floor(sqrt(greatest(progression.total_xp, 0)::numeric / 100))::integer + 1
    as derived_level,
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
  coalesce(piece.piece_statistics, '{}'::jsonb) as piece_statistics,
  rating.multiplayer_rating,
  rating.rated_games,
  rating.rating_version,
  (select count(*) from public.player_progression_operations operation
    where operation.player_id = account.player_id) as progression_operation_count,
  (select count(*) from public.local_profile_bootstraps bootstrap
    where bootstrap.player_id = account.player_id) as local_bootstrap_count,
  exists(
    select 1 from public.local_profile_bootstraps bootstrap
    where bootstrap.player_id = account.player_id
      and bootstrap.source_profile_id = account.player_id::text
  ) as bootstrap_source_matches_canonical_player,
  exists(
    select 1 from public.local_profile_bootstraps bootstrap
    where bootstrap.player_id = account.player_id
      and bootstrap.source_profile_id <> account.player_id::text
  ) as bootstrap_source_differs_from_canonical_player,
  (select max(bootstrap.applied_at) from public.local_profile_bootstraps bootstrap
    where bootstrap.player_id = account.player_id) as latest_local_bootstrap_at,
  (select count(*) from public.player_migration_intents intent
    where intent.guest_player_id = account.player_id
       or intent.surviving_player_id = account.player_id) as migration_intent_count,
  case
    when progression.total_xp = 0
      and progression.games_played = 0
      and not exists (
        select 1 from public.player_piece_statistics stats
        where stats.player_id = account.player_id
          and (stats.rolls <> 0 or stats.moves <> 0 or stats.captures <> 0)
      ) then 'REMOTE_FRESH'
    when exists (
      select 1 from public.local_profile_bootstraps bootstrap
      where bootstrap.player_id = account.player_id
        and bootstrap.source_profile_id <> account.player_id::text
    ) then 'REMOTE_PROGRESS_FROM_DIFFERENT_LOCAL_PLAYER_BOOTSTRAP'
    else 'REMOTE_PROGRESS_PRESENT_WITHOUT_DIFFERENT_PLAYER_BOOTSTRAP_EVIDENCE'
  end as diagnosis
from account_players account
join public.player_progression progression using (player_id)
join public.player_ratings rating using (player_id)
left join piece_totals piece using (player_id)
order by account.created_at desc;

