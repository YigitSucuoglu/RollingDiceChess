-- Run after 202609010006_achievements_01_phase_3b_2b_career_runtime.sql.
-- All auth, player, match, counter, unlock, trigger and ledger fixtures roll back.
begin;

create temporary table achievement_runtime_results(
  name text primary key,
  passed boolean not null
) on commit drop;

-- Auth-backed SP fixtures exercise the public current-player operation boundary.
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values
  ('00000000-0000-0000-0000-000000000000','f3b30000-0000-4000-8000-000000000001',
   'authenticated','authenticated','achievement-runtime-a@example.invalid','',now(),
   '{"provider":"google","providers":["google"]}'::jsonb,'{}',now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','f3b30000-0000-4000-8000-000000000002',
   'authenticated','authenticated','achievement-runtime-b@example.invalid','',now(),
   '{"provider":"google","providers":["google"]}'::jsonb,'{}',now(),now(),'','','','');

create temporary table achievement_runtime_players on commit drop as
select owner.auth_user_id,owner.player_id
from public.player_auth_owners owner
where owner.auth_user_id in (
  'f3b30000-0000-4000-8000-000000000001',
  'f3b30000-0000-4000-8000-000000000002'
);

update public.player_progression progression set
  total_xp=40179,games_played=499,wins=499,losses=0,
  current_win_streak=2,best_win_streak=2,kings_captured=99,
  roulette_rolls=4999,player_turns_completed=24,three_rights_turns=24,
  triple_pawn_rolls=94,triple_knight_rolls=1,triple_bishop_rolls=1,
  triple_rook_rolls=1,triple_queen_rolls=1,triple_king_rolls=1
where progression.player_id=(select player_id from achievement_runtime_players
  where auth_user_id='f3b30000-0000-4000-8000-000000000001');
update public.player_piece_statistics statistic set moves=case statistic.piece_type
  when 'pawn' then 499 when 'knight' then 249 when 'king' then 99 else 0 end
where statistic.player_id=(select player_id from achievement_runtime_players
  where auth_user_id='f3b30000-0000-4000-8000-000000000001');

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f3b30000-0000-4000-8000-000000000001','role','authenticated'
)::text,true);
set local role authenticated;
select public.apply_player_progression_operation(
  'f3b30000-0000-4000-8000-000000000101',
  jsonb_build_object(
    'xpDelta',1,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
    'playTimeSecondsDelta',1,'kingsCapturedDelta',1,'rouletteRollsDelta',1,
    'playerTurnsCompletedDelta',1,'threeRightsTurnsDelta',1,
    'triplePawnRollsDelta',1,
    'rollsByPieceDelta','{}'::jsonb,
    'movesByPieceDelta','{"pawn":1,"knight":1,"king":1}'::jsonb,
    'capturesByPieceDelta','{}'::jsonb
  )
);
-- Exact replay must be a no-op.
select public.apply_player_progression_operation(
  'f3b30000-0000-4000-8000-000000000101',
  jsonb_build_object(
    'xpDelta',1,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
    'playTimeSecondsDelta',1,'kingsCapturedDelta',1,'rouletteRollsDelta',1,
    'playerTurnsCompletedDelta',1,'threeRightsTurnsDelta',1,
    'triplePawnRollsDelta',1,
    'rollsByPieceDelta','{}'::jsonb,
    'movesByPieceDelta','{"pawn":1,"knight":1,"king":1}'::jsonb,
    'capturesByPieceDelta','{}'::jsonb
  )
);
reset role;

insert into achievement_runtime_results values
('singleplayer_all_career_thresholds',(
  select count(*)=16 from private.player_achievement_unlocks unlock
  where unlock.player_id=(select player_id from achievement_runtime_players
    where auth_user_id='f3b30000-0000-4000-8000-000000000001')
)),
('singleplayer_replay_exactly_once',(
  select progression.games_played=500 and progression.total_xp=40180
    and (select count(*) from public.player_progression_operations operation
      where operation.player_id=progression.player_id
        and operation.operation_id='f3b30000-0000-4000-8000-000000000101')=1
  from public.player_progression progression
  where progression.player_id=(select player_id from achievement_runtime_players
    where auth_user_id='f3b30000-0000-4000-8000-000000000001')
)),
('single_match_ids_never_unlocked',not exists(
  select 1 from private.player_achievement_unlocks unlock
  where unlock.achievement_id in (
    'the_long_march','royal_ascension','last_one_standing','wheels_favor',
    'against_all_odds','untouchable','pawn_rebellion','perfect_rhythm'
  )
));

