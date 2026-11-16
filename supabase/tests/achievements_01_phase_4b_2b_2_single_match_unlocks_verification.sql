-- Run only after 202609010009_achievements_01_phase_4b_2b_2_single_match_unlocks.sql.
-- All fixtures and temporary failure hooks are rolled back at the end.
begin;

create temporary table single_match_unlock_results(
  name text primary key, passed boolean not null
) on commit drop;

create or replace function pg_temp.single_match(
  requested_player uuid, requested_match uuid, patch jsonb default '{}'::jsonb
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'schemaVersion',1,'matchId',requested_match::text,'snapshot',
    jsonb_build_object(
      'matchId',requested_match::text,'mode','singleplayer',
      'playerId',requested_player::text,'playerColor','white','status','completed',
      'terminationReason','king-captured','winner','white','valid',true,
      'playerSuccessfulMoves',40,'botSuccessfulMoves',35,'totalSuccessfulMoves',75,
      'promotedPawnIds',jsonb_build_array('pawn-a','pawn-b','pawn-c'),
      'capturedEnemyPieces',12,'capturedOwnPieces',0,'pawnCaptures',8,
      'tripleRouletteResults',4,'currentConsecutiveThreeRightsTurns',9,
      'bestConsecutiveThreeRightsTurns',9,'terminalPlayerTurnMovesUsed',3,
      'finalOwnPieceCount',16,'complete',true
    ) || patch
  );
$$;

create or replace function pg_temp.progression_operation(
  single_match jsonb, won boolean default true
) returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'xpDelta',25,'gamesDelta',1,'winsDelta',case when won then 1 else 0 end,
    'lossesDelta',case when won then 0 else 1 end,'playTimeSecondsDelta',30,
    'kingsCapturedDelta',case when won
      and single_match->'snapshot'->>'terminationReason'='king-captured' then 1 else 0 end,
    'rouletteRollsDelta',4,'playerTurnsCompletedDelta',10,'threeRightsTurnsDelta',10,
    'rollsByPieceDelta','{}'::jsonb,'movesByPieceDelta','{}'::jsonb,
    'capturesByPieceDelta','{}'::jsonb,'singleMatch',single_match
  );
$$;

-- Direct private evaluator contract: all positive boundaries, threshold-minus-one,
-- timeout semantics, distinct promotions and terminal third-right behavior.
with ids as (
  select achievement_id from private.evaluate_single_match_achievements(
    pg_temp.single_match(
      'f4b22000-0000-4000-8000-000000000001',
      'f4b22000-0000-4000-8000-000000000101'
    )
  )
) insert into single_match_unlock_results values
('seven_positive_boundaries_except_against_all_odds',(
  select array_agg(achievement_id order by achievement_id)=array[
    'last_one_standing','pawn_rebellion','perfect_rhythm','royal_ascension',
    'the_long_march','untouchable','wheels_favor'
  ] from ids
)),
('against_all_odds_positive_boundary',exists(
  select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001',
    'f4b22000-0000-4000-8000-000000000102',
    '{"capturedOwnPieces":13,"finalOwnPieceCount":3}'::jsonb
  )) where achievement_id='against_all_odds'
)),
('all_threshold_negative_boundaries',
  not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000111',
    '{"playerSuccessfulMoves":39,"botSuccessfulMoves":35,"totalSuccessfulMoves":74}'::jsonb
  )) where achievement_id='the_long_march')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000112',
    '{"promotedPawnIds":["pawn-a","pawn-b","pawn-b"]}'::jsonb
  )) where achievement_id='royal_ascension')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000113',
    '{"capturedEnemyPieces":11}'::jsonb
  )) where achievement_id='last_one_standing')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000114',
    '{"tripleRouletteResults":3}'::jsonb
  )) where achievement_id='wheels_favor')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000115',
    '{"capturedOwnPieces":12,"finalOwnPieceCount":4}'::jsonb
  )) where achievement_id='against_all_odds')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000116',
    '{"capturedOwnPieces":1,"finalOwnPieceCount":15}'::jsonb
  )) where achievement_id='untouchable')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000117',
    '{"pawnCaptures":7}'::jsonb
  )) where achievement_id='pawn_rebellion')
  and not exists(select 1 from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000118',
    '{"currentConsecutiveThreeRightsTurns":9,"bestConsecutiveThreeRightsTurns":9,"terminalPlayerTurnMovesUsed":2}'::jsonb
  )) where achievement_id='perfect_rhythm')
),
('timeout_allows_only_five_non_victory_challenges',(
  select array_agg(achievement_id order by achievement_id)=array[
    'pawn_rebellion','perfect_rhythm','royal_ascension','the_long_march','wheels_favor'
  ] from private.evaluate_single_match_achievements(pg_temp.single_match(
    'f4b22000-0000-4000-8000-000000000001','f4b22000-0000-4000-8000-000000000119',
    '{"terminationReason":"timeout"}'::jsonb
  ))
));

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values
('00000000-0000-0000-0000-000000000000','f4b22000-0000-4000-8000-000000000001',
 'authenticated','authenticated','single-match-unlocks-a@example.invalid','',now(),
 '{"provider":"google","providers":["google"]}'::jsonb,'{}',now(),now(),'','','',''),
('00000000-0000-0000-0000-000000000000','f4b22000-0000-4000-8000-000000000002',
 'authenticated','authenticated','single-match-unlocks-b@example.invalid','',now(),
 '{"provider":"google","providers":["google"]}'::jsonb,'{}',now(),now(),'','','','');

create temporary table single_match_players on commit drop as
select auth_user_id,player_id from public.player_auth_owners
where auth_user_id in (
  'f4b22000-0000-4000-8000-000000000001',
  'f4b22000-0000-4000-8000-000000000002'
);
create temporary table single_match_operations(name text primary key,payload jsonb not null)
  on commit drop;
