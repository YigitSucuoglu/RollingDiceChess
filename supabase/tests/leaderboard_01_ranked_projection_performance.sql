-- LOCAL/ISOLATED TEST DATABASE ONLY. Do not run against production.
-- Uses temporary data exclusively and reports EXPLAIN (ANALYZE, BUFFERS) for 100k players.
begin;

create temporary table leaderboard_plan_players (
  player_id uuid primary key,
  active boolean not null
) on commit drop;

create temporary table leaderboard_plan_ratings (
  player_id uuid primary key,
  multiplayer_rating integer not null,
  rated_games integer not null,
  ranked_wins integer not null,
  ranked_losses integer not null,
  ranked_win_rate numeric generated always as (
    case when rated_games = 0 then 0::numeric
      else ranked_wins::numeric / rated_games::numeric end
  ) stored,
  check (rated_games = ranked_wins + ranked_losses)
) on commit drop;

insert into leaderboard_plan_players(player_id, active)
select md5('leaderboard-player-' || series)::uuid, true
from generate_series(1, 100000) series;

insert into leaderboard_plan_ratings(
  player_id, multiplayer_rating, rated_games, ranked_wins, ranked_losses
)
select player.player_id,
  800 + (row_number() over (order by player.player_id) % 801)::integer,
  1 + (row_number() over (order by player.player_id) % 500)::integer,
  ((1 + (row_number() over (order by player.player_id) % 500))
    * (row_number() over (order by player.player_id) % 101) / 100)::integer,
  (1 + (row_number() over (order by player.player_id) % 500))::integer
    - (((1 + (row_number() over (order by player.player_id) % 500))
      * (row_number() over (order by player.player_id) % 101) / 100)::integer)
from leaderboard_plan_players player;

create index leaderboard_plan_rank_idx on leaderboard_plan_ratings (
  multiplayer_rating desc, ranked_wins desc, ranked_win_rate desc,
  rated_games desc, player_id asc
) where rated_games >= 1;
analyze leaderboard_plan_players;
analyze leaderboard_plan_ratings;

-- Expected: ordered partial-index scan with an early LIMIT near 100 rows.
explain (analyze, buffers, costs, summary, format text)
select rating.player_id, rating.multiplayer_rating, rating.ranked_wins,
  rating.ranked_win_rate, rating.rated_games
from leaderboard_plan_ratings rating
join leaderboard_plan_players player using (player_id)
where rating.rated_games >= 1 and player.active
order by rating.multiplayer_rating desc, rating.ranked_wins desc,
  rating.ranked_win_rate desc, rating.rated_games desc, rating.player_id asc
limit 100;

-- Worst-ish qualified caller sample. This query is exact but may inspect a large portion
-- of the qualified index; measure separately from the early-exit Top 100 plan.
explain (analyze, buffers, costs, summary, format text)
with caller as materialized (
  select rating.* from leaderboard_plan_ratings rating
  order by rating.multiplayer_rating, rating.ranked_wins, rating.ranked_win_rate,
    rating.rated_games, rating.player_id desc
  limit 1
)
select count(*) + 1
from leaderboard_plan_ratings rating
join leaderboard_plan_players player using (player_id)
cross join caller
where rating.rated_games >= 1 and player.active and (
  rating.multiplayer_rating > caller.multiplayer_rating
  or (rating.multiplayer_rating = caller.multiplayer_rating
    and rating.ranked_wins > caller.ranked_wins)
  or (rating.multiplayer_rating = caller.multiplayer_rating
    and rating.ranked_wins = caller.ranked_wins
    and rating.ranked_win_rate > caller.ranked_win_rate)
  or (rating.multiplayer_rating = caller.multiplayer_rating
    and rating.ranked_wins = caller.ranked_wins
    and rating.ranked_win_rate = caller.ranked_win_rate
    and rating.rated_games > caller.rated_games)
  or (rating.multiplayer_rating = caller.multiplayer_rating
    and rating.ranked_wins = caller.ranked_wins
    and rating.ranked_win_rate = caller.ranked_win_rate
    and rating.rated_games = caller.rated_games
    and rating.player_id < caller.player_id)
);

rollback;
