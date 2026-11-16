-- ACHIEVEMENTS-01 Phase 3B-2C-2 production preflight.
-- Aggregate output only; this transaction is repeatable-read and read-only.
begin transaction isolation level repeatable read read only;

with
career_catalog(achievement_id,metric,threshold,coverage) as (values
  ('rookie_campaign','singleplayer_games',10,'canonical-complete'),
  ('hundred_games','singleplayer_games',100,'canonical-complete'),
  ('dedicated_player','singleplayer_games',500,'canonical-complete'),
  ('king_hunter','singleplayer_kings',10,'canonical-complete'),
  ('capture_hundred_kings','singleplayer_kings',100,'canonical-complete'),
  ('winning_run','singleplayer_best_streak',3,'canonical-complete'),
  ('ranked_victor','ranked_wins',1,'canonical-complete'),
  ('ranked_regular','ranked_games',25,'canonical-complete'),
  ('ranked_veteran','ranked_games',100,'canonical-complete'),
  ('winning_streak','ranked_best_streak',5,'trusted-lower-bound'),
  ('rating_climber','current_rating',1200,'canonical-current-not-peak'),
  ('elite_player','current_rating',1500,'canonical-current-not-peak'),
  ('wheel_spinner','global_rolls',100,'trusted-lower-bound'),
  ('roulette_master','global_rolls',1000,'trusted-lower-bound'),
  ('roll_collector','global_rolls',5000,'trusted-lower-bound'),
  ('triple_crown','global_triple_types',6,'trusted-lower-bound'),
  ('triple_collector','global_triples',100,'trusted-lower-bound'),
  ('full_rights','global_three_rights',25,'trusted-lower-bound'),
  ('pawn_commander','global_pawn_moves',500,'trusted-lower-bound'),
  ('knight_specialist','global_knight_moves',250,'trusted-lower-bound'),
  ('royal_maneuvers','global_king_moves',100,'trusted-lower-bound'),
  ('roulette_legend','singleplayer_xp',40180,'canonical-complete')
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
    rating.ranked_wins::bigint ranked_wins, rating.rated_games::bigint ranked_games,
    rating.multiplayer_rating::bigint current_rating,
    coalesce(mp.best_ranked_win_streak,0)::bigint ranked_best_streak,
    progression.roulette_rolls + coalesce(mp.roulette_rolls,0) global_rolls,
    progression.three_rights_turns + coalesce(mp.three_rights_turns,0) global_three_rights,
    progression.triple_pawn_rolls + progression.triple_knight_rolls
      + progression.triple_bishop_rolls + progression.triple_rook_rolls
      + progression.triple_queen_rolls + progression.triple_king_rolls
      + coalesce(mp.triple_pawn_rolls,0) + coalesce(mp.triple_knight_rolls,0)
      + coalesce(mp.triple_bishop_rolls,0) + coalesce(mp.triple_rook_rolls,0)
      + coalesce(mp.triple_queen_rolls,0) + coalesce(mp.triple_king_rolls,0) global_triples,
    ((progression.triple_pawn_rolls+coalesce(mp.triple_pawn_rolls,0))>0)::int
      + ((progression.triple_knight_rolls+coalesce(mp.triple_knight_rolls,0))>0)::int
      + ((progression.triple_bishop_rolls+coalesce(mp.triple_bishop_rolls,0))>0)::int
      + ((progression.triple_rook_rolls+coalesce(mp.triple_rook_rolls,0))>0)::int
      + ((progression.triple_queen_rolls+coalesce(mp.triple_queen_rolls,0))>0)::int
      + ((progression.triple_king_rolls+coalesce(mp.triple_king_rolls,0))>0)::int global_triple_types,
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
  select m.player_id,c.achievement_id,c.coverage from metrics m cross join career_catalog c
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
candidates as (
  select e.* from eligible e left join private.player_achievement_unlocks u
    on u.player_id=e.player_id and u.achievement_id=e.achievement_id
  where u.player_id is null
),
counts as (
  select c.achievement_id,c.coverage,count(candidate.player_id)::bigint eligible_player_count
  from career_catalog c left join candidates candidate using(achievement_id,coverage)
  group by c.achievement_id,c.coverage
)
select transaction_timestamp() snapshot_at,
  'repeatable-read/read-only'::text snapshot_contract,
  (select count(*) from public.players where lifecycle='active') active_player_count,
  (select count(distinct player_id) from candidates) eligible_player_count,
  (select count(*) from private.player_achievement_unlocks) existing_unlock_count,
  (select count(*) from candidates) new_unlock_candidate_count,
  (select jsonb_agg(jsonb_build_object('achievementId',achievement_id,
    'coverage',coverage,'eligiblePlayerCount',eligible_player_count) order by achievement_id)
    from counts) achievement_breakdown,
  not exists(select player_id,achievement_id from candidates group by player_id,achievement_id having count(*)>1)
    duplicate_check_pass,
  not exists(select 1 from candidates c join public.players p using(player_id) where p.lifecycle<>'active')
    retired_profile_check_pass,
  not exists(select 1 from candidates where achievement_id in (
    'the_long_march','royal_ascension','last_one_standing','wheels_favor',
    'against_all_odds','untouchable','pawn_rebellion','perfect_rhythm'))
    single_match_exclusion_pass,
  (select count(*)=22 from career_catalog) career_catalog_check_pass,
  (select bool_and(coverage in ('canonical-complete','trusted-lower-bound','canonical-current-not-peak'))
    from career_catalog) eligibility_source_check_pass,
  40180::bigint verified_level_50_xp_threshold;

rollback;