insert into single_match_operations values
('first',pg_temp.progression_operation(pg_temp.single_match(
  (select player_id from single_match_players where auth_user_id='f4b22000-0000-4000-8000-000000000001'),
  'f4b22000-0000-4000-8000-000000000201'
))),
('second',pg_temp.progression_operation(pg_temp.single_match(
  (select player_id from single_match_players where auth_user_id='f4b22000-0000-4000-8000-000000000001'),
  'f4b22000-0000-4000-8000-000000000202',
  '{"capturedOwnPieces":13,"finalOwnPieceCount":3}'::jsonb
)));
grant select on table single_match_operations to authenticated;
grant select on table single_match_players to authenticated;

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f4b22000-0000-4000-8000-000000000001','role','authenticated'
)::text,true);
set local role authenticated;
select public.apply_player_progression_operation(
  'f4b22000-0000-4000-8000-000000000301',
  (select payload from single_match_operations where name='first')
);
select public.apply_player_progression_operation(
  'f4b22000-0000-4000-8000-000000000301',
  (select payload from single_match_operations where name='first')
);
select public.apply_player_progression_operation(
  'f4b22000-0000-4000-8000-000000000302',
  (select payload from single_match_operations where name='first')
);
select public.apply_player_progression_operation(
  'f4b22000-0000-4000-8000-000000000303',
  (select payload from single_match_operations where name='second')
);
reset role;

insert into single_match_unlock_results values
('all_eight_unlocks_persisted_once',(
  select count(*)=8 from private.player_achievement_unlocks unlock
  where unlock.player_id=(select player_id from single_match_players
    where auth_user_id='f4b22000-0000-4000-8000-000000000001')
    and unlock.source_type='singleplayer-match'
)),
('operation_and_match_replay_do_not_repeat_progression',(
  select progression.games_played=2
  from public.player_progression progression
  where progression.player_id=(select player_id from single_match_players
    where auth_user_id='f4b22000-0000-4000-8000-000000000001')
)),
('public_read_contract_returns_single_match_unlocks',(
  select (public.get_current_player_achievements()->>'unlockedCount')::integer >= 8
)),
('canonical_match_source_ids_preserved',(
  select count(distinct source_id)=2 from private.player_achievement_unlocks unlock
  where unlock.player_id=(select player_id from single_match_players
    where auth_user_id='f4b22000-0000-4000-8000-000000000001')
    and unlock.source_type='singleplayer-match'
)),
('career_evaluation_still_runs',position(
  'evaluate_and_persist_career_achievements'
  in pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
) > 0);

-- Invalid version is rejected before any ledger mutation.
set local role authenticated;
do $$ begin
  begin
    perform public.apply_player_progression_operation(
      'f4b22000-0000-4000-8000-000000000304',
      jsonb_set((select payload from single_match_operations where name='first'),
        '{singleMatch,schemaVersion}','2')
    );
    raise exception 'invalid schema version was accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
reset role;
insert into single_match_unlock_results values
('invalid_schema_rejected_without_mutation',not exists(
  select 1 from public.player_progression_operations operation
  where operation.operation_id='f4b22000-0000-4000-8000-000000000304'
));

-- Force unlock persistence failure for player B; ledgers and progression must roll back.
create function private.single_match_unlock_forced_failure()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.player_id=(select player_id from pg_temp.single_match_players
      where auth_user_id='f4b22000-0000-4000-8000-000000000002') then
    raise exception 'forced single-match unlock failure' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger single_match_unlock_forced_failure
before insert on private.player_achievement_unlocks
for each row execute function private.single_match_unlock_forced_failure();

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f4b22000-0000-4000-8000-000000000002','role','authenticated'
)::text,true);
do $$ begin
  begin
    perform public.apply_player_progression_operation(
      'f4b22000-0000-4000-8000-000000000305',
      pg_temp.progression_operation(pg_temp.single_match(
        (select player_id from pg_temp.single_match_players
          where auth_user_id='f4b22000-0000-4000-8000-000000000002'),
        'f4b22000-0000-4000-8000-000000000205'
      ))
    );
    raise exception 'forced unlock failure did not occur';
  exception when check_violation then null;
  end;
end $$;
insert into single_match_unlock_results values
('unlock_failure_rolls_back_entire_completion',(
  select progression.games_played=0
    and not exists(select 1 from public.player_progression_operations operation
      where operation.player_id=progression.player_id)
    and not exists(select 1 from private.player_singleplayer_match_completions completion
      where completion.player_id=progression.player_id)
    and not exists(select 1 from private.player_achievement_unlocks unlock
      where unlock.player_id=progression.player_id)
  from public.player_progression progression
  where progression.player_id=(select player_id from pg_temp.single_match_players
    where auth_user_id='f4b22000-0000-4000-8000-000000000002')
));
reset role;

insert into single_match_unlock_results values
('private_evaluator_browser_denied',not has_function_privilege(
  'authenticated','private.evaluate_single_match_achievements(jsonb)','execute')),
('private_unlock_table_browser_denied',
  not has_table_privilege('authenticated','private.player_achievement_unlocks','select,insert,update,delete')),
('private_match_ledger_browser_denied',
  not has_table_privilege('authenticated','private.player_singleplayer_match_completions','select,insert,update,delete')),
('trigger_is_atomic_with_match_ledger',exists(
  select 1 from pg_trigger where tgrelid='private.player_singleplayer_match_completions'::regclass
    and tgname='persist_single_match_achievement_unlocks' and not tgisinternal
));

select bool_and(passed) as all_checks_pass,
  jsonb_object_agg(name,passed order by name) as checks
from single_match_unlock_results;

rollback;
