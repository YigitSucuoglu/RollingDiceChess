-- Run after 202609010003_profile_statistics_5d_b_multiplayer_career_projection.sql.
-- All fixtures and projections are rolled back.
begin;

insert into public.players(player_id, display_name, ownership_kind) values
  ('f5db0000-0000-4000-8000-000000000001','Projection9601','guest'),
  ('f5db0000-0000-4000-8000-000000000002','Projection9602','guest');
insert into public.player_ratings(player_id, multiplayer_rating, rated_games,
  ranked_wins, ranked_losses, unranked_games) values
  ('f5db0000-0000-4000-8000-000000000001',1111,7,4,3,2),
  ('f5db0000-0000-4000-8000-000000000002',999,7,3,4,2);

insert into private.multiplayer_lobbies(
  lobby_id, host_player_id, opponent_player_id, visibility, mode,
  side_preference, time_control_id, initial_ms, increment_ms, status
)
select lobby_id, 'f5db0000-0000-4000-8000-000000000001'::uuid,
  'f5db0000-0000-4000-8000-000000000002'::uuid, 'public',
  mode::public.multiplayer_mode, 'random', 'rapid-10-0', 600000, 0, 'closed'
from (values
  ('f5db0000-0000-4000-8000-000000000011'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000012'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000013'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000014'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000015'::uuid,'unranked'),
  ('f5db0000-0000-4000-8000-000000000016'::uuid,'unranked')
) fixture(lobby_id,mode);

insert into private.multiplayer_matches(
  match_id, lobby_id, player_a_id, player_b_id, mode, time_control_id,
  initial_ms, increment_ms, status
)
select match_id, lobby_id,
  'f5db0000-0000-4000-8000-000000000001'::uuid,
  'f5db0000-0000-4000-8000-000000000002'::uuid,
  mode::public.multiplayer_mode, 'rapid-10-0', 600000, 0, 'initializing'