do $$ begin
  begin
    perform public.apply_player_progression_operation(
      'f3b30000-0000-4000-8000-000000000101',
      jsonb_build_object(
        'xpDelta',2,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
        'playTimeSecondsDelta',1,'kingsCapturedDelta',1,'rouletteRollsDelta',1,
        'playerTurnsCompletedDelta',1,'threeRightsTurnsDelta',1,
        'triplePawnRollsDelta',1,'rollsByPieceDelta','{}'::jsonb,
        'movesByPieceDelta','{"pawn":1,"knight":1,"king":1}'::jsonb,
        'capturesByPieceDelta','{}'::jsonb
      )
    );
    insert into achievement_runtime_results values('singleplayer_conflicting_replay_rejected',false);
  exception when unique_violation then
    insert into achievement_runtime_results values('singleplayer_conflicting_replay_rejected',true);
  end;
end $$;

create function private.achievement_runtime_forced_failure()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.source_id in (
    'f3b30000-0000-4000-8000-000000000102'::uuid,
    'f3b30000-0000-4000-8000-000000000033'::uuid
  ) then
    raise exception 'forced achievement persistence failure' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger achievement_runtime_force_failure
before insert on private.player_achievement_unlocks
for each row execute function private.achievement_runtime_forced_failure();

update public.player_progression progression set games_played=9,wins=9,losses=0
where progression.player_id=(select player_id from achievement_runtime_players
  where auth_user_id='f3b30000-0000-4000-8000-000000000002');
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f3b30000-0000-4000-8000-000000000002','role','authenticated'
)::text,true);
do $$ begin
  begin
    perform public.apply_player_progression_operation(
      'f3b30000-0000-4000-8000-000000000102',
      jsonb_build_object(
        'xpDelta',1,'gamesDelta',1,'winsDelta',1,'lossesDelta',0,
        'playTimeSecondsDelta',1,'rollsByPieceDelta','{}'::jsonb,
        'movesByPieceDelta','{}'::jsonb,'capturesByPieceDelta','{}'::jsonb
      )
    );
    raise exception 'forced SP failure did not occur';
  exception when check_violation then null;
  end;
end $$;
insert into achievement_runtime_results values
('singleplayer_atomic_failure_rolls_back',(
  select progression.games_played=9
    and not exists(select 1 from public.player_progression_operations operation
      where operation.player_id=progression.player_id
        and operation.operation_id='f3b30000-0000-4000-8000-000000000102')
    and not exists(select 1 from private.player_achievement_unlocks unlock
      where unlock.player_id=progression.player_id)
  from public.player_progression progression
  where progression.player_id=(select player_id from achievement_runtime_players
    where auth_user_id='f3b30000-0000-4000-8000-000000000002')
));

-- MP fixtures exercise projection -> rating/completion -> career evaluation.
insert into public.players(player_id,display_name,ownership_kind) values
 ('f3b30000-0000-4000-8000-000000000011','CareerRankA','guest'),
 ('f3b30000-0000-4000-8000-000000000012','CareerRankB','guest'),
 ('f3b30000-0000-4000-8000-000000000013','CareerCasualA','guest'),
 ('f3b30000-0000-4000-8000-000000000014','CareerCasualB','guest');
insert into public.player_progression(player_id) values
 ('f3b30000-0000-4000-8000-000000000011'),('f3b30000-0000-4000-8000-000000000012'),
 ('f3b30000-0000-4000-8000-000000000013'),('f3b30000-0000-4000-8000-000000000014');
insert into public.player_ratings(
 player_id,multiplayer_rating,rated_games,ranked_wins,ranked_losses
) values
 ('f3b30000-0000-4000-8000-000000000011',1490,99,0,99),
 ('f3b30000-0000-4000-8000-000000000012',1490,99,0,99),
 ('f3b30000-0000-4000-8000-000000000013',1600,30,30,0),
 ('f3b30000-0000-4000-8000-000000000014',1600,30,30,0);
insert into public.player_piece_statistics(player_id,piece_type)
select player_id,piece_type from (values
 ('f3b30000-0000-4000-8000-000000000011'::uuid),('f3b30000-0000-4000-8000-000000000012'::uuid),
 ('f3b30000-0000-4000-8000-000000000013'::uuid),('f3b30000-0000-4000-8000-000000000014'::uuid)
) player(player_id) cross join (values('pawn'),('knight'),('bishop'),('rook'),('queen'),('king')) piece(piece_type);

insert into private.multiplayer_lobbies(
 lobby_id,host_player_id,opponent_player_id,visibility,mode,side_preference,
 time_control_id,initial_ms,increment_ms,status
) values
 ('f3b30000-0000-4000-8000-000000000021','f3b30000-0000-4000-8000-000000000011','f3b30000-0000-4000-8000-000000000012','public','ranked','random','rapid-10-0',600000,0,'closed'),
 ('f3b30000-0000-4000-8000-000000000022','f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014','public','unranked','random','rapid-10-0',600000,0,'closed'),
 ('f3b30000-0000-4000-8000-000000000023','f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014','public','ranked','random','rapid-10-0',600000,0,'closed');
