-- ACHIEVEMENTS-01 Phase 3B-2B: transaction-bound career achievement evaluation.
-- Multiplayer telemetry is a trusted lower bound from the 5D-A deployment boundary;
-- no missing historical activity is inferred and no bulk backfill is performed here.
begin;

create or replace function private.singleplayer_level_at_least_50(total_xp bigint)
returns boolean language sql immutable set search_path = '' as $$
  -- ProfileProgression requires sum(100 + (level - 1) * 30), levels 1..49.
  select greatest(coalesce(total_xp,0),0) >= 40180;
$$;

create or replace function private.evaluate_and_persist_career_achievements(
  requested_player_id uuid,
  evaluation_scope text,
  requested_source_id uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare progression public.player_progression%rowtype;
  rating public.player_ratings%rowtype;
  multiplayer private.player_multiplayer_statistics%rowtype;
  pawn_moves bigint; knight_moves bigint; king_moves bigint;
  global_rolls bigint; global_three_rights bigint; global_triples bigint;
  triple_piece_types integer; inserted_count integer := 0;
  source_type text;
begin
  if requested_player_id is null or requested_source_id is null
      or evaluation_scope not in ('singleplayer','multiplayer-ranked','multiplayer-unranked') then
    raise exception 'valid career evaluation context is required' using errcode='22023';
  end if;

  -- One common PlayerId lock serializes concurrent SP/MP threshold crossings.
  perform player.player_id from public.players player
  where player.player_id=requested_player_id and player.lifecycle='active'
  for update;
  if not found then
    raise exception 'active achievement player not found' using errcode='P0002';
  end if;

  select value.* into progression from public.player_progression value
  where value.player_id=requested_player_id;
  select value.* into rating from public.player_ratings value
  where value.player_id=requested_player_id;
  select value.* into multiplayer from private.player_multiplayer_statistics value
  where value.player_id=requested_player_id;
  if progression.player_id is null or rating.player_id is null then
    raise exception 'canonical career counters are missing' using errcode='P0002';
  end if;

  select
    coalesce(max(statistic.moves) filter(where statistic.piece_type='pawn'),0)
      + coalesce(multiplayer.pawn_moves,0),
    coalesce(max(statistic.moves) filter(where statistic.piece_type='knight'),0)
      + coalesce(multiplayer.knight_moves,0),
    coalesce(max(statistic.moves) filter(where statistic.piece_type='king'),0)
      + coalesce(multiplayer.king_moves,0)
  into pawn_moves,knight_moves,king_moves
  from public.player_piece_statistics statistic
  where statistic.player_id=requested_player_id;

  global_rolls := progression.roulette_rolls + coalesce(multiplayer.roulette_rolls,0);
  global_three_rights := progression.three_rights_turns
    + coalesce(multiplayer.three_rights_turns,0);
  global_triples := progression.triple_pawn_rolls + progression.triple_knight_rolls
    + progression.triple_bishop_rolls + progression.triple_rook_rolls
    + progression.triple_queen_rolls + progression.triple_king_rolls
    + coalesce(multiplayer.triple_pawn_rolls,0)
    + coalesce(multiplayer.triple_knight_rolls,0)
    + coalesce(multiplayer.triple_bishop_rolls,0)
    + coalesce(multiplayer.triple_rook_rolls,0)
    + coalesce(multiplayer.triple_queen_rolls,0)
    + coalesce(multiplayer.triple_king_rolls,0);
  triple_piece_types :=
    ((progression.triple_pawn_rolls + coalesce(multiplayer.triple_pawn_rolls,0)) > 0)::integer
    + ((progression.triple_knight_rolls + coalesce(multiplayer.triple_knight_rolls,0)) > 0)::integer
    + ((progression.triple_bishop_rolls + coalesce(multiplayer.triple_bishop_rolls,0)) > 0)::integer
    + ((progression.triple_rook_rolls + coalesce(multiplayer.triple_rook_rolls,0)) > 0)::integer
    + ((progression.triple_queen_rolls + coalesce(multiplayer.triple_queen_rolls,0)) > 0)::integer
    + ((progression.triple_king_rolls + coalesce(multiplayer.triple_king_rolls,0)) > 0)::integer;

  source_type := case when evaluation_scope='singleplayer'
    then 'singleplayer-operation' else 'multiplayer-settlement' end;

  if evaluation_scope='singleplayer' then
    if progression.games_played>=10 and private.persist_player_achievement_unlock(
      requested_player_id,'rookie_campaign',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.games_played>=100 and private.persist_player_achievement_unlock(
      requested_player_id,'hundred_games',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.games_played>=500 and private.persist_player_achievement_unlock(
      requested_player_id,'dedicated_player',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.kings_captured>=10 and private.persist_player_achievement_unlock(
      requested_player_id,'king_hunter',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.kings_captured>=100 and private.persist_player_achievement_unlock(
      requested_player_id,'capture_hundred_kings',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.best_win_streak>=3 and private.persist_player_achievement_unlock(
      requested_player_id,'winning_run',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if private.singleplayer_level_at_least_50(progression.total_xp)
        and private.persist_player_achievement_unlock(
      requested_player_id,'roulette_legend',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  elsif evaluation_scope='multiplayer-ranked' then
    if rating.ranked_wins>=1 and private.persist_player_achievement_unlock(
      requested_player_id,'ranked_victor',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.rated_games>=25 and private.persist_player_achievement_unlock(
      requested_player_id,'ranked_regular',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.rated_games>=100 and private.persist_player_achievement_unlock(
      requested_player_id,'ranked_veteran',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if coalesce(multiplayer.best_ranked_win_streak,0)>=5
        and private.persist_player_achievement_unlock(
      requested_player_id,'winning_streak',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.multiplayer_rating>=1200 and private.persist_player_achievement_unlock(
      requested_player_id,'rating_climber',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.multiplayer_rating>=1500 and private.persist_player_achievement_unlock(
      requested_player_id,'elite_player',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  end if;

  -- These known counters are lower bounds when pre-telemetry MP history exists.
  -- Only positive threshold proof unlocks; no negative/missing conclusion is stored.
  if global_rolls>=100 and private.persist_player_achievement_unlock(
    requested_player_id,'wheel_spinner',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_rolls>=1000 and private.persist_player_achievement_unlock(
    requested_player_id,'roulette_master',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_rolls>=5000 and private.persist_player_achievement_unlock(
    requested_player_id,'roll_collector',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if triple_piece_types>=6 and private.persist_player_achievement_unlock(
    requested_player_id,'triple_crown',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_triples>=100 and private.persist_player_achievement_unlock(
    requested_player_id,'triple_collector',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_three_rights>=25 and private.persist_player_achievement_unlock(
    requested_player_id,'full_rights',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if pawn_moves>=500 and private.persist_player_achievement_unlock(
    requested_player_id,'pawn_commander',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if knight_moves>=250 and private.persist_player_achievement_unlock(
    requested_player_id,'knight_specialist',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if king_moves>=100 and private.persist_player_achievement_unlock(
    requested_player_id,'royal_maneuvers',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;

  return inserted_count;
end;
$$;

-- Preserve the latest Phase 5D-C operation contract and append evaluation only
-- after canonical counters have changed. Replay returns before evaluation.
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
  perform private.evaluate_and_persist_career_achievements(
    target,'singleplayer',requested_operation_id
  );
  return private.current_player_profile_json();
end;
$$;

-- The terminal match UPDATE has already run the telemetry finalizer trigger when
-- this wrapper executes. Ranked rating is settled before evaluating ratingAfter.
create or replace function private.settle_multiplayer_match_if_eligible(
  match_row private.multiplayer_matches
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if match_row.mode='ranked' and match_row.status='terminal'
      and match_row.winner_player_id is not null
      and match_row.termination_reason in (
        'king-captured','timeout','forfeit','disconnect-forfeit'
      ) then
    perform private.settle_ranked_match(
      match_row.match_id,'multiplayer-ranked',match_row.player_a_id,
      match_row.player_b_id,match_row.winner_player_id,
      case when match_row.termination_reason in ('forfeit','disconnect-forfeit')
        then 'forfeit' else 'normal' end
    );
    perform private.evaluate_and_persist_career_achievements(
      match_row.player_a_id,'multiplayer-ranked',match_row.match_id
    );
    perform private.evaluate_and_persist_career_achievements(
      match_row.player_b_id,'multiplayer-ranked',match_row.match_id
    );
  elsif match_row.mode='unranked' then
    perform private.record_unranked_match_completion(match_row);
    if match_row.status='terminal' and match_row.winner_player_id is not null
        and match_row.termination_reason in (
          'king-captured','timeout','forfeit','disconnect-forfeit'
        ) then
      perform private.evaluate_and_persist_career_achievements(
        match_row.player_a_id,'multiplayer-unranked',match_row.match_id
      );
      perform private.evaluate_and_persist_career_achievements(
        match_row.player_b_id,'multiplayer-unranked',match_row.match_id
      );
    end if;
  end if;
end;
$$;

revoke all on function private.singleplayer_level_at_least_50(bigint)
  from public,anon,authenticated;
revoke all on function private.evaluate_and_persist_career_achievements(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.apply_player_progression_operation(uuid,jsonb)
  from public,anon,authenticated;
revoke all on function private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)
  from public,anon,authenticated;
grant execute on function public.apply_player_progression_operation(uuid,jsonb)
  to authenticated;
grant execute on function private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)
  to service_role;

commit;
