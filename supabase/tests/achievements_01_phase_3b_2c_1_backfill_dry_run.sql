-- ACHIEVEMENTS-01 Phase 3B-2C-1 production dry-run.
-- Aggregate output only: no raw PlayerId, auth identifier, email, or username.
begin transaction isolation level repeatable read read only;

with
career_catalog(achievement_id,category,metric,threshold,coverage) as (values
  ('rookie_campaign','singleplayer-career','singleplayer_games',10,'canonical-complete'),
  ('hundred_games','singleplayer-career','singleplayer_games',100,'canonical-complete'),
  ('dedicated_player','singleplayer-career','singleplayer_games',500,'canonical-complete'),
  ('king_hunter','singleplayer-career','singleplayer_kings',10,'canonical-complete'),
  ('capture_hundred_kings','singleplayer-career','singleplayer_kings',100,'canonical-complete'),
  ('winning_run','singleplayer-career','singleplayer_best_streak',3,'canonical-complete'),
  ('ranked_victor','ranked-multiplayer','ranked_wins',1,'canonical-complete'),
  ('ranked_regular','ranked-multiplayer','ranked_games',25,'canonical-complete'),
  ('ranked_veteran','ranked-multiplayer','ranked_games',100,'canonical-complete'),
  ('winning_streak','ranked-multiplayer','ranked_best_streak',5,'trusted-lower-bound'),
  ('rating_climber','ranked-multiplayer','current_rating',1200,'canonical-current-not-peak'),
  ('elite_player','ranked-multiplayer','current_rating',1500,'canonical-current-not-peak'),
  ('wheel_spinner','global-roulette','global_rolls',100,'trusted-lower-bound'),
  ('roulette_master','global-roulette','global_rolls',1000,'trusted-lower-bound'),
  ('roll_collector','global-roulette','global_rolls',5000,'trusted-lower-bound'),
  ('triple_crown','global-roulette','global_triple_types',6,'trusted-lower-bound'),
  ('triple_collector','global-roulette','global_triples',100,'trusted-lower-bound'),
  ('full_rights','global-roulette','global_three_rights',25,'trusted-lower-bound'),
  ('pawn_commander','global-piece-mastery','global_pawn_moves',500,'trusted-lower-bound'),
  ('knight_specialist','global-piece-mastery','global_knight_moves',250,'trusted-lower-bound'),
  ('royal_maneuvers','global-piece-mastery','global_king_moves',100,'trusted-lower-bound'),
  ('roulette_legend','singleplayer-progression','singleplayer_xp',40180,'canonical-complete')
),
piece_moves as (
  select statistic.player_id,
    coalesce(max(statistic.moves) filter(where statistic.piece_type='pawn'),0)::bigint as pawn_moves,
    coalesce(max(statistic.moves) filter(where statistic.piece_type='knight'),0)::bigint as knight_moves,
    coalesce(max(statistic.moves) filter(where statistic.piece_type='king'),0)::bigint as king_moves
  from public.player_piece_statistics statistic
  group by statistic.player_id
),
active_metrics as (
  select player.player_id,
    progression.games_played::bigint as singleplayer_games,
    progression.kings_captured::bigint as singleplayer_kings,
    progression.best_win_streak::bigint as singleplayer_best_streak,
    progression.total_xp::bigint as singleplayer_xp,
    rating.ranked_wins::bigint as ranked_wins,
    rating.rated_games::bigint as ranked_games,
    rating.multiplayer_rating::bigint as current_rating,
    coalesce(multiplayer.best_ranked_win_streak,0)::bigint as ranked_best_streak,
    progression.roulette_rolls::bigint
      + coalesce(multiplayer.roulette_rolls,0) as global_rolls,
    progression.three_rights_turns::bigint
      + coalesce(multiplayer.three_rights_turns,0) as global_three_rights,
    progression.triple_pawn_rolls::bigint + progression.triple_knight_rolls
      + progression.triple_bishop_rolls + progression.triple_rook_rolls
      + progression.triple_queen_rolls + progression.triple_king_rolls
      + coalesce(multiplayer.triple_pawn_rolls,0)
      + coalesce(multiplayer.triple_knight_rolls,0)
      + coalesce(multiplayer.triple_bishop_rolls,0)
      + coalesce(multiplayer.triple_rook_rolls,0)
      + coalesce(multiplayer.triple_queen_rolls,0)
      + coalesce(multiplayer.triple_king_rolls,0) as global_triples,
    ((progression.triple_pawn_rolls + coalesce(multiplayer.triple_pawn_rolls,0))>0)::integer
      + ((progression.triple_knight_rolls + coalesce(multiplayer.triple_knight_rolls,0))>0)::integer
      + ((progression.triple_bishop_rolls + coalesce(multiplayer.triple_bishop_rolls,0))>0)::integer
      + ((progression.triple_rook_rolls + coalesce(multiplayer.triple_rook_rolls,0))>0)::integer
      + ((progression.triple_queen_rolls + coalesce(multiplayer.triple_queen_rolls,0))>0)::integer
      + ((progression.triple_king_rolls + coalesce(multiplayer.triple_king_rolls,0))>0)::integer
      as global_triple_types,
    coalesce(piece.pawn_moves,0) + coalesce(multiplayer.pawn_moves,0) as global_pawn_moves,
    coalesce(piece.knight_moves,0) + coalesce(multiplayer.knight_moves,0) as global_knight_moves,
    coalesce(piece.king_moves,0) + coalesce(multiplayer.king_moves,0) as global_king_moves
  from public.players player
  join public.player_progression progression using(player_id)
  join public.player_ratings rating using(player_id)
  left join piece_moves piece using(player_id)
  left join private.player_multiplayer_statistics multiplayer using(player_id)
  where player.lifecycle='active'
),
eligible as (
  select metric.player_id,catalog.achievement_id,catalog.category,catalog.coverage
  from active_metrics metric
  cross join career_catalog catalog
  where case catalog.metric
    when 'singleplayer_games' then metric.singleplayer_games>=catalog.threshold
    when 'singleplayer_kings' then metric.singleplayer_kings>=catalog.threshold
    when 'singleplayer_best_streak' then metric.singleplayer_best_streak>=catalog.threshold
    when 'singleplayer_xp' then metric.singleplayer_xp>=catalog.threshold
    when 'ranked_wins' then metric.ranked_wins>=catalog.threshold
    when 'ranked_games' then metric.ranked_games>=catalog.threshold
    when 'ranked_best_streak' then metric.ranked_best_streak>=catalog.threshold
    when 'current_rating' then metric.current_rating>=catalog.threshold
    when 'global_rolls' then metric.global_rolls>=catalog.threshold
    when 'global_three_rights' then metric.global_three_rights>=catalog.threshold
    when 'global_triples' then metric.global_triples>=catalog.threshold
    when 'global_triple_types' then metric.global_triple_types>=catalog.threshold
    when 'global_pawn_moves' then metric.global_pawn_moves>=catalog.threshold
    when 'global_knight_moves' then metric.global_knight_moves>=catalog.threshold
    when 'global_king_moves' then metric.global_king_moves>=catalog.threshold
    else false end
),
candidates as (
  select eligible.*
  from eligible
  left join private.player_achievement_unlocks unlocked
    on unlocked.player_id=eligible.player_id
      and unlocked.achievement_id=eligible.achievement_id
  where unlocked.player_id is null
),
achievement_counts as (
  select catalog.achievement_id,catalog.category,catalog.coverage,
    count(distinct candidate.player_id)::bigint as eligible_player_count
  from career_catalog catalog
  left join candidates candidate using(achievement_id,category,coverage)
  group by catalog.achievement_id,catalog.category,catalog.coverage
),
candidate_duplicates as (
  select player_id,achievement_id,count(*) as occurrences
  from candidates group by player_id,achievement_id having count(*)>1
)
select
  transaction_timestamp() as snapshot_at,
  'repeatable-read/read-only'::text as snapshot_contract,
  (select count(*) from public.players where lifecycle='active') as active_player_count,
  (select count(*) from private.player_achievement_unlocks) as existing_unlock_count,
  (select count(distinct player_id) from eligible) as all_eligible_active_player_count,
  (select count(*) from eligible) as all_eligible_pair_count,
  (select count(*) from eligible eligible_row
    join private.player_achievement_unlocks unlocked
      on unlocked.player_id=eligible_row.player_id
        and unlocked.achievement_id=eligible_row.achievement_id)
    as existing_unlock_excluded_count,
  (select count(distinct player_id) from candidates) as backfill_eligible_active_player_count,
  (select count(*) from candidates) as new_unlock_candidate_count,
  (select count(*) from candidate_duplicates) as duplicate_candidate_count,
  (select count(*) from candidates candidate join public.players player using(player_id)
    where player.lifecycle<>'active') as retired_candidate_count,
  (select count(*) from candidates where achievement_id in (
    'the_long_march','royal_ascension','last_one_standing','wheels_favor',
    'against_all_odds','untouchable','pawn_rebellion','perfect_rhythm'
  )) as single_match_candidate_count,
  not exists(select 1 from candidates candidate
    join private.player_achievement_unlocks unlocked
      on unlocked.player_id=candidate.player_id
        and unlocked.achievement_id=candidate.achievement_id)
    as existing_unlocks_fully_excluded,
  (select jsonb_agg(jsonb_build_object(
      'achievementId',achievement_id,
      'category',category,
      'coverage',coverage,
      'eligiblePlayerCount',eligible_player_count
    ) order by achievement_id)
    from achievement_counts) as achievement_breakdown,
  jsonb_build_array(
    jsonb_build_object(
      'scope','ranked-best-streak',
      'status','trusted-lower-bound',
      'note','Pre-projection streak history is not inferred.'
    ),
    jsonb_build_object(
      'scope','global-multiplayer-telemetry',
      'status','trusted-lower-bound',
      'note','Known SP plus projected MP activity may omit pre-telemetry MP history.'
    ),
    jsonb_build_object(
      'scope','ranked-rating',
      'status','canonical-current-not-peak',
      'note','Current trusted rating is used; historical peak is not inferred.'
    )
  ) as historical_coverage_notes,
  40180::bigint as verified_level_50_xp_threshold;

rollback;