insert into private.multiplayer_matches(
 match_id,lobby_id,player_a_id,player_b_id,white_player_id,black_player_id,
 mode,time_control_id,initial_ms,increment_ms,status,revision,winner_player_id,termination_reason
) values
 ('f3b30000-0000-4000-8000-000000000031','f3b30000-0000-4000-8000-000000000021','f3b30000-0000-4000-8000-000000000011','f3b30000-0000-4000-8000-000000000012','f3b30000-0000-4000-8000-000000000011','f3b30000-0000-4000-8000-000000000012','ranked','rapid-10-0',600000,0,'terminal',2,'f3b30000-0000-4000-8000-000000000011','king-captured'),
 ('f3b30000-0000-4000-8000-000000000032','f3b30000-0000-4000-8000-000000000022','f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014','f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014','unranked','rapid-10-0',600000,0,'terminal',2,'f3b30000-0000-4000-8000-000000000013','timeout'),
 ('f3b30000-0000-4000-8000-000000000033','f3b30000-0000-4000-8000-000000000023','f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014','f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014','ranked','rapid-10-0',600000,0,'terminal',2,'f3b30000-0000-4000-8000-000000000013','timeout');

do $$
declare fixture record; participant_a jsonb; participant_b jsonb;
  rich_piece jsonb:='{"pawn":500,"knight":250,"bishop":1,"rook":1,"queen":1,"king":100}'::jsonb;
  triple_piece jsonb:='{"pawn":95,"knight":1,"bishop":1,"rook":1,"queen":1,"king":1}'::jsonb;
begin
  for fixture in select * from (values
    ('f3b30000-0000-4000-8000-000000000031'::uuid,'ranked','f3b30000-0000-4000-8000-000000000011'::uuid,'f3b30000-0000-4000-8000-000000000012'::uuid,'f3b30000-0000-4000-8000-000000000011'::uuid),
    ('f3b30000-0000-4000-8000-000000000032'::uuid,'unranked','f3b30000-0000-4000-8000-000000000013'::uuid,'f3b30000-0000-4000-8000-000000000014'::uuid,'f3b30000-0000-4000-8000-000000000013'::uuid),
    ('f3b30000-0000-4000-8000-000000000033'::uuid,'ranked','f3b30000-0000-4000-8000-000000000013'::uuid,'f3b30000-0000-4000-8000-000000000014'::uuid,'f3b30000-0000-4000-8000-000000000013'::uuid)
  ) item(match_id,mode,player_a_id,player_b_id,winner_id) loop
    participant_a:=jsonb_build_object('playerId',fixture.player_a_id,'rouletteRolls',5000,
      'playTimeMs',1000,'playerTurnsCompleted',25,'threeRightsTurns',25,'kingsCaptured',1,
      'rollsByPiece',rich_piece,'movesByPiece',rich_piece,'tripleRollsByPiece',triple_piece);
    participant_b:=participant_a || jsonb_build_object('playerId',fixture.player_b_id);
    insert into private.multiplayer_career_telemetry_settlements(
      match_id,match_mode,player_a_id,player_b_id,winner_player_id,
      termination_reason,telemetry_snapshot
    ) values(fixture.match_id,fixture.mode::public.multiplayer_mode,
      fixture.player_a_id,fixture.player_b_id,fixture.winner_id,
      case when fixture.mode='ranked' then 'king-captured' else 'timeout' end,
      jsonb_build_object('white',participant_a,'black',participant_b));
  end loop;
end;
$$;

-- Seed the ranked winner at a four-game best/current streak. Projection makes it five.
insert into private.player_multiplayer_statistics(
 player_id,current_ranked_win_streak,best_ranked_win_streak
) values('f3b30000-0000-4000-8000-000000000011',4,4);

do $$ declare match_row private.multiplayer_matches%rowtype; begin
  perform private.project_multiplayer_career_settlement('f3b30000-0000-4000-8000-000000000031');
  select * into match_row from private.multiplayer_matches
    where match_id='f3b30000-0000-4000-8000-000000000031';
  perform private.settle_multiplayer_match_if_eligible(match_row);
  -- Replay is idempotent across projection, rating settlement and unlock PKs.
  perform private.settle_multiplayer_match_if_eligible(match_row);

  perform private.project_multiplayer_career_settlement('f3b30000-0000-4000-8000-000000000032');
  select * into match_row from private.multiplayer_matches
    where match_id='f3b30000-0000-4000-8000-000000000032';
  perform private.settle_multiplayer_match_if_eligible(match_row);
  match_row.match_id:='f3b30000-0000-4000-8000-000000000099';
  match_row.status:='technical-abort';
  match_row.winner_player_id:=null;
  match_row.termination_reason:='technical-abort';
  perform private.settle_multiplayer_match_if_eligible(match_row);
