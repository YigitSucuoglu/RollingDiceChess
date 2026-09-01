-- Run after 202609010002_profile_statistics_5d_a_multiplayer_telemetry.sql.
-- Transactional fixtures are rolled back.
begin;

insert into public.players (player_id, display_name, ownership_kind) values
  ('f5da0000-0000-4000-8000-000000000001', 'Telemetry9501', 'guest'),
  ('f5da0000-0000-4000-8000-000000000002', 'Telemetry9502', 'guest');

insert into private.multiplayer_lobbies (
  lobby_id, host_player_id, opponent_player_id, visibility, mode, side_preference,
  time_control_id, initial_ms, increment_ms, status
) values
  ('f5da0000-0000-4000-8000-000000000011','f5da0000-0000-4000-8000-000000000001','f5da0000-0000-4000-8000-000000000002','public','ranked','random','rapid-10-0',600000,0,'closed'),
  ('f5da0000-0000-4000-8000-000000000012','f5da0000-0000-4000-8000-000000000001','f5da0000-0000-4000-8000-000000000002','public','unranked','white','rapid-10-0',600000,0,'closed'),
  ('f5da0000-0000-4000-8000-000000000013','f5da0000-0000-4000-8000-000000000001','f5da0000-0000-4000-8000-000000000002','public','unranked','white','rapid-10-0',600000,0,'closed'),
  ('f5da0000-0000-4000-8000-000000000014','f5da0000-0000-4000-8000-000000000001','f5da0000-0000-4000-8000-000000000002','public','unranked','white','rapid-10-0',600000,0,'closed'),
  ('f5da0000-0000-4000-8000-000000000015','f5da0000-0000-4000-8000-000000000001','f5da0000-0000-4000-8000-000000000002','public','unranked','white','rapid-10-0',600000,0,'closed');

insert into private.multiplayer_matches (
  match_id, lobby_id, player_a_id, player_b_id, mode, time_control_id,
  initial_ms, increment_ms, status
)
select match_id, lobby_id,
  'f5da0000-0000-4000-8000-000000000001'::uuid,
  'f5da0000-0000-4000-8000-000000000002'::uuid,
  mode::public.multiplayer_mode, 'rapid-10-0', 600000, 0, 'initializing'
from (values
  ('f5da0000-0000-4000-8000-000000000021'::uuid,'f5da0000-0000-4000-8000-000000000011'::uuid,'ranked'),
  ('f5da0000-0000-4000-8000-000000000022'::uuid,'f5da0000-0000-4000-8000-000000000012'::uuid,'unranked'),
  ('f5da0000-0000-4000-8000-000000000023'::uuid,'f5da0000-0000-4000-8000-000000000013'::uuid,'unranked'),
  ('f5da0000-0000-4000-8000-000000000024'::uuid,'f5da0000-0000-4000-8000-000000000014'::uuid,'unranked'),
  ('f5da0000-0000-4000-8000-000000000025'::uuid,'f5da0000-0000-4000-8000-000000000015'::uuid,'unranked')
) fixture(match_id,lobby_id,mode);

-- Activation is the initial-roll boundary. No client telemetry payload exists.
update private.multiplayer_matches set
  white_player_id='f5da0000-0000-4000-8000-000000000001',
  black_player_id='f5da0000-0000-4000-8000-000000000002',
  canonical_state='{"schemaVersion":1,"currentTurn":"white","currentRoll":["pawn","knight","pawn"],"historySequence":0,"moveHistory":[{"turnNumber":1,"whiteMoves":[],"blackMoves":[]}]}'::jsonb,
  current_roll=array['pawn','knight','pawn'], current_turn='white',
  white_remaining_ms=600000, black_remaining_ms=600000,
  active_turn_started_at=now()-interval '1 second',
  white_reconnect_deadline=now()+interval '30 seconds',
  black_reconnect_deadline=now()+interval '30 seconds',
  realtime_topic='telemetry:'||match_id::text, status='active', revision=1,
  activated_at=now(), updated_at=now()
where match_id='f5da0000-0000-4000-8000-000000000021';

