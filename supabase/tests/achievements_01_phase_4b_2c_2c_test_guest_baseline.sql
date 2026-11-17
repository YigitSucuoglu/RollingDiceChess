-- ACHIEVEMENTS-01 Phase 4B-2C-2C, Stage C-1.
-- Read-only lookup for ONE newly-created, designated cloud Guest Auth user.
-- Copy only that test user's Auth UUID from Supabase Auth > Users into the
-- NULL::uuid parameter below. Never use the developer's real account or an
-- existing Guest. Keep Auth/Player UUIDs in a private local test manifest.
begin transaction read only;

with params as (
  select NULL::uuid as test_auth_user_id
), identity as (
  select a.id as auth_user_id,a.is_anonymous,a.created_at as auth_created_at,
    o.player_id,p.ownership_kind,p.lifecycle
  from params
  left join auth.users a on a.id=params.test_auth_user_id
  left join public.player_auth_owners o on o.auth_user_id=a.id
  left join public.players p on p.player_id=o.player_id
)
select
  (select test_auth_user_id is not null from params) as parameter_configured,
  i.auth_user_id is not null as auth_user_found,
  i.is_anonymous as cloud_guest_confirmed,
  i.auth_created_at,
  i.player_id as canonical_test_player_id,
  i.ownership_kind,
  i.lifecycle,
  progression.total_xp,
  progression.games_played,
  progression.wins,
  progression.losses,
  (select count(*) from public.player_progression_operations operation
    where operation.player_id=i.player_id) as operation_count,
  (select count(*) from private.player_singleplayer_match_completions completion
    where completion.player_id=i.player_id) as single_match_count,
  (select count(*) from private.player_achievement_unlocks unlock
    where unlock.player_id=i.player_id) as unlock_count
from identity i
left join public.player_progression progression on progression.player_id=i.player_id;

commit;
