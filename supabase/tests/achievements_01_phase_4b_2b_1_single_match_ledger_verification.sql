-- Run only after 202609010008_achievements_01_phase_4b_2b_1_single_match_ledger.sql.
-- Every auth/player/progression/ledger fixture is enclosed by this transaction and rolled back.
begin;

create temporary table single_match_results(name text primary key, passed boolean not null)
  on commit drop;
create temporary table single_match_payloads(name text primary key, payload jsonb not null)
  on commit drop;

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values (
  '00000000-0000-0000-0000-000000000000','f4b20000-0000-4000-8000-000000000001',
  'authenticated','authenticated','single-match-ledger@example.invalid','',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{}',now(),now(),'','','',''
);

create temporary table single_match_player on commit drop as
select owner.player_id from public.player_auth_owners owner
where owner.auth_user_id='f4b20000-0000-4000-8000-000000000001';

insert into single_match_payloads values
('legacy',jsonb_build_object(
  'xpDelta',10,'gamesDelta',1,'winsDelta',0,'lossesDelta',1,
  'playTimeSecondsDelta',10,'rollsByPieceDelta','{}'::jsonb,
  'movesByPieceDelta','{}'::jsonb,'capturesByPieceDelta','{}'::jsonb
)),
('match',jsonb_build_object(
  'xpDelta',25,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
  'playTimeSecondsDelta',30,'kingsCapturedDelta',1,'rouletteRollsDelta',2,
  'playerTurnsCompletedDelta',1,'threeRightsTurnsDelta',1,
  'rollsByPieceDelta','{"pawn":3,"knight":3}'::jsonb,
  'movesByPieceDelta','{"pawn":2,"knight":1}'::jsonb,
  'capturesByPieceDelta','{"pawn":1}'::jsonb,
  'singleMatch',jsonb_build_object(
    'schemaVersion',1,'matchId','f4b20000-0000-4000-8000-000000000101',
    'snapshot',jsonb_build_object(
      'matchId','f4b20000-0000-4000-8000-000000000101',
      'mode','singleplayer','playerId',(select player_id from single_match_player)::text,
      'playerColor','white','status','completed','terminationReason','king-captured',
      'winner','white','valid',true,'playerSuccessfulMoves',3,
      'botSuccessfulMoves',2,'totalSuccessfulMoves',5,
      'promotedPawnIds',jsonb_build_array(),'capturedEnemyPieces',1,
      'capturedOwnPieces',0,'pawnCaptures',1,'tripleRouletteResults',0,
      'currentConsecutiveThreeRightsTurns',1,'bestConsecutiveThreeRightsTurns',1,
      'terminalPlayerTurnMovesUsed',3,'finalOwnPieceCount',16,'complete',true
    )
  )
));

-- The public RPC is intentionally exercised under the browser role. Grant that
-- role access only to this transaction-local fixture data.
grant select on table single_match_payloads to authenticated;
grant insert on table single_match_results to authenticated;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f4b20000-0000-4000-8000-000000000001','role','authenticated'
)::text,true);
set local role authenticated;

-- Legacy operations remain accepted and intentionally receive no fabricated match ledger row.
select public.apply_player_progression_operation(
  'f4b20000-0000-4000-8000-000000000201',
  (select payload from single_match_payloads where name='legacy')
);
-- First versioned completion and exact operation replay.
select public.apply_player_progression_operation(
  'f4b20000-0000-4000-8000-000000000202',
  (select payload from single_match_payloads where name='match')
);
select public.apply_player_progression_operation(
  'f4b20000-0000-4000-8000-000000000202',
  (select payload from single_match_payloads where name='match')
);
-- Same match, different operation, canonically equal completion is acknowledged without progression.
select public.apply_player_progression_operation(
  'f4b20000-0000-4000-8000-000000000203',
  (select payload from single_match_payloads where name='match')
);
reset role;

