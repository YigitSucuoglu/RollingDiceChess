-- ACHIEVEMENTS-01 Phase 3B-2A: canonical unlock persistence and current-player read boundary.
-- This additive foundation does not evaluate or backfill achievements and does not alter
-- Singleplayer completion or Multiplayer settlement behavior.
begin;

create table private.player_achievement_unlocks (
  player_id uuid not null references public.players(player_id) on delete cascade,
  achievement_id text not null,
  unlocked_at timestamptz not null default now(),
  source_type text not null,
  source_id uuid not null,
  catalog_version integer not null,
  primary key (player_id, achievement_id),
  constraint player_achievement_unlocks_achievement_id_check check (achievement_id in (
    'rookie_campaign','hundred_games','dedicated_player','king_hunter',
    'capture_hundred_kings','winning_run','ranked_victor','ranked_regular',
    'ranked_veteran','winning_streak','rating_climber','elite_player',
    'wheel_spinner','roulette_master','roll_collector','triple_crown',
    'triple_collector','full_rights','pawn_commander','knight_specialist',
    'royal_maneuvers','roulette_legend','the_long_march','royal_ascension',
    'last_one_standing','wheels_favor','against_all_odds','untouchable',
    'pawn_rebellion','perfect_rhythm'
  )),
  constraint player_achievement_unlocks_source_type_check check (source_type in (
    'singleplayer-operation','multiplayer-settlement','retroactive-career'
  )),
  constraint player_achievement_unlocks_catalog_version_check check (catalog_version >= 1)
);

create index player_achievement_unlocks_source_lookup
  on private.player_achievement_unlocks(source_type, source_id);

alter table private.player_achievement_unlocks enable row level security;
revoke all on private.player_achievement_unlocks from public, anon, authenticated;

-- Internal idempotent persistence primitive for later trusted completion/settlement
-- integration. It is deliberately not browser-callable and does not decide eligibility.
create or replace function private.persist_player_achievement_unlock(
  requested_player_id uuid,
  requested_achievement_id text,
  requested_source_type text,
  requested_source_id uuid,
  requested_catalog_version integer
) returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted boolean;
begin
  if requested_player_id is null or requested_achievement_id is null
      or requested_source_type is null or requested_source_id is null
      or requested_catalog_version is null then
    raise exception 'complete achievement unlock metadata is required' using errcode='22023';
  end if;

  perform 1 from public.players player
  where player.player_id=requested_player_id and player.lifecycle='active'
  for share;
  if not found then
    raise exception 'active achievement player not found' using errcode='P0002';
  end if;

  with candidate as (
    insert into private.player_achievement_unlocks(
      player_id,achievement_id,source_type,source_id,catalog_version
    ) values (
      requested_player_id,requested_achievement_id,requested_source_type,
      requested_source_id,requested_catalog_version
    ) on conflict (player_id,achievement_id) do nothing
    returning true
  ) select coalesce((select true from candidate),false) into inserted;

  return inserted;
end;
$$;

create or replace function public.get_current_player_achievements()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target uuid:=private.current_player_id(); result jsonb;
begin
  if target is null or not exists (
    select 1 from public.players player
    where player.player_id=target and player.lifecycle='active'
  ) then
    raise exception 'active player not found' using errcode='P0002';
  end if;

  select jsonb_build_object(
    'catalogVersion',1,
    'unlockedCount',count(*)::integer,
    'unlocks',coalesce(jsonb_agg(jsonb_build_object(
      'achievementId',unlock.achievement_id,
      'unlockedAt',unlock.unlocked_at
    ) order by unlock.unlocked_at,unlock.achievement_id), '[]'::jsonb)
  ) into result
  from private.player_achievement_unlocks unlock
  where unlock.player_id=target;

  return result;
end;
$$;

revoke all on function private.persist_player_achievement_unlock(uuid,text,text,uuid,integer)
  from public, anon, authenticated;
revoke all on function public.get_current_player_achievements()
  from public, anon, authenticated;
grant execute on function private.persist_player_achievement_unlock(uuid,text,text,uuid,integer)
  to service_role;
grant execute on function public.get_current_player_achievements()
  to authenticated;

commit;