end $$;

do $$ declare match_row private.multiplayer_matches%rowtype; begin
  begin
    perform private.project_multiplayer_career_settlement(
      'f3b30000-0000-4000-8000-000000000033'
    );
    select * into match_row from private.multiplayer_matches
      where match_id='f3b30000-0000-4000-8000-000000000033';
    perform private.settle_multiplayer_match_if_eligible(match_row);
    raise exception 'forced MP failure did not occur';
  exception when check_violation then null;
  end;
end $$;

insert into achievement_runtime_results values
('ranked_rating_after_and_streak_used',(
  select rating.multiplayer_rating=1505 and rating.rated_games=100
    and statistic.best_ranked_win_streak=5
    and exists(select 1 from private.player_achievement_unlocks unlock
      where unlock.player_id=rating.player_id and unlock.achievement_id='elite_player')
    and exists(select 1 from private.player_achievement_unlocks unlock
      where unlock.player_id=rating.player_id and unlock.achievement_id='winning_streak')
  from public.player_ratings rating
  join private.player_multiplayer_statistics statistic using(player_id)
  where rating.player_id='f3b30000-0000-4000-8000-000000000011'
)),
('ranked_settlement_replay_exactly_once',(
  select count(*)=1 from private.rating_settlements settlement
  where settlement.match_id='f3b30000-0000-4000-8000-000000000031'
)),
('unranked_cannot_unlock_ranked',not exists(
  select 1 from private.player_achievement_unlocks unlock
  where unlock.player_id in ('f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014')
    and unlock.achievement_id in ('ranked_victor','ranked_regular','ranked_veteran',
      'winning_streak','rating_climber','elite_player')
)),
('unranked_contributes_global',(
  select count(*)=18 from private.player_achievement_unlocks unlock
  where unlock.player_id in ('f3b30000-0000-4000-8000-000000000013','f3b30000-0000-4000-8000-000000000014')
)),
('technical_abort_excluded',not exists(
  select 1 from private.player_achievement_unlocks unlock
  where unlock.source_id='f3b30000-0000-4000-8000-000000000099'
)),
('multiplayer_atomic_failure_rolls_back',
  (select projection_applied_at is null
    from private.multiplayer_career_telemetry_settlements settlement
    where settlement.match_id='f3b30000-0000-4000-8000-000000000033')
  and not exists(select 1 from private.rating_settlements settlement
    where settlement.match_id='f3b30000-0000-4000-8000-000000000033')
  and (select rated_games=30 from public.player_ratings rating
    where rating.player_id='f3b30000-0000-4000-8000-000000000013')
));

-- Contract/security checks supplement behavioral transaction tests.
insert into achievement_runtime_results values
('browser_authority_denied',
  not has_function_privilege('authenticated',
    'private.evaluate_and_persist_career_achievements(uuid,text,uuid)','EXECUTE')
  and not has_function_privilege('anon',
    'private.evaluate_and_persist_career_achievements(uuid,text,uuid)','EXECUTE')
  and not has_table_privilege('authenticated',
    'private.player_achievement_unlocks','INSERT,UPDATE,DELETE')),
('transaction_call_chain_present',
  pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
    like '%private.evaluate_and_persist_career_achievements%'
  and pg_get_functiondef(
    'private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)'::regprocedure
  ) like '%private.settle_ranked_match%'
  and pg_get_functiondef(
    'private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)'::regprocedure
  ) like '%private.evaluate_and_persist_career_achievements%'),
('catalog_has_only_22_runtime_ids',(
  select count(distinct unlock.achievement_id)=22
  from private.player_achievement_unlocks unlock
  where unlock.player_id in (
    select player_id from achievement_runtime_players
    union all select 'f3b30000-0000-4000-8000-000000000011'::uuid
    union all select 'f3b30000-0000-4000-8000-000000000012'::uuid
    union all select 'f3b30000-0000-4000-8000-000000000013'::uuid
    union all select 'f3b30000-0000-4000-8000-000000000014'::uuid
  )
));

select
  bool_and(passed) as all_runtime_checks_pass,
  count(*)=14 as runtime_check_count_correct,
  bool_and(passed) filter(where name like 'singleplayer%') as singleplayer_runtime_correct,
  bool_and(passed) filter(where name like 'ranked%') as ranked_runtime_correct,
  bool_and(passed) filter(where name like 'unranked%') as unranked_runtime_correct,
  (select passed from achievement_runtime_results where name='browser_authority_denied')
    as browser_authority_denied,
  (select passed from achievement_runtime_results where name='transaction_call_chain_present')
    as transaction_call_chain_present,
  (select passed from achievement_runtime_results where name='catalog_has_only_22_runtime_ids')
    as only_22_career_ids_runtime_enabled
from achievement_runtime_results;

rollback;
