-- PROFILE-STATISTICS Phase 5D-B: canonical multiplayer career projection.
-- Projects only Phase 5D-A authoritative settlement snapshots. No historical
-- match reconstruction or existing rating/ranked/unranked mutation occurs.
begin;

create table private.player_multiplayer_statistics (
  player_id uuid primary key references public.players(player_id) on delete restrict,
  current_ranked_win_streak bigint not null default 0 check (current_ranked_win_streak >= 0),
  best_ranked_win_streak bigint not null default 0 check (
    best_ranked_win_streak >= current_ranked_win_streak
  ),
  total_play_time_ms bigint not null default 0 check (total_play_time_ms >= 0),
  kings_captured bigint not null default 0 check (kings_captured >= 0),
  roulette_rolls bigint not null default 0 check (roulette_rolls >= 0),
  pawn_rolls bigint not null default 0 check (pawn_rolls >= 0),
  knight_rolls bigint not null default 0 check (knight_rolls >= 0),
  bishop_rolls bigint not null default 0 check (bishop_rolls >= 0),
  rook_rolls bigint not null default 0 check (rook_rolls >= 0),
  queen_rolls bigint not null default 0 check (queen_rolls >= 0),
  king_rolls bigint not null default 0 check (king_rolls >= 0),
  pawn_moves bigint not null default 0 check (pawn_moves >= 0),
  knight_moves bigint not null default 0 check (knight_moves >= 0),
  bishop_moves bigint not null default 0 check (bishop_moves >= 0),
  rook_moves bigint not null default 0 check (rook_moves >= 0),
  queen_moves bigint not null default 0 check (queen_moves >= 0),
  king_moves bigint not null default 0 check (king_moves >= 0),
  three_rights_turns bigint not null default 0 check (three_rights_turns >= 0),
  player_turns_completed bigint not null default 0 check (
    player_turns_completed >= three_rights_turns
  ),
  triple_pawn_rolls bigint not null default 0 check (triple_pawn_rolls >= 0),
  triple_knight_rolls bigint not null default 0 check (triple_knight_rolls >= 0),
  triple_bishop_rolls bigint not null default 0 check (triple_bishop_rolls >= 0),
  triple_rook_rolls bigint not null default 0 check (triple_rook_rolls >= 0),
  triple_queen_rolls bigint not null default 0 check (triple_queen_rolls >= 0),
  triple_king_rolls bigint not null default 0 check (triple_king_rolls >= 0),
  updated_at timestamptz not null default now()
);

alter table private.player_multiplayer_statistics enable row level security;
revoke all on private.player_multiplayer_statistics from public, anon, authenticated;

create or replace function private.valid_multiplayer_settlement_participant(
  value jsonb,
  expected_player_id uuid
) returns boolean language plpgsql immutable set search_path = '' as $$
declare
  roulette_rolls_value numeric;
  play_time_value numeric;
  completed_turns_value numeric;
  three_rights_value numeric;
  kings_captured_value numeric;
begin
  if value is null or jsonb_typeof(value) <> 'object'
      or expected_player_id is null
      or value ->> 'playerId' is distinct from expected_player_id::text
      or jsonb_typeof(value -> 'rouletteRolls') is distinct from 'number'
      or jsonb_typeof(value -> 'playTimeMs') is distinct from 'number'
      or jsonb_typeof(value -> 'playerTurnsCompleted') is distinct from 'number'
      or jsonb_typeof(value -> 'threeRightsTurns') is distinct from 'number'
      or jsonb_typeof(value -> 'kingsCaptured') is distinct from 'number'
      or not coalesce(private.valid_multiplayer_piece_counters(value -> 'rollsByPiece'), false)
      or not coalesce(private.valid_multiplayer_piece_counters(value -> 'movesByPiece'), false)
      or not coalesce(private.valid_multiplayer_piece_counters(
        value -> 'tripleRollsByPiece'
      ), false)
      or value ->> 'rouletteRolls' !~ '^[0-9]+$'
      or value ->> 'playTimeMs' !~ '^[0-9]+$'
      or value ->> 'playerTurnsCompleted' !~ '^[0-9]+$'
      or value ->> 'threeRightsTurns' !~ '^[0-9]+$'
      or value ->> 'kingsCaptured' !~ '^[0-9]+$' then
    return false;
  end if;
  begin
    roulette_rolls_value := (value ->> 'rouletteRolls')::numeric;
    play_time_value := (value ->> 'playTimeMs')::numeric;
    completed_turns_value := (value ->> 'playerTurnsCompleted')::numeric;
    three_rights_value := (value ->> 'threeRightsTurns')::numeric;
    kings_captured_value := (value ->> 'kingsCaptured')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    return false;
  end;
  return roulette_rolls_value <= 9223372036854775807
    and play_time_value <= 9223372036854775807
    and completed_turns_value <= 9223372036854775807
    and three_rights_value <= 9223372036854775807
    and kings_captured_value <= 9223372036854775807
    and three_rights_value <= completed_turns_value;