-- PostgreSQL now() is transaction-stable. Production gameplay revisions arrive
-- in separate transactions, whereas this verification intentionally runs every
-- transition in one rollback-only transaction. Move the private tracking
-- boundary into the past so charged authoritative clock time is exercised
-- without replacing production now() semantics with wall-clock test behavior.
update private.multiplayer_match_player_telemetry
set tracking_started_at=now()-interval '2 seconds'
where match_id='f5da0000-0000-4000-8000-000000000021';

-- Presence/restore-like writes do not create telemetry because revision is unchanged.
update private.multiplayer_matches set updated_at=now()
where match_id='f5da0000-0000-4000-8000-000000000021';

-- Three accepted white moves complete a normal turn. The history piece field
-- carries the authoritative pre-move semantic: castling King, promotion Pawn,
-- and en-passant Pawn.
update private.multiplayer_matches set
  canonical_state='{"schemaVersion":1,"currentTurn":"black","currentRoll":["bishop","bishop","bishop"],"historySequence":3,"moveHistory":[{"turnNumber":1,"whiteMoves":[{"timestamp":1,"player":"white","piece":"king"},{"timestamp":2,"player":"white","piece":"pawn"},{"timestamp":3,"player":"white","piece":"pawn"}],"blackMoves":[]}]}'::jsonb,
  current_roll=array['bishop','bishop','bishop'], current_turn='black', revision=2,
  active_turn_started_at=now()-interval '1 second', updated_at=now()
where match_id='f5da0000-0000-4000-8000-000000000021';

-- Two accepted black moves complete a normal turn and create the next roll.
update private.multiplayer_matches set
  canonical_state='{"schemaVersion":1,"currentTurn":"white","currentRoll":["rook","queen","king"],"historySequence":5,"moveHistory":[{"turnNumber":1,"whiteMoves":[{"timestamp":1,"player":"white","piece":"king"},{"timestamp":2,"player":"white","piece":"pawn"},{"timestamp":3,"player":"white","piece":"pawn"}],"blackMoves":[{"timestamp":4,"player":"black","piece":"knight"},{"timestamp":5,"player":"black","piece":"pawn"}]},{"turnNumber":2,"whiteMoves":[],"blackMoves":[]}]}'::jsonb,
  current_roll=array['rook','queen','king'], current_turn='white', revision=3,
  active_turn_started_at=now()-interval '1 second', updated_at=now()
where match_id='f5da0000-0000-4000-8000-000000000021';

-- The terminal king-capturing move is counted, but its active turn is not a
-- normally completed turn and therefore does not affect the denominator.
update private.multiplayer_matches set
  canonical_state='{"schemaVersion":1,"currentTurn":"white","currentRoll":["rook","queen","king"],"historySequence":6,"moveHistory":[{"turnNumber":1,"whiteMoves":[{"timestamp":1,"player":"white","piece":"king"},{"timestamp":2,"player":"white","piece":"pawn"},{"timestamp":3,"player":"white","piece":"pawn"}],"blackMoves":[{"timestamp":4,"player":"black","piece":"knight"},{"timestamp":5,"player":"black","piece":"pawn"}]},{"turnNumber":2,"whiteMoves":[{"timestamp":6,"player":"white","piece":"queen"}],"blackMoves":[]}]}'::jsonb,
  status='terminal', winner_player_id='f5da0000-0000-4000-8000-000000000001',
  termination_reason='king-captured', revision=4, active_turn_started_at=null, updated_at=now()
where match_id='f5da0000-0000-4000-8000-000000000021';

-- A replay/restore update after terminal cannot capture or finalize twice.
update private.multiplayer_matches set updated_at=now()
where match_id='f5da0000-0000-4000-8000-000000000021';

