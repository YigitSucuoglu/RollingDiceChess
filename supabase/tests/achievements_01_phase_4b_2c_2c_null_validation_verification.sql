-- ACHIEVEMENTS-01 Phase 4B-2C-2C: run manually only AFTER migration 202609010010.
-- Pure private validator/evaluator only; synthetic JSON identities, no RPC,
-- no Auth/Player/ledger/unlock mutation. All temp objects are rolled back.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '2s';

do $$
begin
  if to_regprocedure('private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)') is null
      or to_regprocedure('private.evaluate_single_match_achievements(jsonb)') is null then
    raise exception 'single-match helpers are missing';
  end if;
  if (select provolatile from pg_catalog.pg_proc where oid =
      to_regprocedure('private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)')::oid) <> 'i'
      or (select provolatile from pg_catalog.pg_proc where oid =
      to_regprocedure('private.evaluate_single_match_achievements(jsonb)')::oid) <> 'i' then
    raise exception 'single-match helpers must remain IMMUTABLE';
  end if;
end;
$$;

create temporary table null_validation_results (
  case_name text primary key,
  expected text not null,
  actual text not null,
  passed boolean not null
) on commit drop;

create function pg_temp.null_validation_base()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'schemaVersion',1,'matchId','f4c20000-0000-4000-8000-000000000101',
    'snapshot',jsonb_build_object(
      'matchId','f4c20000-0000-4000-8000-000000000101',
      'playerId','f4c20000-0000-4000-8000-000000000001',
      'mode','singleplayer','playerColor','white','status','completed',
      'terminationReason','king-captured','winner','white',
      'valid',true,'complete',true,
      'playerSuccessfulMoves',40,'botSuccessfulMoves',35,
      'totalSuccessfulMoves',75,
      'promotedPawnIds',jsonb_build_array('pawn-a','pawn-b','pawn-c'),
      'capturedEnemyPieces',12,'capturedOwnPieces',0,'pawnCaptures',8,
      'tripleRouletteResults',4,
      'currentConsecutiveThreeRightsTurns',9,
      'bestConsecutiveThreeRightsTurns',9,
      'terminalPlayerTurnMovesUsed',3,'finalOwnPieceCount',16
    )
  );
$$;

create function pg_temp.null_validation_operation(single_match jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'xpDelta',25,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
    'playTimeSecondsDelta',30,
    'kingsCapturedDelta',case when single_match->'snapshot'->>'terminationReason'='king-captured'
      then 1 else 0 end,
    'rouletteRollsDelta',4,'playerTurnsCompletedDelta',10,
    'threeRightsTurnsDelta',10,
    'rollsByPieceDelta','{}'::jsonb,'movesByPieceDelta','{}'::jsonb,
    'capturesByPieceDelta','{}'::jsonb,'singleMatch',single_match
  );
$$;

create function pg_temp.null_validation_outcome(single_match jsonb, operation jsonb)
returns text language plpgsql as $$
begin
  perform private.validate_singleplayer_match_completion(
    'f4c20000-0000-4000-8000-000000000001'::uuid,
    single_match,operation
  );
  return 'ACCEPT';
exception
  when sqlstate '22023' then return 'REJECT-22023';
  when others then return 'UNEXPECTED-' || SQLSTATE;
end;
$$;