insert into single_match_results values
('legacy_operation_compatible',(
  select count(*)=1 from public.player_progression_operations operation
  where operation.player_id=(select player_id from single_match_player)
    and operation.operation_id='f4b20000-0000-4000-8000-000000000201'
)),
('legacy_has_no_fabricated_match_id',(
  select count(*)=1 from private.player_singleplayer_match_completions
  where player_id=(select player_id from single_match_player)
)),
('same_operation_replay_exactly_once',(
  select progression.games_played=2 and progression.total_xp=35
  from public.player_progression progression
  where progression.player_id=(select player_id from single_match_player)
)),
('same_match_different_operation_exactly_once',(
  select count(*)=2 from public.player_progression_operations operation
  where operation.player_id=(select player_id from single_match_player)
    and operation.operation_id in (
      'f4b20000-0000-4000-8000-000000000202',
      'f4b20000-0000-4000-8000-000000000203'
    )
)),
('match_ledger_canonical_player',(
  select count(*)=1 from private.player_singleplayer_match_completions completion
  where completion.match_id='f4b20000-0000-4000-8000-000000000101'
    and completion.player_id=(select player_id from single_match_player)
)),
('no_single_match_unlock_persistence',not exists(
  select 1 from private.player_achievement_unlocks unlock
  where unlock.player_id=(select player_id from single_match_player)
    and unlock.achievement_id in (
      'the_long_march','royal_ascension','last_one_standing','wheels_favor',
      'against_all_odds','untouchable','pawn_rebellion','perfect_rhythm'
    )
));

-- A conflicting operation replay and a conflicting match replay both roll back their subtransactions.
set local role authenticated;
do $$ begin
  begin
    perform public.apply_player_progression_operation(
      'f4b20000-0000-4000-8000-000000000202',
      jsonb_set((select payload from single_match_payloads where name='match'),'{xpDelta}','26')
    );
    insert into single_match_results values('same_operation_different_payload_rejected',false);
  exception when unique_violation then
    insert into single_match_results values('same_operation_different_payload_rejected',true);
  end;
  begin
    perform public.apply_player_progression_operation(
      'f4b20000-0000-4000-8000-000000000204',
      jsonb_set(
        (select payload from single_match_payloads where name='match'),
        '{singleMatch,snapshot,finalOwnPieceCount}','15'
      )
    );
    insert into single_match_results values('same_match_different_payload_rejected',false);
  exception when unique_violation then
    insert into single_match_results values('same_match_different_payload_rejected',true);
  end;
end $$;
reset role;

insert into single_match_results values
('conflicts_leave_progression_and_ledgers_unchanged',(
  select progression.games_played=2 and progression.total_xp=35
    and (select count(*) from private.player_singleplayer_match_completions completion
      where completion.player_id=progression.player_id)=1
    and not exists(select 1 from public.player_progression_operations operation
      where operation.player_id=progression.player_id
        and operation.operation_id='f4b20000-0000-4000-8000-000000000204')
  from public.player_progression progression
  where progression.player_id=(select player_id from single_match_player)
)),
('canonical_json_key_order_is_stable',(
  select extensions.digest('{"a":1,"b":2}'::jsonb::text,'sha256')
    = extensions.digest('{"b":2,"a":1}'::jsonb::text,'sha256')
)),
('concurrent_same_match_lock_present',position(
  'pg_advisory_xact_lock(hashtextextended(resolved_match_id::text, 0))'
  in pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
) > 0),
('private_ledger_browser_read_denied',
  not has_table_privilege('authenticated','private.player_singleplayer_match_completions','select')),
('private_ledger_browser_write_denied',
  not has_table_privilege('authenticated','private.player_singleplayer_match_completions','insert,update,delete')),
('validator_browser_execute_denied',
  not has_function_privilege('authenticated',
    'private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)','execute')),
('career_evaluator_preserved',position(
  'evaluate_and_persist_career_achievements'
  in pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
) > 0),
('operation_and_match_ledgers_both_present',position(
  'player_progression_operations'
  in pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
) > 0 and position(
  'player_singleplayer_match_completions'
  in pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
) > 0);

select
  bool_and(passed) as all_checks_pass,
  jsonb_object_agg(name,passed order by name) as checks
from single_match_results;

rollback;
