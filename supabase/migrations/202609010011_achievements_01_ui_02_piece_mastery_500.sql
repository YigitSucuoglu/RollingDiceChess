-- UI-02: adjust future Piece Mastery unlocks only. Existing unlock rows are untouched.
begin;

create or replace function private.evaluate_and_persist_career_achievements(
  requested_player_id uuid,
  evaluation_scope text,
  requested_source_id uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare progression public.player_progression%rowtype;
  rating public.player_ratings%rowtype;
  multiplayer private.player_multiplayer_statistics%rowtype;
  pawn_moves bigint; knight_moves bigint; king_moves bigint;
  global_rolls bigint; global_three_rights bigint; global_triples bigint;
  triple_piece_types integer; inserted_count integer := 0;
  source_type text;
begin
  if requested_player_id is null or requested_source_id is null
      or evaluation_scope not in ('singleplayer','multiplayer-ranked','multiplayer-unranked') then
    raise exception 'valid career evaluation context is required' using errcode='22023';
  end if;

  -- One common PlayerId lock serializes concurrent SP/MP threshold crossings.
  perform player.player_id from public.players player
  where player.player_id=requested_player_id and player.lifecycle='active'
  for update;
  if not found then
    raise exception 'active achievement player not found' using errcode='P0002';
  end if;

  select value.* into progression from public.player_progression value
  where value.player_id=requested_player_id;
  select value.* into rating from public.player_ratings value
  where value.player_id=requested_player_id;
  select value.* into multiplayer from private.player_multiplayer_statistics value
  where value.player_id=requested_player_id;
  if progression.player_id is null or rating.player_id is null then
    raise exception 'canonical career counters are missing' using errcode='P0002';
  end if;

  select
    coalesce(max(statistic.moves) filter(where statistic.piece_type='pawn'),0)
      + coalesce(multiplayer.pawn_moves,0),
    coalesce(max(statistic.moves) filter(where statistic.piece_type='knight'),0)
      + coalesce(multiplayer.knight_moves,0),
    coalesce(max(statistic.moves) filter(where statistic.piece_type='king'),0)
      + coalesce(multiplayer.king_moves,0)
  into pawn_moves,knight_moves,king_moves
  from public.player_piece_statistics statistic
  where statistic.player_id=requested_player_id;

  global_rolls := progression.roulette_rolls + coalesce(multiplayer.roulette_rolls,0);
  global_three_rights := progression.three_rights_turns
    + coalesce(multiplayer.three_rights_turns,0);
  global_triples := progression.triple_pawn_rolls + progression.triple_knight_rolls
    + progression.triple_bishop_rolls + progression.triple_rook_rolls
    + progression.triple_queen_rolls + progression.triple_king_rolls
    + coalesce(multiplayer.triple_pawn_rolls,0)
    + coalesce(multiplayer.triple_knight_rolls,0)
    + coalesce(multiplayer.triple_bishop_rolls,0)
    + coalesce(multiplayer.triple_rook_rolls,0)
    + coalesce(multiplayer.triple_queen_rolls,0)
    + coalesce(multiplayer.triple_king_rolls,0);
  triple_piece_types :=
    ((progression.triple_pawn_rolls + coalesce(multiplayer.triple_pawn_rolls,0)) > 0)::integer
    + ((progression.triple_knight_rolls + coalesce(multiplayer.triple_knight_rolls,0)) > 0)::integer
    + ((progression.triple_bishop_rolls + coalesce(multiplayer.triple_bishop_rolls,0)) > 0)::integer
    + ((progression.triple_rook_rolls + coalesce(multiplayer.triple_rook_rolls,0)) > 0)::integer
    + ((progression.triple_queen_rolls + coalesce(multiplayer.triple_queen_rolls,0)) > 0)::integer
    + ((progression.triple_king_rolls + coalesce(multiplayer.triple_king_rolls,0)) > 0)::integer;

  source_type := case when evaluation_scope='singleplayer'
    then 'singleplayer-operation' else 'multiplayer-settlement' end;

  if evaluation_scope='singleplayer' then
    if progression.games_played>=10 and private.persist_player_achievement_unlock(
      requested_player_id,'rookie_campaign',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.games_played>=100 and private.persist_player_achievement_unlock(
      requested_player_id,'hundred_games',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.games_played>=500 and private.persist_player_achievement_unlock(
      requested_player_id,'dedicated_player',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.kings_captured>=10 and private.persist_player_achievement_unlock(
      requested_player_id,'king_hunter',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.kings_captured>=100 and private.persist_player_achievement_unlock(
      requested_player_id,'capture_hundred_kings',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if progression.best_win_streak>=3 and private.persist_player_achievement_unlock(
      requested_player_id,'winning_run',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if private.singleplayer_level_at_least_50(progression.total_xp)
        and private.persist_player_achievement_unlock(
      requested_player_id,'roulette_legend',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  elsif evaluation_scope='multiplayer-ranked' then
    if rating.ranked_wins>=1 and private.persist_player_achievement_unlock(
      requested_player_id,'ranked_victor',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.rated_games>=25 and private.persist_player_achievement_unlock(
      requested_player_id,'ranked_regular',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.rated_games>=100 and private.persist_player_achievement_unlock(
      requested_player_id,'ranked_veteran',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if coalesce(multiplayer.best_ranked_win_streak,0)>=5
        and private.persist_player_achievement_unlock(
      requested_player_id,'winning_streak',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.multiplayer_rating>=1200 and private.persist_player_achievement_unlock(
      requested_player_id,'rating_climber',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
    if rating.multiplayer_rating>=1500 and private.persist_player_achievement_unlock(
      requested_player_id,'elite_player',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  end if;

  -- These known counters are lower bounds when pre-telemetry MP history exists.
  -- Only positive threshold proof unlocks; no negative/missing conclusion is stored.
  if global_rolls>=100 and private.persist_player_achievement_unlock(
    requested_player_id,'wheel_spinner',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_rolls>=1000 and private.persist_player_achievement_unlock(
    requested_player_id,'roulette_master',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_rolls>=5000 and private.persist_player_achievement_unlock(
    requested_player_id,'roll_collector',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if triple_piece_types>=6 and private.persist_player_achievement_unlock(
    requested_player_id,'triple_crown',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_triples>=100 and private.persist_player_achievement_unlock(
    requested_player_id,'triple_collector',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if global_three_rights>=25 and private.persist_player_achievement_unlock(
    requested_player_id,'full_rights',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if pawn_moves>=500 and private.persist_player_achievement_unlock(
    requested_player_id,'pawn_commander',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if knight_moves>=500 and private.persist_player_achievement_unlock(
    requested_player_id,'knight_specialist',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;
  if king_moves>=500 and private.persist_player_achievement_unlock(
    requested_player_id,'royal_maneuvers',source_type,requested_source_id,1) then inserted_count:=inserted_count+1; end if;

  return inserted_count;
end;
$$;

commit;