-- Four additional terminal classifications exercise eligibility without
-- historical inference. These fixtures intentionally contain no gameplay.
do $$
declare fixture record; fixture_roll text[]; fixture_state jsonb; terminal_revision bigint;
begin
  for fixture in select * from (values
    ('f5da0000-0000-4000-8000-000000000022'::uuid,'timeout','terminal'),
    ('f5da0000-0000-4000-8000-000000000023'::uuid,'forfeit','terminal'),
    ('f5da0000-0000-4000-8000-000000000024'::uuid,'disconnect-forfeit','terminal'),
    ('f5da0000-0000-4000-8000-000000000025'::uuid,'technical-abort','technical-abort')
  ) item(match_id,reason,final_status) loop
    fixture_roll := case fixture.reason
      when 'timeout' then array['pawn','pawn','pawn']
      when 'forfeit' then array['knight','knight','knight']
      when 'disconnect-forfeit' then array['queen','queen','queen']
      else array['king','king','king'] end;
    fixture_state := jsonb_build_object(
      'schemaVersion',1,'currentTurn','white','currentRoll',to_jsonb(fixture_roll),
      'historySequence',0,'moveHistory',jsonb_build_array(jsonb_build_object(
        'turnNumber',1,'whiteMoves','[]'::jsonb,'blackMoves','[]'::jsonb
      ))
    );
    update private.multiplayer_matches set
      white_player_id='f5da0000-0000-4000-8000-000000000001',
      black_player_id='f5da0000-0000-4000-8000-000000000002',
      canonical_state=fixture_state, current_roll=fixture_roll, current_turn='white',
      white_remaining_ms=600000, black_remaining_ms=600000,
      active_turn_started_at=now(), white_reconnect_deadline=now()+interval '30 seconds',
      black_reconnect_deadline=now()+interval '30 seconds',
      realtime_topic='telemetry:'||match_id::text, status='active', revision=1,
      activated_at=now(), updated_at=now()
    where match_id=fixture.match_id;
    terminal_revision := 2;
    if fixture.reason='timeout' then
      update private.multiplayer_matches set
        canonical_state=jsonb_build_object(
          'schemaVersion',1,'currentTurn','black',
          'currentRoll',jsonb_build_array('rook','queen','king'),
          'historySequence',0,'moveHistory',jsonb_build_array(jsonb_build_object(
            'turnNumber',1,'whiteMoves','[]'::jsonb,'blackMoves','[]'::jsonb
          ))
        ),
        current_roll=array['rook','queen','king'], current_turn='black',
        revision=2, active_turn_started_at=now(), updated_at=now()
      where match_id=fixture.match_id;
      terminal_revision := 3;
    end if;
    if fixture.reason='technical-abort' then
      perform private.record_multiplayer_telemetry_roll(
        fixture.match_id,
        'f5da0000-0000-4000-8000-000000000001',
        array['rook','rook','rook']
      );
    end if;
    update private.multiplayer_matches set
      status=fixture.final_status::public.multiplayer_match_status,
      winner_player_id=case when fixture.final_status='terminal'
        then 'f5da0000-0000-4000-8000-000000000002'::uuid else null end,
      termination_reason=fixture.reason, revision=terminal_revision,
      active_turn_started_at=null, updated_at=now()
    where match_id=fixture.match_id;
  end loop;
end;
$$;

