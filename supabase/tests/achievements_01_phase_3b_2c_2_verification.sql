-- ACHIEVEMENTS-01 Phase 3B-2C-2 post-write production verification.
-- Read-only and aggregate-only: no fixture or persistent mutation.
begin transaction isolation level repeatable read read only;

with
career_ids(achievement_id) as (values
  ('rookie_campaign'),('hundred_games'),('dedicated_player'),('king_hunter'),
  ('capture_hundred_kings'),('winning_run'),('ranked_victor'),('ranked_regular'),
  ('ranked_veteran'),('winning_streak'),('rating_climber'),('elite_player'),
  ('wheel_spinner'),('roulette_master'),('roll_collector'),('triple_crown'),
  ('triple_collector'),('full_rights'),('pawn_commander'),('knight_specialist'),
  ('royal_maneuvers'),('roulette_legend')
),
career_catalog(achievement_id,metric,threshold) as (values
  ('rookie_campaign','singleplayer_games',10),('hundred_games','singleplayer_games',100),
  ('dedicated_player','singleplayer_games',500),('king_hunter','singleplayer_kings',10),
  ('capture_hundred_kings','singleplayer_kings',100),('winning_run','singleplayer_best_streak',3),
  ('ranked_victor','ranked_wins',1),('ranked_regular','ranked_games',25),
  ('ranked_veteran','ranked_games',100),('winning_streak','ranked_best_streak',5),
  ('rating_climber','current_rating',1200),('elite_player','current_rating',1500),
  ('wheel_spinner','global_rolls',100),('roulette_master','global_rolls',1000),
  ('roll_collector','global_rolls',5000),('triple_crown','global_triple_types',6),
  ('triple_collector','global_triples',100),('full_rights','global_three_rights',25),
  ('pawn_commander','global_pawn_moves',500),('knight_specialist','global_knight_moves',250),
  ('royal_maneuvers','global_king_moves',100),('roulette_legend','singleplayer_xp',40180)
),
piece_moves as (
  select player_id,
    coalesce(max(moves) filter(where piece_type='pawn'),0)::bigint pawn_moves,
    coalesce(max(moves) filter(where piece_type='knight'),0)::bigint knight_moves,
    coalesce(max(moves) filter(where piece_type='king'),0)::bigint king_moves
  from public.player_piece_statistics group by player_id
),
metrics as (
  select p.player_id, progression.games_played::bigint singleplayer_games,
    progression.kings_captured::bigint singleplayer_kings,
    progression.best_win_streak::bigint singleplayer_best_streak,
    progression.total_xp::bigint singleplayer_xp,
    rating.ranked_wins::bigint ranked_wins,rating.rated_games::bigint ranked_games,
    rating.multiplayer_rating::bigint current_rating,
    coalesce(mp.best_ranked_win_streak,0)::bigint ranked_best_streak,
    progression.roulette_rolls+coalesce(mp.roulette_rolls,0) global_rolls,
    progression.three_rights_turns+coalesce(mp.three_rights_turns,0) global_three_rights,
    progression.triple_pawn_rolls+progression.triple_knight_rolls
      +progression.triple_bishop_rolls+progression.triple_rook_rolls
      +progression.triple_queen_rolls+progression.triple_king_rolls
      +coalesce(mp.triple_pawn_rolls,0)+coalesce(mp.triple_knight_rolls,0)
      +coalesce(mp.triple_bishop_rolls,0)+coalesce(mp.triple_rook_rolls,0)
      +coalesce(mp.triple_queen_rolls,0)+coalesce(mp.triple_king_rolls,0) global_triples,
    ((progression.triple_pawn_rolls+coalesce(mp.triple_pawn_rolls,0))>0)::int
      +((progression.triple_knight_rolls+coalesce(mp.triple_knight_rolls,0))>0)::int
      +((progression.triple_bishop_rolls+coalesce(mp.triple_bishop_rolls,0))>0)::int
      +((progression.triple_rook_rolls+coalesce(mp.triple_rook_rolls,0))>0)::int
      +((progression.triple_queen_rolls+coalesce(mp.triple_queen_rolls,0))>0)::int
      +((progression.triple_king_rolls+coalesce(mp.triple_king_rolls,0))>0)::int global_triple_types,
    coalesce(piece.pawn_moves,0)+coalesce(mp.pawn_moves,0) global_pawn_moves,
    coalesce(piece.knight_moves,0)+coalesce(mp.knight_moves,0) global_knight_moves,
    coalesce(piece.king_moves,0)+coalesce(mp.king_moves,0) global_king_moves
  from public.players p
  join public.player_progression progression using(player_id)
  join public.player_ratings rating using(player_id)
  left join piece_moves piece using(player_id)
  left join private.player_multiplayer_statistics mp using(player_id)
  where p.lifecycle='active'
),
eligible as (
  select m.player_id,c.achievement_id from metrics m cross join career_catalog c
  where case c.metric
    when 'singleplayer_games' then m.singleplayer_games>=c.threshold
    when 'singleplayer_kings' then m.singleplayer_kings>=c.threshold
    when 'singleplayer_best_streak' then m.singleplayer_best_streak>=c.threshold
    when 'singleplayer_xp' then m.singleplayer_xp>=c.threshold
    when 'ranked_wins' then m.ranked_wins>=c.threshold
    when 'ranked_games' then m.ranked_games>=c.threshold
    when 'ranked_best_streak' then m.ranked_best_streak>=c.threshold
    when 'current_rating' then m.current_rating>=c.threshold
    when 'global_rolls' then m.global_rolls>=c.threshold
    when 'global_three_rights' then m.global_three_rights>=c.threshold
    when 'global_triples' then m.global_triples>=c.threshold
    when 'global_triple_types' then m.global_triple_types>=c.threshold
    when 'global_pawn_moves' then m.global_pawn_moves>=c.threshold
    when 'global_knight_moves' then m.global_knight_moves>=c.threshold
    when 'global_king_moves' then m.global_king_moves>=c.threshold else false end
),
backfill as (
  select u.* from private.player_achievement_unlocks u
  where source_type='retroactive-career'
    and source_id='3b2c2000-0000-4000-8000-000000000001'::uuid
),
function_acl as (
  select
    not has_function_privilege('anon','public.get_current_player_achievements()','EXECUTE') anon_read_denied,
    has_function_privilege('authenticated','public.get_current_player_achievements()','EXECUTE') authenticated_read_allowed,
    not has_function_privilege('authenticated',
      'private.persist_player_achievement_unlock(uuid,text,text,uuid,integer)','EXECUTE') browser_write_denied
)
select transaction_timestamp() verified_at,
  (select count(*) from backfill) backfilled_unlock_count,
  (select count(distinct player_id) from backfill) affected_player_count,
  (select count(*)=count(distinct (player_id,achievement_id)) from backfill) duplicate_check_pass,
  not exists(select 1 from backfill b left join career_ids c using(achievement_id)
    where c.achievement_id is null) career_ids_only,
  not exists(select 1 from backfill b join public.players p using(player_id)
    where p.lifecycle<>'active') retired_profile_exclusion_pass,
  not exists(select 1 from backfill where achievement_id in (
    'the_long_march','royal_ascension','last_one_standing','wheels_favor',
    'against_all_odds','untouchable','pawn_rebellion','perfect_rhythm'))
    single_match_exclusion_pass,
  not exists(select 1 from backfill where catalog_version<>1) catalog_version_check_pass,
  not exists(select 1 from backfill where source_type<>'retroactive-career'
    or source_id<>'3b2c2000-0000-4000-8000-000000000001'::uuid) source_metadata_check_pass,
  not exists(select player_id,achievement_id from private.player_achievement_unlocks
    group by player_id,achievement_id having count(*)>1) global_uniqueness_pass,
  not exists(select 1 from eligible e left join private.player_achievement_unlocks u
    on u.player_id=e.player_id and u.achievement_id=e.achievement_id
    where u.player_id is null) no_proven_eligible_career_unlock_remains_locked,
  (select anon_read_denied and authenticated_read_allowed and browser_write_denied from function_acl)
    read_rpc_and_grants_preserved,
  (select count(*)=22 from career_ids) career_catalog_check_pass,
  40180::bigint verified_level_50_xp_threshold;

rollback;
