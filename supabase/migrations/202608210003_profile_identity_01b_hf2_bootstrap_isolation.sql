-- PROFILE-IDENTITY-01B-HF2: enforce PlayerId isolation at the bootstrap RPC.
begin;

create or replace function public.bootstrap_local_profile(source_profile jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target uuid := private.current_player_id();
  input_source_profile_id text := source_profile->>'playerId';
  input_source_schema_version integer := (source_profile->>'schemaVersion')::integer;
  source_display_name text := source_profile->>'displayName';
  source_stats jsonb := source_profile->'statistics';
  piece_name text;
begin
  if target is null then raise exception 'player not found' using errcode = 'P0002'; end if;
  if input_source_profile_id is null or char_length(input_source_profile_id) not between 1 and 128
      or input_source_schema_version <> 1
      or char_length(btrim(source_display_name)) not between 2 and 24
      or source_display_name ~ '[<>/\\]' or source_display_name ~ '[[:cntrl:]]'
      or jsonb_typeof(source_stats) <> 'object' then
    raise exception 'invalid local profile payload' using errcode = '22023';
  end if;

  -- A permanent account may recover only its own canonical PlayerId here.
  -- Anonymous Guests retain the legacy local-to-cloud bootstrap path. Explicit
  -- Guest-to-Google transfers continue through the migration-intent RPCs.
  if input_source_profile_id <> target::text
      and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'cross-player bootstrap requires explicit migration authorization'
      using errcode = '42501';
  end if;

  perform 1 from public.player_progression where player_id=target for update;
  if exists (
    select 1 from public.player_progression where player_id=target
      and (total_xp<>0 or games_played<>0 or wins<>0 or losses<>0
        or current_win_streak<>0 or best_win_streak<>0 or total_play_time_seconds<>0
        or kings_captured<>0 or roulette_rolls<>0 or player_turns_completed<>0
        or three_rights_turns<>0 or triple_pawn_rolls<>0
        or triple_knight_rolls<>0 or triple_queen_rolls<>0)
  ) or exists (
    select 1 from public.player_piece_statistics where player_id=target
      and (rolls<>0 or moves<>0 or captures<>0)
  ) then
    if exists (select 1 from public.local_profile_bootstraps
      where player_id=target and source_profile_id=input_source_profile_id
        and source_schema_version=input_source_schema_version)
    then return target; end if;
    raise exception 'cloud profile is not empty; explicit migration decision required' using errcode='23505';
  end if;
  insert into public.local_profile_bootstraps(player_id, source_profile_id, source_schema_version)
    values (target, input_source_profile_id, input_source_schema_version) on conflict do nothing;
  if not found then return target; end if;
  if (source_profile->>'totalXp')::bigint < 0
      or (source_stats->>'gamesPlayed')::integer < 0
      or (source_stats->>'wins')::integer < 0
      or (source_stats->>'losses')::integer < 0 then
    raise exception 'invalid progression' using errcode = '22023';
  end if;
  update public.player_progression set
    total_xp=(source_profile->>'totalXp')::bigint,
    games_played=(source_stats->>'gamesPlayed')::integer,
    wins=(source_stats->>'wins')::integer,
    losses=(source_stats->>'losses')::integer,
    current_win_streak=(source_stats->>'currentWinStreak')::integer,
    best_win_streak=(source_stats->>'bestWinStreak')::integer,
    total_play_time_seconds=(source_stats->>'totalPlayTimeSeconds')::bigint,
    kings_captured=(source_stats->>'kingsCaptured')::integer,
    roulette_rolls=(source_stats->>'rouletteRolls')::integer,
    player_turns_completed=(source_stats->>'playerTurnsCompleted')::integer,
    three_rights_turns=(source_stats->>'threeRightsTurns')::integer,
    triple_pawn_rolls=(source_stats->>'triplePawnRolls')::integer,
    triple_knight_rolls=(source_stats->>'tripleKnightRolls')::integer,
    triple_queen_rolls=(source_stats->>'tripleQueenRolls')::integer,
    updated_at=now()
    where player_id=target;
  foreach piece_name in array array['pawn','knight','bishop','rook','queen','king'] loop
    update public.player_piece_statistics set
      rolls=(source_stats->'rollsByPiece'->>piece_name)::integer,
      moves=(source_stats->'movesByPiece'->>piece_name)::integer,
      captures=(source_stats->'capturesByPiece'->>piece_name)::integer
      where player_id=target and piece_type=piece_name;
  end loop;
  update public.players set
    display_name=regexp_replace(btrim(source_display_name), '\s+', ' ', 'g'), updated_at=now()
    where player_id=target;
  return target;
end;
$$;

revoke all on function public.bootstrap_local_profile(jsonb) from public, anon, authenticated;
grant execute on function public.bootstrap_local_profile(jsonb) to authenticated;

commit;
