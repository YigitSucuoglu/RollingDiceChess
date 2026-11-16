-- ACHIEVEMENTS-01 Phase 4B-2B-2: evaluate validated SP match snapshots and
-- persist eligible single-match unlocks atomically with the existing ledger RPC.
begin;

alter table private.player_achievement_unlocks
  drop constraint player_achievement_unlocks_source_type_check;
alter table private.player_achievement_unlocks
  add constraint player_achievement_unlocks_source_type_check check (source_type in (
    'singleplayer-operation','singleplayer-match',
    'multiplayer-settlement','retroactive-career'
  ));

-- Replace the 2B-1 validator without changing its signature. The operation RPC
-- resolves the canonical player and invokes this before any ledger mutation.
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
      or snapshot->>'valid' <> 'true' or snapshot->>'complete' <> 'true'
      or jsonb_typeof(snapshot->'promotedPawnIds') <> 'array' then
    raise exception 'invalid completed single-match snapshot' using errcode = '22023';
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

create or replace function private.evaluate_single_match_achievements(single_match jsonb)
returns table(achievement_id text) language sql immutable set search_path = '' as $$
  with snapshot as (select single_match->'snapshot' as value), metrics as (
    select value,
      (value->>'totalSuccessfulMoves')::integer as total_moves,
      (select count(distinct promoted #>> '{}')
        from jsonb_array_elements(value->'promotedPawnIds') promoted) as promotions,
      (value->>'capturedEnemyPieces')::integer as enemy_captures,
      (value->>'tripleRouletteResults')::integer as triple_rolls,
      (value->>'finalOwnPieceCount')::integer as own_pieces,
      (value->>'capturedOwnPieces')::integer as own_captures,
      (value->>'pawnCaptures')::integer as pawn_captures,
      greatest(
        (value->>'bestConsecutiveThreeRightsTurns')::integer,
        (value->>'currentConsecutiveThreeRightsTurns')::integer
          + case when (value->>'terminalPlayerTurnMovesUsed')::integer=3 then 1 else 0 end
      ) as rhythm,
      value->>'terminationReason'='king-captured'
        and value->>'winner'=value->>'playerColor' as king_capture_win
    from snapshot
  )
  select candidate.achievement_id
  from metrics cross join lateral (values
    ('the_long_march', total_moves >= 75),
    ('royal_ascension', promotions >= 3),
    ('last_one_standing', enemy_captures >= 12 and king_capture_win),
    ('wheels_favor', triple_rolls >= 4),
    ('against_all_odds', own_pieces <= 3 and king_capture_win),
    ('untouchable', own_captures = 0 and king_capture_win),
    ('pawn_rebellion', pawn_captures >= 8),
    ('perfect_rhythm', rhythm >= 10)
  ) candidate(achievement_id,eligible)
  where candidate.eligible
  order by candidate.achievement_id;
$$;

create or replace function private.persist_single_match_achievement_unlocks()
returns trigger language plpgsql security definer set search_path = '' as $$
declare eligible_id text;
begin
  for eligible_id in
    select achievement_id
    from private.evaluate_single_match_achievements(new.completion_payload)
  loop
    perform private.persist_player_achievement_unlock(
      new.player_id,eligible_id,'singleplayer-match',new.match_id,1
    );
  end loop;
  return new;
end;
$$;

create trigger persist_single_match_achievement_unlocks
after insert on private.player_singleplayer_match_completions
for each row execute function private.persist_single_match_achievement_unlocks();

revoke all on function private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)
  from public,anon,authenticated;
revoke all on function private.evaluate_single_match_achievements(jsonb)
  from public,anon,authenticated;
revoke all on function private.persist_single_match_achievement_unlocks()
  from public,anon,authenticated;

commit;
