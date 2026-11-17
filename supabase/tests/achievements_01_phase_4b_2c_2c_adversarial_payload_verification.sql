-- ACHIEVEMENTS-01 Phase 4B-2C-2C: controlled payload-validator probe.
-- Manually run in Supabase SQL Editor only after the read-only preflight passes.
-- This script NEVER calls public.apply_player_progression_operation and NEVER
-- inserts an Auth user, Player, progression, match ledger, or achievement unlock.
-- Synthetic UUIDs exist only inside JSON. Temporary objects are rolled back.
-- REVIEW means current schemaVersion 1 behavior is being observed, not approved.
begin;
set local statement_timeout = '30s';
set local lock_timeout = '2s';

do $$
begin
  if to_regprocedure('private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)') is null
      or to_regprocedure('private.evaluate_single_match_achievements(jsonb)') is null then
    raise exception 'required pure achievement helpers are missing';
  end if;
  if (select provolatile from pg_catalog.pg_proc where oid =
      to_regprocedure('private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)')::oid) <> 'i'
      or (select provolatile from pg_catalog.pg_proc where oid =
      to_regprocedure('private.evaluate_single_match_achievements(jsonb)')::oid) <> 'i' then
    raise exception 'achievement helpers are not declared IMMUTABLE; stop before probes';
  end if;
end;
$$;

create temporary table achievement_payload_cases (
  case_name text primary key,
  expected text not null check (expected in ('ACCEPT','REJECT','REVIEW')),
  single_match jsonb not null
) on commit drop;
create temporary table achievement_payload_results (
  case_name text primary key,
  expected text not null,
  actual text not null,
  sqlstate text,
  unlock_ids text[]
) on commit drop;

create function pg_temp.achievement_match_base()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'schemaVersion',1,
    'matchId','f4c20000-0000-4000-8000-000000000101',
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

create function pg_temp.achievement_operation_for(single_match jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'xpDelta',25,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
    'playTimeSecondsDelta',30,
    'kingsCapturedDelta',case when single_match->'snapshot'->>'terminationReason' = 'king-captured'
      then 1 else 0 end,
    'rouletteRollsDelta',4,'playerTurnsCompletedDelta',10,
    'threeRightsTurnsDelta',10,
    'rollsByPieceDelta','{}'::jsonb,'movesByPieceDelta','{}'::jsonb,
    'capturesByPieceDelta','{}'::jsonb,'singleMatch',single_match
  );
$$;

insert into achievement_payload_cases(case_name,expected,single_match) values
  ('valid_king_capture','ACCEPT',pg_temp.achievement_match_base()),
  ('missing_required_integer','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot}',
      (pg_temp.achievement_match_base()->'snapshot') - 'playerSuccessfulMoves')),
  ('explicit_json_null_integer','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,playerSuccessfulMoves}','null'::jsonb)),
  ('missing_total_moves_sql_null','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot}',
      (pg_temp.achievement_match_base()->'snapshot') - 'totalSuccessfulMoves')),
  ('missing_required_boolean','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot}',
      (pg_temp.achievement_match_base()->'snapshot') - 'complete')),
  ('invalid_integer_text','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,playerSuccessfulMoves}','"forty"'::jsonb)),
  ('negative_integer','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,playerSuccessfulMoves}','-1'::jsonb)),
  ('fractional_integer','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,playerSuccessfulMoves}','1.5'::jsonb)),
  ('integer_overflow','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,playerSuccessfulMoves}',
      '99999999999999999999'::jsonb)),
  ('oversized_promotion_id','REVIEW',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,promotedPawnIds}',
      jsonb_build_array(repeat('x',4096)))),
  ('oversized_json_extra_field','REVIEW',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,extraBlob}',
      to_jsonb(repeat('x',131072)))),
  ('unknown_snapshot_field','REVIEW',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,unknownField}','true'::jsonb)),
  ('unknown_single_match_field','REJECT',
    pg_temp.achievement_match_base() || '{"unknownField":true}'::jsonb),
  ('duplicate_promotion_id','REVIEW',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,promotedPawnIds}',
      '["pawn-a","pawn-a"]'::jsonb)),
  ('invalid_promotion_id_shape','REVIEW',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,promotedPawnIds}',
      '["not-a-real-piece-id"]'::jsonb)),
  ('unsupported_schema_version','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{schemaVersion}','2'::jsonb)),
  ('unsupported_outcome','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,terminationReason}',
      '"technical-abort"'::jsonb)),
  ('impossible_move_sum','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,totalSuccessfulMoves}','999'::jsonb)),
  ('player_id_mismatch','REJECT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,playerId}',
      '"f4c20000-0000-4000-8000-000000000002"'::jsonb)),
  ('valid_timeout','ACCEPT',
    jsonb_set(pg_temp.achievement_match_base(),'{snapshot,terminationReason}',
      '"timeout"'::jsonb));

do $$
declare
  probe record;
  evaluated_ids text[];
begin
  for probe in select * from achievement_payload_cases order by case_name loop
    begin
      perform private.validate_singleplayer_match_completion(
        'f4c20000-0000-4000-8000-000000000001'::uuid,
        probe.single_match,
        pg_temp.achievement_operation_for(probe.single_match)
      );
      select coalesce(array_agg(achievement_id order by achievement_id),'{}'::text[])
        into evaluated_ids
      from private.evaluate_single_match_achievements(probe.single_match);
      insert into achievement_payload_results
      values (probe.case_name,probe.expected,'ACCEPT',null,evaluated_ids);
    exception when others then
      insert into achievement_payload_results
      values (probe.case_name,probe.expected,'REJECT',SQLSTATE,null);
    end;
  end loop;
end;
$$;

select case_name, expected, actual, sqlstate,
  case when expected = 'REVIEW' then null else expected = actual end as passed,
  case when actual = 'ACCEPT' then unlock_ids else null end as evaluator_unlock_ids
from achievement_payload_results order by case_name;

select
  count(*) filter (where expected <> 'REVIEW' and expected = actual) as confirmed_expectations,
  count(*) filter (where expected <> 'REVIEW' and expected <> actual) as mismatched_expectations,
  count(*) filter (where expected = 'REVIEW') as review_cases,
  count(*) as total_cases,
  coalesce((
    select actual = 'ACCEPT' and not coalesce(
      unlock_ids && array['last_one_standing','against_all_odds','untouchable']::text[],
      false
    ) from achievement_payload_results where case_name = 'valid_timeout'
  ), false) as timeout_excludes_king_capture_only_challenges
from achievement_payload_results;

rollback;