end;
$$;

create or replace function private.multiplayer_settlement_participant(
  settlement private.multiplayer_career_telemetry_settlements,
  expected_player_id uuid
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare white_value jsonb; black_value jsonb; selected_value jsonb;
begin
  white_value := settlement.telemetry_snapshot -> 'white';
  black_value := settlement.telemetry_snapshot -> 'black';
  if white_value ->> 'playerId' = expected_player_id::text then
    selected_value := white_value;
  elsif black_value ->> 'playerId' = expected_player_id::text then
    selected_value := black_value;
  else
    raise exception 'settlement participant telemetry is missing' using errcode = '22023';
  end if;
  if not private.valid_multiplayer_settlement_participant(selected_value, expected_player_id) then
    raise exception 'invalid settlement participant telemetry' using errcode = '22023';
  end if;
  return selected_value;
end;
$$;

create or replace function private.add_multiplayer_career_participant(
  requested_player_id uuid,
  participant jsonb,
  ranked_match boolean,
  winner boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare updated_count integer;
begin
  if not private.valid_multiplayer_settlement_participant(participant, requested_player_id) then
    raise exception 'invalid canonical career projection input' using errcode = '22023';
  end if;

  insert into private.player_multiplayer_statistics(player_id)
  values (requested_player_id)
  on conflict (player_id) do nothing;

  update private.player_multiplayer_statistics statistic set
    current_ranked_win_streak = case
      when not ranked_match then statistic.current_ranked_win_streak
      when winner then statistic.current_ranked_win_streak + 1
      else 0 end,
    best_ranked_win_streak = case
      when ranked_match and winner then greatest(
        statistic.best_ranked_win_streak,
        statistic.current_ranked_win_streak + 1
      ) else statistic.best_ranked_win_streak end,
    total_play_time_ms = statistic.total_play_time_ms + (participant ->> 'playTimeMs')::bigint,
    kings_captured = statistic.kings_captured + (participant ->> 'kingsCaptured')::bigint,
    roulette_rolls = statistic.roulette_rolls + (participant ->> 'rouletteRolls')::bigint,
    pawn_rolls = statistic.pawn_rolls + (participant -> 'rollsByPiece' ->> 'pawn')::bigint,
    knight_rolls = statistic.knight_rolls + (participant -> 'rollsByPiece' ->> 'knight')::bigint,
    bishop_rolls = statistic.bishop_rolls + (participant -> 'rollsByPiece' ->> 'bishop')::bigint,
    rook_rolls = statistic.rook_rolls + (participant -> 'rollsByPiece' ->> 'rook')::bigint,
    queen_rolls = statistic.queen_rolls + (participant -> 'rollsByPiece' ->> 'queen')::bigint,
    king_rolls = statistic.king_rolls + (participant -> 'rollsByPiece' ->> 'king')::bigint,
    pawn_moves = statistic.pawn_moves + (participant -> 'movesByPiece' ->> 'pawn')::bigint,
    knight_moves = statistic.knight_moves + (participant -> 'movesByPiece' ->> 'knight')::bigint,
    bishop_moves = statistic.bishop_moves + (participant -> 'movesByPiece' ->> 'bishop')::bigint,
    rook_moves = statistic.rook_moves + (participant -> 'movesByPiece' ->> 'rook')::bigint,
    queen_moves = statistic.queen_moves + (participant -> 'movesByPiece' ->> 'queen')::bigint,
    king_moves = statistic.king_moves + (participant -> 'movesByPiece' ->> 'king')::bigint,
    three_rights_turns = statistic.three_rights_turns
      + (participant ->> 'threeRightsTurns')::bigint,
    player_turns_completed = statistic.player_turns_completed
      + (participant ->> 'playerTurnsCompleted')::bigint,
    triple_pawn_rolls = statistic.triple_pawn_rolls
      + (participant -> 'tripleRollsByPiece' ->> 'pawn')::bigint,
    triple_knight_rolls = statistic.triple_knight_rolls
      + (participant -> 'tripleRollsByPiece' ->> 'knight')::bigint,
    triple_bishop_rolls = statistic.triple_bishop_rolls
      + (participant -> 'tripleRollsByPiece' ->> 'bishop')::bigint,
    triple_rook_rolls = statistic.triple_rook_rolls
      + (participant -> 'tripleRollsByPiece' ->> 'rook')::bigint,
    triple_queen_rolls = statistic.triple_queen_rolls
      + (participant -> 'tripleRollsByPiece' ->> 'queen')::bigint,
    triple_king_rolls = statistic.triple_king_rolls
      + (participant -> 'tripleRollsByPiece' ->> 'king')::bigint,
    updated_at = now()
  where statistic.player_id = requested_player_id;
  get diagnostics updated_count = row_count;
  if updated_count <> 1 then
    raise exception 'canonical multiplayer statistic row is missing' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function private.project_multiplayer_career_settlement(
  requested_match_id uuid
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  settlement private.multiplayer_career_telemetry_settlements%rowtype;
  player_a_value jsonb;
  player_b_value jsonb;
  locked_count integer;
begin
  if requested_match_id is null then
    raise exception 'match id is required for career projection' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 5));
  select candidate.* into settlement
  from private.multiplayer_career_telemetry_settlements candidate
  where candidate.match_id = requested_match_id
  for update;
  if settlement.match_id is null then
    raise exception 'career telemetry settlement is missing' using errcode = 'P0002';
  end if;
  if settlement.projection_applied_at is not null then return false; end if;
  if settlement.match_mode not in ('ranked','unranked')
      or settlement.player_a_id = settlement.player_b_id
      or settlement.winner_player_id not in (settlement.player_a_id, settlement.player_b_id)
      or settlement.termination_reason not in (
        'king-captured','timeout','forfeit','disconnect-forfeit'
      ) then
    raise exception 'ineligible multiplayer career settlement' using errcode = '22023';
  end if;

  player_a_value := private.multiplayer_settlement_participant(
    settlement, settlement.player_a_id
  );
  player_b_value := private.multiplayer_settlement_participant(
    settlement, settlement.player_b_id
  );
  if player_a_value ->> 'playerId' = player_b_value ->> 'playerId' then
    raise exception 'settlement participants must remain distinct' using errcode = '22023';
  end if;

  -- Stable PlayerId lock ordering protects participant symmetry across retries.
  perform player.player_id from public.players player
  where player.player_id in (settlement.player_a_id, settlement.player_b_id)
  order by player.player_id for update;
  get diagnostics locked_count = row_count;
  if locked_count <> 2 then
    raise exception 'canonical multiplayer participants are missing' using errcode = 'P0002';
  end if;

  perform private.add_multiplayer_career_participant(
    settlement.player_a_id, player_a_value, settlement.match_mode = 'ranked',
    settlement.winner_player_id = settlement.player_a_id
  );
  perform private.add_multiplayer_career_participant(
    settlement.player_b_id, player_b_value, settlement.match_mode = 'ranked',
    settlement.winner_player_id = settlement.player_b_id
  );
  update private.multiplayer_career_telemetry_settlements candidate
  set projection_applied_at = now()
  where candidate.match_id = settlement.match_id
    and candidate.projection_applied_at is null;
  if not found then
    raise exception 'career projection marker was not applied' using errcode = '40001';
  end if;
  return true;
end;
$$;

create or replace function private.project_pending_multiplayer_career_settlements(
  batch_size integer default 100
) returns integer language plpgsql security definer set search_path = '' as $$
declare candidate_match_id uuid; projected integer := 0;
begin
  if batch_size < 1 or batch_size > 1000 then
    raise exception 'projection batch size must be between 1 and 1000' using errcode = '22023';
  end if;
  for candidate_match_id in
    select settlement.match_id
    from private.multiplayer_career_telemetry_settlements settlement
    where settlement.projection_applied_at is null
    order by settlement.finalized_at, settlement.match_id
    limit batch_size
  loop
    if private.project_multiplayer_career_settlement(candidate_match_id) then
      projected := projected + 1;
    end if;
  end loop;
  return projected;
end;
$$;

-- Make settlement creation and projection one transaction. A retry that sees
-- an existing settlement safely completes any still-unapplied projection.
create or replace function private.finalize_multiplayer_career_telemetry(
  match_row private.multiplayer_matches
) returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; snapshot jsonb; projected boolean;
begin
  if match_row.status <> 'terminal'
      or match_row.winner_player_id is null
      or match_row.winner_player_id not in (match_row.player_a_id, match_row.player_b_id)
      or match_row.termination_reason not in (
        'king-captured','timeout','forfeit','disconnect-forfeit'
      ) then
    return false;
  end if;
  select jsonb_object_agg(telemetry.player_side, jsonb_build_object(
    'playerId', telemetry.player_id,
    'rouletteRolls', telemetry.roulette_rolls,
    'playTimeMs', telemetry.play_time_ms,
    'playerTurnsCompleted', telemetry.player_turns_completed,
    'threeRightsTurns', telemetry.three_rights_turns,
    'kingsCaptured', telemetry.kings_captured,
    'rollsByPiece', telemetry.rolls_by_piece,
    'movesByPiece', telemetry.moves_by_piece,
    'tripleRollsByPiece', telemetry.triple_rolls_by_piece
  )) into snapshot
  from private.multiplayer_match_player_telemetry telemetry
  where telemetry.match_id = match_row.match_id;
  if snapshot is null or not (snapshot ? 'white' and snapshot ? 'black') then
    raise exception 'complete match telemetry is required' using errcode = 'P0002';
  end if;
  insert into private.multiplayer_career_telemetry_settlements (
    match_id, match_mode, player_a_id, player_b_id, winner_player_id,
    termination_reason, telemetry_snapshot
  ) values (
    match_row.match_id, match_row.mode, match_row.player_a_id, match_row.player_b_id,
    match_row.winner_player_id, match_row.termination_reason, snapshot
  ) on conflict (match_id) do nothing;
  get diagnostics inserted_count = row_count;
  projected := private.project_multiplayer_career_settlement(match_row.match_id);
  return inserted_count = 1 or projected;
end;
$$;

revoke all on function private.valid_multiplayer_settlement_participant(jsonb,uuid)
  from public, anon, authenticated;
revoke all on function private.multiplayer_settlement_participant(
  private.multiplayer_career_telemetry_settlements,uuid
) from public, anon, authenticated;
revoke all on function private.add_multiplayer_career_participant(uuid,jsonb,boolean,boolean)
  from public, anon, authenticated;
revoke all on function private.project_multiplayer_career_settlement(uuid)
  from public, anon, authenticated;
revoke all on function private.project_pending_multiplayer_career_settlements(integer)
  from public, anon, authenticated;
revoke all on function private.finalize_multiplayer_career_telemetry(private.multiplayer_matches)
  from public, anon, authenticated;
grant execute on function private.project_multiplayer_career_settlement(uuid),
  private.project_pending_multiplayer_career_settlements(integer)
  to service_role;

-- These are 5D-A settlements, not reconstructed pre-contract history. Applying
-- them is the retry/recovery half of the projection contract.
select private.project_pending_multiplayer_career_settlements(1000);

commit;