from (values
  ('f5db0000-0000-4000-8000-000000000021'::uuid,'f5db0000-0000-4000-8000-000000000011'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000022'::uuid,'f5db0000-0000-4000-8000-000000000012'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000023'::uuid,'f5db0000-0000-4000-8000-000000000013'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000024'::uuid,'f5db0000-0000-4000-8000-000000000014'::uuid,'ranked'),
  ('f5db0000-0000-4000-8000-000000000025'::uuid,'f5db0000-0000-4000-8000-000000000015'::uuid,'unranked'),
  ('f5db0000-0000-4000-8000-000000000026'::uuid,'f5db0000-0000-4000-8000-000000000016'::uuid,'unranked')
) fixture(match_id,lobby_id,mode);

-- A wins, wins, loses, wins. Only the first ranked match carries rich raw
-- telemetry; the other ranked outcomes isolate streak semantics.
do $$
declare
  fixture record;
  zero_piece jsonb := private.empty_multiplayer_piece_counters();
  a_value jsonb;
  b_value jsonb;
begin
  for fixture in select * from (values
    ('f5db0000-0000-4000-8000-000000000021'::uuid,'ranked','f5db0000-0000-4000-8000-000000000001'::uuid),
    ('f5db0000-0000-4000-8000-000000000022'::uuid,'ranked','f5db0000-0000-4000-8000-000000000001'::uuid),
    ('f5db0000-0000-4000-8000-000000000023'::uuid,'ranked','f5db0000-0000-4000-8000-000000000002'::uuid),
    ('f5db0000-0000-4000-8000-000000000024'::uuid,'ranked','f5db0000-0000-4000-8000-000000000001'::uuid),
    ('f5db0000-0000-4000-8000-000000000025'::uuid,'unranked','f5db0000-0000-4000-8000-000000000002'::uuid)
  ) item(match_id,mode,winner_id) loop
    if fixture.match_id='f5db0000-0000-4000-8000-000000000021'::uuid then
      a_value := jsonb_build_object(
        'playerId','f5db0000-0000-4000-8000-000000000001',
        'rouletteRolls',6,'playTimeMs',1000,'playerTurnsCompleted',5,
        'threeRightsTurns',3,'kingsCaptured',1,
        'rollsByPiece','{"pawn":1,"knight":2,"bishop":3,"rook":4,"queen":5,"king":6}'::jsonb,
        'movesByPiece','{"pawn":6,"knight":5,"bishop":4,"rook":3,"queen":2,"king":1}'::jsonb,
        'tripleRollsByPiece','{"pawn":1,"knight":2,"bishop":3,"rook":4,"queen":5,"king":6}'::jsonb
      );
      b_value := jsonb_build_object(
        'playerId','f5db0000-0000-4000-8000-000000000002',
        'rouletteRolls',4,'playTimeMs',750,'playerTurnsCompleted',4,
        'threeRightsTurns',1,'kingsCaptured',0,
        'rollsByPiece','{"pawn":6,"knight":5,"bishop":4,"rook":3,"queen":2,"king":1}'::jsonb,
        'movesByPiece','{"pawn":1,"knight":2,"bishop":3,"rook":4,"queen":5,"king":6}'::jsonb,
        'tripleRollsByPiece','{"pawn":6,"knight":5,"bishop":4,"rook":3,"queen":2,"king":1}'::jsonb
      );
    elsif fixture.match_id='f5db0000-0000-4000-8000-000000000025'::uuid then
      a_value := jsonb_build_object(
        'playerId','f5db0000-0000-4000-8000-000000000001',
        'rouletteRolls',2,'playTimeMs',250,'playerTurnsCompleted',2,
        'threeRightsTurns',1,'kingsCaptured',0,
        'rollsByPiece','{"pawn":1,"knight":1,"bishop":1,"rook":1,"queen":1,"king":1}'::jsonb,
        'movesByPiece','{"pawn":1,"knight":1,"bishop":1,"rook":1,"queen":1,"king":1}'::jsonb,
        'tripleRollsByPiece',zero_piece
      );
      b_value := jsonb_build_object(
        'playerId','f5db0000-0000-4000-8000-000000000002',
        'rouletteRolls',3,'playTimeMs',300,'playerTurnsCompleted',3,
        'threeRightsTurns',2,'kingsCaptured',1,
        'rollsByPiece','{"pawn":1,"knight":1,"bishop":1,"rook":1,"queen":1,"king":1}'::jsonb,
        'movesByPiece','{"pawn":1,"knight":1,"bishop":1,"rook":1,"queen":1,"king":1}'::jsonb,
        'tripleRollsByPiece',zero_piece
      );
    else
      a_value := jsonb_build_object('playerId','f5db0000-0000-4000-8000-000000000001',
        'rouletteRolls',0,'playTimeMs',0,'playerTurnsCompleted',0,'threeRightsTurns',0,
        'kingsCaptured',0,'rollsByPiece',zero_piece,'movesByPiece',zero_piece,
        'tripleRollsByPiece',zero_piece);
      b_value := jsonb_build_object('playerId','f5db0000-0000-4000-8000-000000000002',
        'rouletteRolls',0,'playTimeMs',0,'playerTurnsCompleted',0,'threeRightsTurns',0,
        'kingsCaptured',0,'rollsByPiece',zero_piece,'movesByPiece',zero_piece,
        'tripleRollsByPiece',zero_piece);
    end if;
    insert into private.multiplayer_career_telemetry_settlements(
      match_id,match_mode,player_a_id,player_b_id,winner_player_id,
      termination_reason,telemetry_snapshot
    ) values (
      fixture.match_id,fixture.mode::public.multiplayer_mode,
      'f5db0000-0000-4000-8000-000000000001',
      'f5db0000-0000-4000-8000-000000000002',fixture.winner_id,
      case when fixture.match_id='f5db0000-0000-4000-8000-000000000021'::uuid
        then 'king-captured' else 'timeout' end,
      jsonb_build_object('white',a_value,'black',b_value)
    );
    perform private.project_multiplayer_career_settlement(fixture.match_id);
  end loop;
end;
$$;

-- Replaying the same terminal settlement cannot increment counters again.
create temporary table phase_5d_b_verification_flags(
  duplicate_projection_result boolean not null
) on commit drop;
insert into phase_5d_b_verification_flags
select private.project_multiplayer_career_settlement(
  'f5db0000-0000-4000-8000-000000000021'
);

-- A malformed second participant proves both participant updates and marker
-- are rolled back together.
insert into private.multiplayer_career_telemetry_settlements(
  match_id,match_mode,player_a_id,player_b_id,winner_player_id,
  termination_reason,telemetry_snapshot
) values (
  'f5db0000-0000-4000-8000-000000000026','unranked',
  'f5db0000-0000-4000-8000-000000000001','f5db0000-0000-4000-8000-000000000002',
  'f5db0000-0000-4000-8000-000000000001','timeout',
  jsonb_build_object(
    'white',jsonb_build_object(
      'playerId','f5db0000-0000-4000-8000-000000000001','rouletteRolls',99,
      'playTimeMs',99,'playerTurnsCompleted',0,'threeRightsTurns',0,'kingsCaptured',0,
      'rollsByPiece',private.empty_multiplayer_piece_counters(),
      'movesByPiece',private.empty_multiplayer_piece_counters(),
      'tripleRollsByPiece',private.empty_multiplayer_piece_counters()
    ),
    'black',jsonb_build_object(
      'playerId','f5db0000-0000-4000-8000-000000000002',
      'rouletteRolls',9223372036854775807,'playTimeMs',0,
      'playerTurnsCompleted',0,'threeRightsTurns',0,'kingsCaptured',0,
      'rollsByPiece',private.empty_multiplayer_piece_counters(),
      'movesByPiece',private.empty_multiplayer_piece_counters(),
      'tripleRollsByPiece',private.empty_multiplayer_piece_counters()
    )
  )
);
do $$ begin
  begin
    perform private.project_multiplayer_career_settlement(
      'f5db0000-0000-4000-8000-000000000026'
    );
    raise exception 'malformed projection unexpectedly succeeded';
  exception when sqlstate '22003' then null;
  end;
end $$;

select
  (select current_ranked_win_streak=1 and best_ranked_win_streak=2
    from private.player_multiplayer_statistics
    where player_id='f5db0000-0000-4000-8000-000000000001')
    as ranked_streak_sequence_correct,
  (select current_ranked_win_streak=0 and best_ranked_win_streak=1
    from private.player_multiplayer_statistics
    where player_id='f5db0000-0000-4000-8000-000000000002')
    as opponent_streak_sequence_correct,
  (select total_play_time_ms=1250 and kings_captured=1 and roulette_rolls=8
      and three_rights_turns=4 and player_turns_completed=7
    from private.player_multiplayer_statistics
    where player_id='f5db0000-0000-4000-8000-000000000001')
    as player_a_scalar_projection_correct,
  (select total_play_time_ms=1050 and kings_captured=1 and roulette_rolls=7
      and three_rights_turns=3 and player_turns_completed=7
    from private.player_multiplayer_statistics
    where player_id='f5db0000-0000-4000-8000-000000000002')
    as player_b_scalar_projection_correct,
  (select pawn_rolls=2 and knight_rolls=3 and bishop_rolls=4 and rook_rolls=5
      and queen_rolls=6 and king_rolls=7
      and pawn_moves=7 and knight_moves=6 and bishop_moves=5 and rook_moves=4
      and queen_moves=3 and king_moves=2
    from private.player_multiplayer_statistics
    where player_id='f5db0000-0000-4000-8000-000000000001')
    as six_piece_roll_move_projection_correct,
  (select triple_pawn_rolls=1 and triple_knight_rolls=2
      and triple_bishop_rolls=3 and triple_rook_rolls=4
      and triple_queen_rolls=5 and triple_king_rolls=6
    from private.player_multiplayer_statistics
    where player_id='f5db0000-0000-4000-8000-000000000001')
    as six_piece_triple_projection_correct,
  (select duplicate_projection_result is false
    from phase_5d_b_verification_flags) as duplicate_apply_exactly_once,
  (select count(*)=5 and bool_and(projection_applied_at is not null)
    from private.multiplayer_career_telemetry_settlements
    where match_id between 'f5db0000-0000-4000-8000-000000000021'
      and 'f5db0000-0000-4000-8000-000000000025')
    as projection_markers_atomic,
  (select projection_applied_at is null
    from private.multiplayer_career_telemetry_settlements
    where match_id='f5db0000-0000-4000-8000-000000000026')
    and (select roulette_rolls=8 from private.player_multiplayer_statistics
      where player_id='f5db0000-0000-4000-8000-000000000001')
    as malformed_participant_rolls_back_both,
  (select multiplayer_rating=1111 and rated_games=7 and ranked_wins=4
      and ranked_losses=3 and unranked_games=2
    from public.player_ratings
    where player_id='f5db0000-0000-4000-8000-000000000001')
    as existing_competitive_statistics_unchanged,
  not has_table_privilege('anon','private.player_multiplayer_statistics','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated','private.player_multiplayer_statistics','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated','private.multiplayer_career_telemetry_settlements','SELECT')
    and not has_function_privilege('authenticated',
      'private.project_multiplayer_career_settlement(uuid)','EXECUTE')
    as browser_projection_denied,
  pg_get_functiondef(
    'private.project_multiplayer_career_settlement(uuid)'::regprocedure
  ) like '%pg_advisory_xact_lock%'
    and pg_get_functiondef(
      'private.project_multiplayer_career_settlement(uuid)'::regprocedure
    ) like '%for update%'
    as concurrent_projection_lock_present,
  not exists (
    select 1 from information_schema.columns
    where table_schema='private' and table_name='player_multiplayer_statistics'
      and column_name in ('auth_user_id','email','match_id')
  ) as playerid_scoped_storage_safe;

rollback;
