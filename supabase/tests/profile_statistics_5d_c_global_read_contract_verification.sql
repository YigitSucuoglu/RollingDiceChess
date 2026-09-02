-- Run after 202609010004_profile_statistics_5d_c_global_read_contract.sql.
-- Transactional fixtures are rolled back.
begin;

insert into public.players(player_id,display_name,ownership_kind) values
 ('f5dc0000-0000-4000-8000-000000000001','Global9701','guest'),
 ('f5dc0000-0000-4000-8000-000000000002','Global9702','guest');
insert into public.player_progression(player_id,three_rights_turns,player_turns_completed,
 triple_pawn_rolls,triple_knight_rolls,triple_queen_rolls,
 triple_bishop_rolls,triple_rook_rolls,triple_king_rolls) values
 ('f5dc0000-0000-4000-8000-000000000001',6,10,2,3,4,1,0,0),
 ('f5dc0000-0000-4000-8000-000000000002',0,0,0,0,0,0,0,0);
insert into public.player_ratings(player_id) values
 ('f5dc0000-0000-4000-8000-000000000001'),
 ('f5dc0000-0000-4000-8000-000000000002');
insert into public.player_piece_statistics(player_id,piece_type,rolls,moves,captures)
select 'f5dc0000-0000-4000-8000-000000000001',piece_type,rolls,moves,0
from (values ('pawn',5,1),('knight',8,2),('bishop',4,3),('rook',3,4),('queen',2,5),('king',1,6))
 fixture(piece_type,rolls,moves);
insert into public.player_piece_statistics(player_id,piece_type)
select 'f5dc0000-0000-4000-8000-000000000002',piece_type
from (values ('pawn'),('knight'),('bishop'),('rook'),('queen'),('king')) fixture(piece_type);

insert into private.player_multiplayer_statistics(
 player_id,current_ranked_win_streak,best_ranked_win_streak,total_play_time_ms,
 kings_captured,roulette_rolls,pawn_rolls,knight_rolls,bishop_rolls,rook_rolls,
 queen_rolls,king_rolls,pawn_moves,knight_moves,bishop_moves,rook_moves,queen_moves,
 king_moves,three_rights_turns,player_turns_completed,triple_pawn_rolls,
 triple_knight_rolls,triple_bishop_rolls,triple_rook_rolls,triple_queen_rolls,triple_king_rolls
) values (
 'f5dc0000-0000-4000-8000-000000000001',2,5,123456,3,11,
 4,1,5,6,7,9,8,7,6,5,4,3,3,5,5,4,3,2,1,8
);

create temporary table phase_5d_c_results on commit drop as
select private.current_global_roulette_statistics(
 'f5dc0000-0000-4000-8000-000000000001'
) rich, private.current_global_roulette_statistics(
 'f5dc0000-0000-4000-8000-000000000002'
) zero;

select
 exists(select 1 from information_schema.columns where table_schema='public'
   and table_name='player_progression' and column_name='triple_bishop_rolls'
   and column_default='0' and is_nullable='NO')
 and exists(select 1 from information_schema.columns where table_schema='public'
   and table_name='player_progression' and column_name='triple_rook_rolls'
   and column_default='0' and is_nullable='NO')
 and exists(select 1 from information_schema.columns where table_schema='public'
   and table_name='player_progression' and column_name='triple_king_rolls'
   and column_default='0' and is_nullable='NO') as new_singleplayer_triples_default_zero,
 (select triple_pawn_rolls=2 and triple_knight_rolls=3 and triple_queen_rolls=4
   and triple_bishop_rolls=1 and triple_rook_rolls=0 and triple_king_rolls=0
   from public.player_progression where player_id='f5dc0000-0000-4000-8000-000000000001')
   as existing_and_new_singleplayer_triples_preserved,
 (select rich->>'mostRolledPiece'='king' and (rich->>'mostRolledPieceCount')::bigint=10
   from phase_5d_c_results) as global_most_rolled_correct,
 (select rich->>'mostPlayedPiece'='pawn' and (rich->>'mostPlayedPieceCount')::bigint=9
   from phase_5d_c_results) as global_most_played_correct,
 (select (rich->>'threeRightsTurns')::bigint=9
   and (rich->>'playerTurnsCompleted')::bigint=15
   and (rich->>'threeRightsUsedRate')::numeric=0.6 from phase_5d_c_results)
   as global_three_rights_raw_rate_correct,
 (select jsonb_array_length(rich->'tripleRolls')=6
   and rich->'tripleRolls'->0->>'pieceType'='king'
   and rich->'tripleRolls'->1->>'pieceType'='pawn'
   from phase_5d_c_results) as six_piece_triple_ranking_correct,
 (select zero->'mostRolledPiece'='null'::jsonb and zero->>'mostRolledPieceCount'='0'
   and zero->'mostPlayedPiece'='null'::jsonb and zero->>'mostPlayedPieceCount'='0'
   and zero->>'threeRightsUsedRate'='0'
   and jsonb_array_length(zero->'tripleRolls')=6
   and zero->'tripleRolls'->0->>'pieceType'='pawn'
   and zero->'tripleRolls'->1->>'pieceType'='knight'
   from phase_5d_c_results) as deterministic_zero_and_tie_state,
 pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
   like '%tripleBishopRollsDelta%'
 and pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
   like '%player_progression_operations%'
 and pg_get_functiondef('public.apply_player_progression_operation(uuid,jsonb)'::regprocedure)
   like '%existing_hash%' as replay_safe_operation_extended,
 pg_get_functiondef('private.current_player_profile_json()'::regprocedure)
   like '%private.current_player_id()%'
 and pg_get_function_arguments('public.get_current_player_profile()'::regprocedure)=''
   as current_player_only_read_contract,
 not has_table_privilege('authenticated','private.player_multiplayer_statistics','SELECT,INSERT,UPDATE,DELETE')
 and not has_function_privilege('authenticated','private.current_global_roulette_statistics(uuid)','EXECUTE')
 and not has_table_privilege('authenticated','public.player_progression','UPDATE')
   as browser_authority_denied,
 (select current_ranked_win_streak=2 and best_ranked_win_streak=5
   and total_play_time_ms=123456 and kings_captured=3 and roulette_rolls=11
   from private.player_multiplayer_statistics where player_id='f5dc0000-0000-4000-8000-000000000001')
   as multiplayer_mode_fields_preserved;

rollback;
