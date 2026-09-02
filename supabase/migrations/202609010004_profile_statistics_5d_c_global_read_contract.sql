-- PROFILE-STATISTICS Phase 5D-C: six-piece Singleplayer triples and one safe,
-- current-player global Roulette statistics read contract. No history backfill.
begin;

alter table public.player_progression
  add column triple_bishop_rolls integer not null default 0 check (triple_bishop_rolls >= 0),
  add column triple_rook_rolls integer not null default 0 check (triple_rook_rolls >= 0),
  add column triple_king_rolls integer not null default 0 check (triple_king_rolls >= 0);

create or replace function private.current_global_roulette_statistics(target uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with pieces(piece_type, ordinal) as (values
    ('pawn',1),('knight',2),('bishop',3),('rook',4),('queen',5),('king',6)
  ), source as (
    select piece.piece_type, piece.ordinal,
      coalesce(single.rolls,0)::bigint + case piece.piece_type
        when 'pawn' then coalesce(multi.pawn_rolls,0)
        when 'knight' then coalesce(multi.knight_rolls,0)
        when 'bishop' then coalesce(multi.bishop_rolls,0)
        when 'rook' then coalesce(multi.rook_rolls,0)
        when 'queen' then coalesce(multi.queen_rolls,0)
        else coalesce(multi.king_rolls,0) end as roll_count,
      coalesce(single.moves,0)::bigint + case piece.piece_type
        when 'pawn' then coalesce(multi.pawn_moves,0)
        when 'knight' then coalesce(multi.knight_moves,0)
        when 'bishop' then coalesce(multi.bishop_moves,0)
        when 'rook' then coalesce(multi.rook_moves,0)
        when 'queen' then coalesce(multi.queen_moves,0)
        else coalesce(multi.king_moves,0) end as move_count,
      case piece.piece_type
        when 'pawn' then progression.triple_pawn_rolls::bigint + coalesce(multi.triple_pawn_rolls,0)
        when 'knight' then progression.triple_knight_rolls::bigint + coalesce(multi.triple_knight_rolls,0)
        when 'bishop' then progression.triple_bishop_rolls::bigint + coalesce(multi.triple_bishop_rolls,0)
        when 'rook' then progression.triple_rook_rolls::bigint + coalesce(multi.triple_rook_rolls,0)
        when 'queen' then progression.triple_queen_rolls::bigint + coalesce(multi.triple_queen_rolls,0)
        else progression.triple_king_rolls::bigint + coalesce(multi.triple_king_rolls,0) end
        as triple_count
    from pieces piece
    join public.player_progression progression on progression.player_id=target
    left join public.player_piece_statistics single
      on single.player_id=target and single.piece_type=piece.piece_type
    left join private.player_multiplayer_statistics multi on multi.player_id=target
  ), totals as (
    select progression.three_rights_turns::bigint + coalesce(multi.three_rights_turns,0)
        as numerator,
      progression.player_turns_completed::bigint + coalesce(multi.player_turns_completed,0)
        as denominator
    from public.player_progression progression
    left join private.player_multiplayer_statistics multi using(player_id)
    where progression.player_id=target
  )
  select jsonb_build_object(
    'mostRolledPiece',(select case when roll_count=0 then null else piece_type end
      from source order by roll_count desc, ordinal limit 1),
    'mostRolledPieceCount',(select roll_count from source order by roll_count desc, ordinal limit 1),
    'mostPlayedPiece',(select case when move_count=0 then null else piece_type end
      from source order by move_count desc, ordinal limit 1),
    'mostPlayedPieceCount',(select move_count from source order by move_count desc, ordinal limit 1),
    'threeRightsTurns',totals.numerator,
    'playerTurnsCompleted',totals.denominator,
    'threeRightsUsedRate',case when totals.denominator>0
      then totals.numerator::numeric/totals.denominator else 0::numeric end,
    'rollsByPiece',(select jsonb_object_agg(piece_type,roll_count) from source),
    'movesByPiece',(select jsonb_object_agg(piece_type,move_count) from source),
    'tripleRolls',(select jsonb_agg(jsonb_build_object(
      'pieceType',piece_type,'count',triple_count
    ) order by triple_count desc, ordinal) from source)
  ) from totals;
$$;

create or replace function private.current_player_profile_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion',1,'playerId',player.player_id,'displayName',player.display_name,
    'publicDiscriminator',player.public_discriminator,
    'usernameOnboardingRequired',player.username_onboarding_required,
    'ownershipKind',player.ownership_kind,'lifecycle',player.lifecycle,
    'createdAt',player.created_at,
    'progression',to_jsonb(progression)-'player_id'-'updated_at',
    'pieceStatistics',coalesce((select jsonb_object_agg(statistic.piece_type,
      jsonb_build_object('rolls',statistic.rolls,'moves',statistic.moves,
        'captures',statistic.captures))
      from public.player_piece_statistics statistic
      where statistic.player_id=player.player_id),'{}'::jsonb),
    'rating',jsonb_build_object(
      'multiplayerRating',rating.multiplayer_rating,'ratedGames',rating.rated_games,
      'rankedWins',rating.ranked_wins,'rankedLosses',rating.ranked_losses,
      'rankedWinRate',rating.ranked_win_rate,'unrankedGames',rating.unranked_games,
      'ratingVersion',rating.rating_version,
      'currentRankedWinStreak',coalesce(multi.current_ranked_win_streak,0),
      'bestRankedWinStreak',coalesce(multi.best_ranked_win_streak,0),
      'totalMultiplayerPlayTimeMs',coalesce(multi.total_play_time_ms,0),
      'multiplayerKingsCaptured',coalesce(multi.kings_captured,0),
      'multiplayerRouletteRolls',coalesce(multi.roulette_rolls,0)),
    'rouletteStatistics',private.current_global_roulette_statistics(player.player_id),
    'bootstrapApplied',exists(select 1 from public.local_profile_bootstraps bootstrap
      where bootstrap.player_id=player.player_id)
  )
  from public.players player
  join public.player_progression progression using(player_id)
  join public.player_ratings rating using(player_id)
  left join private.player_multiplayer_statistics multi using(player_id)
  where player.player_id=private.current_player_id() and player.lifecycle='active';
