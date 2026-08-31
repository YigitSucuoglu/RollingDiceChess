-- Expose the already-settled ranked result only through the private trusted match snapshot.
begin;

create or replace function private.multiplayer_match_service_snapshot(match_row private.multiplayer_matches)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'matchId', match_row.match_id,
    'revision', match_row.revision,
    'status', match_row.status,
    'mode', match_row.mode,
    'playerAId', match_row.player_a_id,
    'playerBId', match_row.player_b_id,
    'whitePlayerId', match_row.white_player_id,
    'blackPlayerId', match_row.black_player_id,
    'white', case when match_row.white_player_id is null then null
      else private.multiplayer_participant_summary(match_row.white_player_id) end,
    'black', case when match_row.black_player_id is null then null
      else private.multiplayer_participant_summary(match_row.black_player_id) end,
    'timeControl', jsonb_build_object(
      'id', match_row.time_control_id,
      'initialMs', match_row.initial_ms,
      'incrementMs', match_row.increment_ms
    ),
    'canonicalState', match_row.canonical_state,
    'currentRoll', match_row.current_roll,
    'currentTurn', match_row.current_turn,
    'whiteRemainingMs', match_row.white_remaining_ms,
    'blackRemainingMs', match_row.black_remaining_ms,
    'activeTurnStartedAt', match_row.active_turn_started_at,
    'whiteReconnectDeadline', match_row.white_reconnect_deadline,
    'blackReconnectDeadline', match_row.black_reconnect_deadline,
    'winnerPlayerId', match_row.winner_player_id,
    'terminationReason', match_row.termination_reason,
    'ratingSettlement', case when match_row.mode = 'ranked' and match_row.status = 'terminal' then (
      select jsonb_build_object(
        'playerA', jsonb_build_object(
          'before', settlement.player_a_rating_before,
          'delta', settlement.player_a_delta,
          'after', settlement.player_a_rating_after
        ),
        'playerB', jsonb_build_object(
          'before', settlement.player_b_rating_before,
          'delta', settlement.player_b_delta,
          'after', settlement.player_b_rating_after
        )
      )
      from private.rating_settlements settlement
      where settlement.match_id = match_row.match_id
    ) else null end,
    'serverNow', now()
  );
$$;

revoke all on function private.multiplayer_match_service_snapshot(private.multiplayer_matches)
  from public, anon, authenticated;

commit;
