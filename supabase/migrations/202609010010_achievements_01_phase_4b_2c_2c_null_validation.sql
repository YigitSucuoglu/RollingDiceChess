-- ACHIEVEMENTS-01 Phase 4B-2C-2C: reject missing/JSON-null required
-- single-match fields before SQL three-valued comparisons can bypass checks.
-- Only the existing private validator is replaced. RPC, ledgers, evaluator,
-- trigger, grants, and schemaVersion 1 payload shape remain unchanged.
begin;

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
  captured_own integer;
  pawn_captures integer;
  triple_results integer;
  current_streak integer;
  best_streak integer;
  terminal_moves integer;
  final_piece_count integer;
  promotion_count integer;
  distinct_promotion_count integer;
  player_won boolean;
  expected_kings_captured integer;
begin
  if requested_player_id is null
      or jsonb_typeof(single_match) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(single_match)) <> 3
      or not (single_match ?& array['schemaVersion','matchId','snapshot'])
      or single_match->>'schemaVersion' is distinct from '1'
      or single_match->>'matchId' is null then
    raise exception 'invalid single-match payload schema' using errcode = '22023';
  end if;
  begin
    resolved_match_id := (single_match->>'matchId')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid single-match match id' using errcode = '22023';
  end;

  snapshot := single_match->'snapshot';
  if jsonb_typeof(snapshot) is distinct from 'object' then
    raise exception 'invalid completed single-match snapshot' using errcode = '22023';
  end if;
  -- -> returns SQL NULL for an absent key, whereas an explicit JSON null is
  -- a non-NULL jsonb value. Reject both without changing accepted value types.
  if exists (
    select 1 from unnest(array[
      'matchId','playerId','mode','playerColor','status','terminationReason',
      'winner','valid','complete','playerSuccessfulMoves','botSuccessfulMoves',
      'totalSuccessfulMoves','promotedPawnIds','capturedEnemyPieces',
      'capturedOwnPieces','pawnCaptures','tripleRouletteResults',
      'currentConsecutiveThreeRightsTurns','bestConsecutiveThreeRightsTurns',
      'terminalPlayerTurnMovesUsed','finalOwnPieceCount'
    ]) as required(field_name)
    where snapshot -> (required.field_name) is null
      or jsonb_typeof(snapshot -> (required.field_name)) = 'null'
  ) then
    raise exception 'invalid completed single-match snapshot' using errcode = '22023';
  end if;
  if snapshot->>'matchId' <> resolved_match_id::text
      or snapshot->>'playerId' <> requested_player_id::text
      or snapshot->>'mode' <> 'singleplayer'
      or snapshot->>'status' <> 'completed'
      or snapshot->>'terminationReason' not in ('king-captured','timeout')
      or snapshot->>'playerColor' not in ('white','black')
      or snapshot->>'winner' not in ('white','black')
      or snapshot->>'valid' <> 'true' or snapshot->>'complete' <> 'true'
      or jsonb_typeof(snapshot->'promotedPawnIds') <> 'array' then
    raise exception 'invalid completed single-match snapshot' using errcode = '22023';
  end if;
  -- These are required by the existing winner/king-capture comparisons. Their
  -- NULL values otherwise make the final OR predicate UNKNOWN, not TRUE.
  if operation->>'winsDelta' is null
      or operation->>'kingsCapturedDelta' is null then
    raise exception 'incomplete single-match operation' using errcode = '22023';
  end if;

  begin
    player_moves := (snapshot->>'playerSuccessfulMoves')::integer;
    bot_moves := (snapshot->>'botSuccessfulMoves')::integer;
    total_moves := (snapshot->>'totalSuccessfulMoves')::integer;
    captured_enemy := (snapshot->>'capturedEnemyPieces')::integer;
    captured_own := (snapshot->>'capturedOwnPieces')::integer;
    pawn_captures := (snapshot->>'pawnCaptures')::integer;
    triple_results := (snapshot->>'tripleRouletteResults')::integer;
    current_streak := (snapshot->>'currentConsecutiveThreeRightsTurns')::integer;
    best_streak := (snapshot->>'bestConsecutiveThreeRightsTurns')::integer;
    terminal_moves := (snapshot->>'terminalPlayerTurnMovesUsed')::integer;
    final_piece_count := (snapshot->>'finalOwnPieceCount')::integer;
    promotion_count := jsonb_array_length(snapshot->'promotedPawnIds');
    select count(distinct promoted #>> '{}') into distinct_promotion_count
      from jsonb_array_elements(snapshot->'promotedPawnIds') promoted;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid single-match numeric field' using errcode = '22023';
  end;

  player_won := snapshot->>'winner' = snapshot->>'playerColor';
  expected_kings_captured := case
    when player_won and snapshot->>'terminationReason'='king-captured' then 1
    else 0
  end;
  if player_moves not between 0 and 1000 or bot_moves not between 0 and 1000
      or total_moves <> player_moves + bot_moves
      or captured_enemy not between 0 and 16 or captured_own not between 0 and 16
      or pawn_captures not between 0 and captured_enemy
      or triple_results not between 0 and 1000
      or triple_results > coalesce((operation->>'rouletteRollsDelta')::integer,0)
      or current_streak not between 0 and 1000 or best_streak not between 0 and 1000
      or current_streak > best_streak or terminal_moves not between 0 and 3
      or final_piece_count not between 0 and 16
      or final_piece_count <> 16 - captured_own
      or promotion_count > 8 or distinct_promotion_count > 8
      or exists (
        select 1 from jsonb_array_elements(snapshot->'promotedPawnIds') promoted
        where jsonb_typeof(promoted) <> 'string' or length(promoted #>> '{}') = 0
      )
      or player_won <> ((operation->>'winsDelta')::integer = 1)
      or (operation->>'kingsCapturedDelta')::integer <> expected_kings_captured
      or (player_won and snapshot->>'terminationReason'='king-captured' and captured_enemy < 1) then
    raise exception 'inconsistent single-match snapshot' using errcode = '22023';
  end if;
  return resolved_match_id;
end;
$$;

commit;