$$;

create or replace function public.apply_player_progression_operation(
  requested_operation_id uuid, operation jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid:=private.current_player_id(); operation_hash bytea:=extensions.digest(operation::text,'sha256');
  existing_hash bytea; piece_name text; scalar_name text;
  allowed_keys constant text[]:=array['xpDelta','gamesDelta','winsDelta','lossesDelta',
    'playTimeSecondsDelta','kingsCapturedDelta','rouletteRollsDelta','playerTurnsCompletedDelta',
    'threeRightsTurnsDelta','triplePawnRollsDelta','tripleKnightRollsDelta',
    'tripleBishopRollsDelta','tripleRookRollsDelta','tripleQueenRollsDelta',
    'tripleKingRollsDelta','rollsByPieceDelta','movesByPieceDelta','capturesByPieceDelta'];
begin
  if target is null then raise exception 'player not found' using errcode='P0002'; end if;
  if requested_operation_id is null or jsonb_typeof(operation)<>'object'
      or exists(select 1 from jsonb_object_keys(operation) key where not(key=any(allowed_keys))) then
    raise exception 'invalid progression operation' using errcode='22023'; end if;
  if (operation->>'gamesDelta')::integer<>1
      or (operation->>'winsDelta')::integer+(operation->>'lossesDelta')::integer<>1
      or (operation->>'xpDelta')::integer not between 0 and 10000
      or (operation->>'playTimeSecondsDelta')::integer not between 0 and 86400 then
    raise exception 'invalid match progression delta' using errcode='22023'; end if;
  foreach scalar_name in array array['kingsCapturedDelta','rouletteRollsDelta',
    'playerTurnsCompletedDelta','threeRightsTurnsDelta','triplePawnRollsDelta',
    'tripleKnightRollsDelta','tripleBishopRollsDelta','tripleRookRollsDelta',
    'tripleQueenRollsDelta','tripleKingRollsDelta'] loop
    if coalesce((operation->>scalar_name)::integer,0) not between 0 and 10000 then
      raise exception 'invalid progression counter delta' using errcode='22023'; end if;
  end loop;
  if jsonb_typeof(coalesce(operation->'rollsByPieceDelta','{}'))<>'object'
      or jsonb_typeof(coalesce(operation->'movesByPieceDelta','{}'))<>'object'
      or jsonb_typeof(coalesce(operation->'capturesByPieceDelta','{}'))<>'object' then
    raise exception 'invalid piece progression maps' using errcode='22023'; end if;
  foreach piece_name in array array['pawn','knight','bishop','rook','queen','king'] loop
    if coalesce((operation->'rollsByPieceDelta'->>piece_name)::integer,0) not between 0 and 1000
        or coalesce((operation->'movesByPieceDelta'->>piece_name)::integer,0) not between 0 and 1000
        or coalesce((operation->'capturesByPieceDelta'->>piece_name)::integer,0) not between 0 and 1000 then
      raise exception 'invalid piece progression delta' using errcode='22023'; end if;
  end loop;
  perform 1 from public.player_progression where player_id=target for update;
  select payload_hash into existing_hash from public.player_progression_operations
    where player_id=target and operation_id=requested_operation_id;
  if existing_hash is not null then
    if existing_hash<>operation_hash then raise exception 'operation id was already used with another payload' using errcode='23505'; end if;
    return private.current_player_profile_json();
  end if;
  insert into public.player_progression_operations(player_id,operation_id,payload_hash)
    values(target,requested_operation_id,operation_hash);
  update public.player_progression set total_xp=total_xp+(operation->>'xpDelta')::integer,
    games_played=games_played+1,wins=wins+(operation->>'winsDelta')::integer,
    losses=losses+(operation->>'lossesDelta')::integer,
    current_win_streak=case when (operation->>'winsDelta')::integer=1 then current_win_streak+1 else 0 end,
    best_win_streak=greatest(best_win_streak,case when (operation->>'winsDelta')::integer=1 then current_win_streak+1 else best_win_streak end),
    total_play_time_seconds=total_play_time_seconds+(operation->>'playTimeSecondsDelta')::integer,
    kings_captured=kings_captured+coalesce((operation->>'kingsCapturedDelta')::integer,0),
    roulette_rolls=roulette_rolls+coalesce((operation->>'rouletteRollsDelta')::integer,0),
    player_turns_completed=player_turns_completed+coalesce((operation->>'playerTurnsCompletedDelta')::integer,0),
    three_rights_turns=three_rights_turns+coalesce((operation->>'threeRightsTurnsDelta')::integer,0),
    triple_pawn_rolls=triple_pawn_rolls+coalesce((operation->>'triplePawnRollsDelta')::integer,0),
    triple_knight_rolls=triple_knight_rolls+coalesce((operation->>'tripleKnightRollsDelta')::integer,0),
    triple_bishop_rolls=triple_bishop_rolls+coalesce((operation->>'tripleBishopRollsDelta')::integer,0),
    triple_rook_rolls=triple_rook_rolls+coalesce((operation->>'tripleRookRollsDelta')::integer,0),
    triple_queen_rolls=triple_queen_rolls+coalesce((operation->>'tripleQueenRollsDelta')::integer,0),
    triple_king_rolls=triple_king_rolls+coalesce((operation->>'tripleKingRollsDelta')::integer,0),updated_at=now()
    where player_id=target;
  foreach piece_name in array array['pawn','knight','bishop','rook','queen','king'] loop
    update public.player_piece_statistics set
      rolls=rolls+coalesce((operation->'rollsByPieceDelta'->>piece_name)::integer,0),
      moves=moves+coalesce((operation->'movesByPieceDelta'->>piece_name)::integer,0),
      captures=captures+coalesce((operation->'capturesByPieceDelta'->>piece_name)::integer,0)
      where player_id=target and piece_type=piece_name;
  end loop;
  return private.current_player_profile_json();
end;
$$;

-- Bootstrap remains explicit-current-PlayerId only; old payloads omit new
-- counters and therefore safely start them at zero.
create or replace function private.apply_singleplayer_triple_bootstrap(target uuid, source_stats jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare bishop_value integer:=coalesce((source_stats->>'tripleBishopRolls')::integer,0);
  rook_value integer:=coalesce((source_stats->>'tripleRookRolls')::integer,0);
  king_value integer:=coalesce((source_stats->>'tripleKingRolls')::integer,0);
begin
  if bishop_value<0 or rook_value<0 or king_value<0 then
    raise exception 'invalid Singleplayer triple counters' using errcode='22023'; end if;
  update public.player_progression set
    triple_bishop_rolls=bishop_value,triple_rook_rolls=rook_value,triple_king_rolls=king_value
  where player_id=target and triple_bishop_rolls=0
    and triple_rook_rolls=0 and triple_king_rolls=0;
end;
$$;

-- Preserve the proven HF2 bootstrap implementation behind a private wrapper;
-- the public signature and current-auth authorization contract stay unchanged.
alter function public.bootstrap_local_profile(jsonb) set schema private;
alter function private.bootstrap_local_profile(jsonb)
  rename to bootstrap_local_profile_5d_c_base;
create or replace function public.bootstrap_local_profile(source_profile jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  target:=private.bootstrap_local_profile_5d_c_base(source_profile);
  perform private.apply_singleplayer_triple_bootstrap(target,source_profile->'statistics');
  return target;
end;
$$;

revoke all on function private.current_global_roulette_statistics(uuid) from public,anon,authenticated;
revoke all on function private.current_player_profile_json() from public,anon,authenticated;
revoke all on function private.apply_singleplayer_triple_bootstrap(uuid,jsonb) from public,anon,authenticated;
revoke all on function private.bootstrap_local_profile_5d_c_base(jsonb) from public,anon,authenticated;
revoke all on function public.bootstrap_local_profile(jsonb) from public,anon,authenticated;
revoke all on function public.apply_player_progression_operation(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.bootstrap_local_profile(jsonb),
  public.apply_player_progression_operation(uuid,jsonb) to authenticated;

commit;