-- Every required snapshot key: absent and explicit JSON null must both reject.
with required(field_name) as (values
  ('matchId'),('playerId'),('mode'),('playerColor'),('status'),
  ('terminationReason'),('winner'),('valid'),('complete'),
  ('playerSuccessfulMoves'),('botSuccessfulMoves'),('totalSuccessfulMoves'),
  ('promotedPawnIds'),('capturedEnemyPieces'),('capturedOwnPieces'),
  ('pawnCaptures'),('tripleRouletteResults'),
  ('currentConsecutiveThreeRightsTurns'),('bestConsecutiveThreeRightsTurns'),
  ('terminalPlayerTurnMovesUsed'),('finalOwnPieceCount')
), variants as (
  select field_name,'missing' as variant,
    jsonb_set(pg_temp.null_validation_base(),'{snapshot}',
      (pg_temp.null_validation_base()->'snapshot') - field_name) as payload
  from required
  union all
  select field_name,'json_null',
    jsonb_set(pg_temp.null_validation_base(),array['snapshot',field_name],'null'::jsonb)
  from required
), outcomes as (
  select field_name || '_' || variant as case_name,
    pg_temp.null_validation_outcome(payload,pg_temp.null_validation_operation(payload)) as actual
  from variants
)
insert into null_validation_results
select case_name,'REJECT-22023',actual,actual='REJECT-22023' from outcomes;

-- The top-level version/match identity and operation comparison operands are
-- also mandatory for a versioned completion; no legacy payload is touched.
with base as (select pg_temp.null_validation_base() as payload), variants as (
  select 'top_schema_version_missing' as case_name,payload - 'schemaVersion' as match_payload,
    pg_temp.null_validation_operation(payload) as operation from base
  union all select 'top_schema_version_json_null',
    jsonb_set(payload,'{schemaVersion}','null'::jsonb),
    pg_temp.null_validation_operation(payload) from base
  union all select 'top_match_id_missing',payload - 'matchId',
    pg_temp.null_validation_operation(payload) from base
  union all select 'top_match_id_json_null',
    jsonb_set(payload,'{matchId}','null'::jsonb),
    pg_temp.null_validation_operation(payload) from base
  union all select 'operation_wins_delta_missing',payload,
    pg_temp.null_validation_operation(payload) - 'winsDelta' from base
  union all select 'operation_wins_delta_json_null',payload,
    jsonb_set(pg_temp.null_validation_operation(payload),'{winsDelta}','null'::jsonb) from base
  union all select 'operation_king_delta_missing',payload,
    pg_temp.null_validation_operation(payload) - 'kingsCapturedDelta' from base
  union all select 'operation_king_delta_json_null',payload,
    jsonb_set(pg_temp.null_validation_operation(payload),'{kingsCapturedDelta}','null'::jsonb) from base
), outcomes as (
  select case_name,pg_temp.null_validation_outcome(match_payload,operation) as actual
  from variants
)
insert into null_validation_results
select case_name,'REJECT-22023',actual,actual='REJECT-22023' from outcomes;

-- Existing valid v1 king-capture and timeout eligibility remain unchanged.
with valid_cases as (
  select 'valid_king_capture' as case_name,pg_temp.null_validation_base() as payload,
    array['last_one_standing','pawn_rebellion','perfect_rhythm','royal_ascension',
      'the_long_march','untouchable','wheels_favor']::text[] as expected_unlocks
  union all select 'valid_timeout',
    jsonb_set(pg_temp.null_validation_base(),'{snapshot,terminationReason}','"timeout"'::jsonb),
    array['pawn_rebellion','perfect_rhythm','royal_ascension',
      'the_long_march','wheels_favor']::text[]
), outcomes as (
  select case_name,
    pg_temp.null_validation_outcome(payload,pg_temp.null_validation_operation(payload)) as actual,
    (select array_agg(achievement_id order by achievement_id)
      from private.evaluate_single_match_achievements(payload)) = expected_unlocks as eligibility_unchanged
  from valid_cases
)
insert into null_validation_results
select case_name,'ACCEPT + original unlock IDs',
  actual || case when eligibility_unchanged then ' + original unlock IDs'
    else ' + CHANGED unlock IDs' end,
  actual='ACCEPT' and eligibility_unchanged
from outcomes;

select case_name,expected,actual,passed
from null_validation_results order by case_name;
select count(*) as total_cases,
  count(*) filter (where passed) as passed_cases,
  count(*) filter (where not passed) as failed_cases,
  bool_and(passed) as null_validation_regression_pass
from null_validation_results;

rollback;
