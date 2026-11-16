begin;

create table private.player_singleplayer_match_completions (
  match_id uuid primary key,
  player_id uuid not null references public.players(player_id) on delete cascade,
  operation_id uuid not null,
  completion_payload jsonb not null,
  payload_hash bytea not null,
  completed_at timestamptz not null default now(),
  constraint player_singleplayer_match_completions_operation_unique
    unique (player_id, operation_id),
  constraint player_singleplayer_match_completions_payload_object
    check (jsonb_typeof(completion_payload) = 'object')
);

create index player_singleplayer_match_completions_player_completed
  on private.player_singleplayer_match_completions(player_id, completed_at desc);

alter table private.player_singleplayer_match_completions enable row level security;
revoke all on table private.player_singleplayer_match_completions
  from public, anon, authenticated;
grant select, insert on table private.player_singleplayer_match_completions to service_role;

create or replace function private.validate_singleplayer_match_completion(
  requested_player_id uuid,
  single_match jsonb,
  operation jsonb
) returns uuid language plpgsql immutable set search_path = '' as $$
declare
  snapshot jsonb;
  resolved_match_id uuid;
  player_moves integer;
  bot_moves integer;
  total_moves integer;
  captured_enemy integer;
  pawn_captures integer;
  triple_results integer;
  terminal_moves integer;
  final_piece_count integer;
begin
  if jsonb_typeof(single_match) <> 'object'
      or (select count(*) from jsonb_object_keys(single_match)) <> 3
      or not (single_match ?& array['schemaVersion','matchId','snapshot'])
      or single_match->>'schemaVersion' <> '1' then
    raise exception 'invalid single-match payload schema' using errcode = '22023';
  end if;

  begin
    resolved_match_id := (single_match->>'matchId')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid single-match match id' using errcode = '22023';
  end;

  snapshot := single_match->'snapshot';
  if jsonb_typeof(snapshot) <> 'object'
      or snapshot->>'matchId' <> resolved_match_id::text
      or snapshot->>'playerId' <> requested_player_id::text
      or snapshot->>'mode' <> 'singleplayer'
      or snapshot->>'status' <> 'completed'
      or snapshot->>'terminationReason' not in ('king-captured','timeout')
      or snapshot->>'playerColor' not in ('white','black')
      or snapshot->>'winner' not in ('white','black')
      or snapshot->>'valid' <> 'true'
      or snapshot->>'complete' <> 'true' then
    raise exception 'invalid completed single-match snapshot' using errcode = '22023';
  end if;

  begin
    player_moves := (snapshot->>'playerSuccessfulMoves')::integer;
    bot_moves := (snapshot->>'botSuccessfulMoves')::integer;
    total_moves := (snapshot->>'totalSuccessfulMoves')::integer;
    captured_enemy := (snapshot->>'capturedEnemyPieces')::integer;
    pawn_captures := (snapshot->>'pawnCaptures')::integer;
    triple_results := (snapshot->>'tripleRouletteResults')::integer;
    terminal_moves := (snapshot->>'terminalPlayerTurnMovesUsed')::integer;
    final_piece_count := (snapshot->>'finalOwnPieceCount')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid single-match numeric field' using errcode = '22023';
  end;

  if player_moves not between 0 and 1000 or bot_moves not between 0 and 1000
      or total_moves <> player_moves + bot_moves
      or captured_enemy not between 0 and 16
      or coalesce((snapshot->>'capturedOwnPieces')::integer, -1) not between 0 and 16
      or pawn_captures not between 0 and captured_enemy
      or triple_results not between 0 and 1000
      or coalesce((snapshot->>'currentConsecutiveThreeRightsTurns')::integer, -1) not between 0 and 1000
      or coalesce((snapshot->>'bestConsecutiveThreeRightsTurns')::integer, -1) not between 0 and 1000
      or (snapshot->>'currentConsecutiveThreeRightsTurns')::integer
        > (snapshot->>'bestConsecutiveThreeRightsTurns')::integer
      or terminal_moves not between 0 and 3
      or final_piece_count not between 0 and 16
      or jsonb_typeof(snapshot->'promotedPawnIds') <> 'array'
      or jsonb_array_length(snapshot->'promotedPawnIds') > 8
      or exists (
        select 1 from jsonb_array_elements(snapshot->'promotedPawnIds') promoted
        where jsonb_typeof(promoted) <> 'string' or length(promoted #>> '{}') = 0
      )
      or ((snapshot->>'winner') = (snapshot->>'playerColor'))
        <> ((operation->>'winsDelta')::integer = 1) then
    raise exception 'inconsistent single-match snapshot' using errcode = '22023';
  end if;

  return resolved_match_id;
end;
$$;

create or replace function public.apply_player_progression_operation(
  requested_operation_id uuid, operation jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target uuid := private.current_player_id();
  operation_hash bytea := extensions.digest(operation::text,'sha256');
  existing_hash bytea;
  piece_name text;
  scalar_name text;
  single_match jsonb := operation->'singleMatch';
  resolved_match_id uuid;
  existing_completion private.player_singleplayer_match_completions%rowtype;
  completion_hash bytea;
  allowed_keys constant text[] := array['xpDelta','gamesDelta','winsDelta','lossesDelta',
    'playTimeSecondsDelta','kingsCapturedDelta','rouletteRollsDelta','playerTurnsCompletedDelta',
    'threeRightsTurnsDelta','triplePawnRollsDelta','tripleKnightRollsDelta',
    'tripleBishopRollsDelta','tripleRookRollsDelta','tripleQueenRollsDelta',
    'tripleKingRollsDelta','rollsByPieceDelta','movesByPieceDelta','capturesByPieceDelta',
    'singleMatch'];
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

  if single_match is not null then
    resolved_match_id := private.validate_singleplayer_match_completion(target, single_match, operation);
    completion_hash := extensions.digest(single_match::text, 'sha256');
  end if;

  -- Global lock order: canonical progression row, then match advisory lock,
  -- operation ledger, match ledger, counters and career evaluation.
  perform 1 from public.player_progression where player_id=target for update;
  if single_match is not null then
    perform pg_advisory_xact_lock(hashtextextended(resolved_match_id::text, 0));
  end if;

  select payload_hash into existing_hash from public.player_progression_operations
    where player_id=target and operation_id=requested_operation_id;
  if existing_hash is not null then
    if existing_hash<>operation_hash then
      raise exception 'operation id was already used with another payload' using errcode='23505';
    end if;
    return private.current_player_profile_json();
  end if;

  if single_match is not null then
    select * into existing_completion
      from private.player_singleplayer_match_completions
      where match_id=resolved_match_id for update;
    if found then
      if existing_completion.player_id <> target then
        raise exception 'single-player match belongs to another canonical player' using errcode='23505';
      end if;
      if existing_completion.payload_hash <> completion_hash
          or existing_completion.completion_payload <> single_match then
        raise exception 'match id was already used with another completion payload' using errcode='23505';
      end if;
      insert into public.player_progression_operations(player_id,operation_id,payload_hash)
        values(target,requested_operation_id,operation_hash);
      return private.current_player_profile_json();
    end if;
  end if;

  insert into public.player_progression_operations(player_id,operation_id,payload_hash)
    values(target,requested_operation_id,operation_hash);
  if single_match is not null then
    insert into private.player_singleplayer_match_completions(
      match_id,player_id,operation_id,completion_payload,payload_hash
    ) values(resolved_match_id,target,requested_operation_id,single_match,completion_hash);
  end if;

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

revoke all on function private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.apply_player_progression_operation(uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_player_progression_operation(uuid,jsonb)
  to authenticated;

commit;