with white_telemetry as (
  select *
  from private.multiplayer_match_player_telemetry
  where match_id='f5da0000-0000-4000-8000-000000000021' and player_side='white'
)
select
  (select roulette_rolls=2 and rolls_by_piece='{"pawn":2,"knight":1,"bishop":0,"rook":1,"queen":1,"king":1}'::jsonb
      and moves_by_piece='{"pawn":2,"knight":0,"bishop":0,"rook":0,"queen":1,"king":1}'::jsonb
      and triple_rolls_by_piece=private.empty_multiplayer_piece_counters()
      and player_turns_completed=1 and three_rights_turns=1 and kings_captured=1
      and play_time_ms > 0
    from private.multiplayer_match_player_telemetry
    where match_id='f5da0000-0000-4000-8000-000000000021' and player_side='white')
    as white_authoritative_telemetry_correct,
  (select jsonb_build_object(
      'rouletteRolls', roulette_rolls,
      'rollsByPiece', rolls_by_piece,
      'movesByPiece', moves_by_piece,
      'tripleRollsByPiece', triple_rolls_by_piece,
      'playerTurnsCompleted', player_turns_completed,
      'threeRightsTurns', three_rights_turns,
      'kingsCaptured', kings_captured,
      'playTimeMs', play_time_ms
    ) from white_telemetry) as white_telemetry_observed,
  (select roulette_rolls=2 from white_telemetry) as white_roll_total_correct,
  (select rolls_by_piece='{"pawn":2,"knight":1,"bishop":0,"rook":1,"queen":1,"king":1}'::jsonb
    from white_telemetry) as white_roll_distribution_correct,
  (select moves_by_piece='{"pawn":2,"knight":0,"bishop":0,"rook":0,"queen":1,"king":1}'::jsonb
    from white_telemetry) as white_move_distribution_correct,
  (select triple_rolls_by_piece=private.empty_multiplayer_piece_counters()
    from white_telemetry) as white_triple_distribution_correct,
  (select player_turns_completed=1 and three_rights_turns=1
    from white_telemetry) as white_three_rights_correct,
  (select kings_captured=1 from white_telemetry) as white_king_capture_correct,
  (select play_time_ms > 0 from white_telemetry) as white_play_time_correct,
  (select roulette_rolls=1 and rolls_by_piece='{"pawn":0,"knight":0,"bishop":3,"rook":0,"queen":0,"king":0}'::jsonb
      and triple_rolls_by_piece='{"pawn":0,"knight":0,"bishop":1,"rook":0,"queen":0,"king":0}'::jsonb
      and moves_by_piece='{"pawn":1,"knight":1,"bishop":0,"rook":0,"queen":0,"king":0}'::jsonb
      and player_turns_completed=1 and three_rights_turns=0 and kings_captured=0
    from private.multiplayer_match_player_telemetry
    where match_id='f5da0000-0000-4000-8000-000000000021' and player_side='black')
    as black_authoritative_telemetry_correct,
  (select count(*)=1 from private.multiplayer_career_telemetry_settlements
    where match_id='f5da0000-0000-4000-8000-000000000021') as terminal_replay_exactly_once,
  (select count(*)=4 from private.multiplayer_career_telemetry_settlements
    where match_id between 'f5da0000-0000-4000-8000-000000000021' and 'f5da0000-0000-4000-8000-000000000024')
    as eligible_terminal_contract_correct,
  not exists (select 1 from private.multiplayer_career_telemetry_settlements
    where match_id='f5da0000-0000-4000-8000-000000000025') as technical_abort_excluded,
  (select player_turns_completed=0 and three_rights_turns=0
    from private.multiplayer_match_player_telemetry
    where match_id='f5da0000-0000-4000-8000-000000000022' and player_side='white')
    as zero_move_skip_excluded,
  (select bool_and(found) from (values
    ('pawn', exists(select 1 from private.multiplayer_match_player_telemetry where triple_rolls_by_piece->>'pawn'='1')),
    ('knight', exists(select 1 from private.multiplayer_match_player_telemetry where triple_rolls_by_piece->>'knight'='1')),
    ('bishop', exists(select 1 from private.multiplayer_match_player_telemetry where triple_rolls_by_piece->>'bishop'='1')),
    ('rook', exists(select 1 from private.multiplayer_match_player_telemetry where triple_rolls_by_piece->>'rook'='1')),
    ('queen', exists(select 1 from private.multiplayer_match_player_telemetry where triple_rolls_by_piece->>'queen'='1')),
    ('king', exists(select 1 from private.multiplayer_match_player_telemetry where triple_rolls_by_piece->>'king'='1'))
  ) pieces(piece_type,found)) as all_six_triple_piece_types_supported,
  not has_table_privilege('authenticated','private.multiplayer_match_player_telemetry','SELECT')
    and not has_table_privilege('authenticated','private.multiplayer_match_player_telemetry','INSERT')
    and not has_table_privilege('authenticated','private.multiplayer_match_player_telemetry','UPDATE')
    and not has_table_privilege('authenticated','private.multiplayer_match_player_telemetry','DELETE')
    and not has_table_privilege('authenticated','private.multiplayer_career_telemetry_settlements','SELECT')
    as browser_telemetry_denied,
  (select count(*)=2 from private.multiplayer_match_player_telemetry
    where match_id='f5da0000-0000-4000-8000-000000000021') as participant_identity_canonical,
  (select match_mode='ranked' and (
      (to_regprocedure('private.project_multiplayer_career_settlement(uuid)') is null
        and projection_applied_at is null)
      or
      (to_regprocedure('private.project_multiplayer_career_settlement(uuid)') is not null
        and projection_applied_at is not null)
    )
    from private.multiplayer_career_telemetry_settlements
    where match_id='f5da0000-0000-4000-8000-000000000021') as phase_5d_b_boundary_ready;

rollback;
