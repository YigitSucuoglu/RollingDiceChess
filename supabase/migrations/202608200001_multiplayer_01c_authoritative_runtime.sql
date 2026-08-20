-- MULTIPLAYER-01C: service-only authoritative match transitions for the Vercel trusted runtime.
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
    'serverNow', now()
  );
$$;

create or replace function private.settle_multiplayer_match_if_eligible(match_row private.multiplayer_matches)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if match_row.mode = 'ranked'
      and match_row.status = 'terminal'
      and match_row.winner_player_id is not null
      and match_row.termination_reason in ('king-captured', 'timeout', 'forfeit') then
    perform private.settle_ranked_match(
      match_row.match_id,
      'multiplayer-ranked',
      match_row.player_a_id,
      match_row.player_b_id,
      match_row.winner_player_id,
      case when match_row.termination_reason = 'forfeit' then 'forfeit' else 'normal' end
    );
  end if;
end;
$$;

create or replace function public.trusted_activate_multiplayer_match(
  requested_match_id uuid,
  requested_caller_player_id uuid,
  requested_host_is_white boolean,
  trusted_initial_state jsonb,
  trusted_initial_roll text[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare match_row private.multiplayer_matches%rowtype; lobby private.multiplayer_lobbies%rowtype;
begin
  if trusted_initial_state is null or jsonb_typeof(trusted_initial_state) <> 'object'
      or cardinality(trusted_initial_roll) <> 3
      or not trusted_initial_roll <@ array['pawn','knight','bishop','rook','queen','king']::text[] then
    raise exception 'invalid trusted initial state' using errcode = '22023';
  end if;
  select * into match_row from private.multiplayer_matches
    where match_id = requested_match_id for update;
  if match_row.match_id is null then raise exception 'match not found' using errcode = 'P0002'; end if;
  if requested_caller_player_id <> match_row.player_a_id then
    raise exception 'host authorization required' using errcode = '42501';
  end if;
  if match_row.status = 'active' then return private.multiplayer_match_service_snapshot(match_row); end if;
  if match_row.status <> 'initializing' then raise exception 'match cannot be activated' using errcode = '55000'; end if;
  select * into lobby from private.multiplayer_lobbies where lobby_id = match_row.lobby_id for update;
  if lobby.host_player_id <> requested_caller_player_id or lobby.status <> 'starting'
      or lobby.opponent_player_id is null then
    raise exception 'lobby start invariant failed' using errcode = '55000';
  end if;
  update private.multiplayer_matches set
    white_player_id = case when requested_host_is_white then player_a_id else player_b_id end,
    black_player_id = case when requested_host_is_white then player_b_id else player_a_id end,
    canonical_state = trusted_initial_state,
    realtime_topic = 'match:' || match_id::text,
    current_roll = trusted_initial_roll,
    current_turn = 'white',
    white_remaining_ms = initial_ms,
    black_remaining_ms = initial_ms,
    active_turn_started_at = now(),
    white_reconnect_deadline = now() + interval '30 seconds',
    black_reconnect_deadline = now() + interval '30 seconds',
    status = 'active', revision = 1, activated_at = now(), updated_at = now()
  where match_id = requested_match_id returning * into match_row;
  update private.multiplayer_active_participants set match_id = requested_match_id, lobby_id = null
    where lobby_id = lobby.lobby_id;
  update private.multiplayer_lobbies set status = 'closed', updated_at = now()
    where lobby_id = lobby.lobby_id;
  return private.multiplayer_match_service_snapshot(match_row);
end;
$$;

create or replace function public.trusted_get_multiplayer_match(
  requested_match_id uuid,
  requested_caller_player_id uuid,
  refresh_presence boolean default true
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare match_row private.multiplayer_matches%rowtype; white_expired boolean; black_expired boolean;
begin
  select * into match_row from private.multiplayer_matches
    where match_id = requested_match_id for update;
  if match_row.match_id is null
      or requested_caller_player_id not in (match_row.player_a_id, match_row.player_b_id) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if match_row.status = 'active' then
    white_expired := match_row.white_reconnect_deadline is not null
      and match_row.white_reconnect_deadline <= now();
    black_expired := match_row.black_reconnect_deadline is not null
      and match_row.black_reconnect_deadline <= now();
    if white_expired or black_expired then
      update private.multiplayer_matches set
        status = case when white_expired and black_expired then 'technical-abort'::public.multiplayer_match_status
          else 'terminal'::public.multiplayer_match_status end,
        winner_player_id = case
          when white_expired and not black_expired then black_player_id
          when black_expired and not white_expired then white_player_id
          else null end,
        termination_reason = case when white_expired and black_expired then 'technical-abort' else 'forfeit' end,
        revision = revision + 1, active_turn_started_at = null, updated_at = now()
      where match_id = requested_match_id and status = 'active'
      returning * into match_row;
      perform private.settle_multiplayer_match_if_eligible(match_row);
    elsif match_row.active_turn_started_at is not null and (
        (match_row.current_turn = 'white' and
          match_row.white_remaining_ms <= floor(extract(epoch from now() - match_row.active_turn_started_at) * 1000))
        or (match_row.current_turn = 'black' and
          match_row.black_remaining_ms <= floor(extract(epoch from now() - match_row.active_turn_started_at) * 1000))
      ) then
      update private.multiplayer_matches set
        status = 'terminal',
        winner_player_id = case when current_turn = 'white' then black_player_id else white_player_id end,
        termination_reason = 'timeout', revision = revision + 1,
        white_remaining_ms = case when current_turn = 'white' then 0 else white_remaining_ms end,
        black_remaining_ms = case when current_turn = 'black' then 0 else black_remaining_ms end,
        active_turn_started_at = null, updated_at = now()
      where match_id = requested_match_id and status = 'active'
      returning * into match_row;
      perform private.settle_multiplayer_match_if_eligible(match_row);
    elsif refresh_presence then
      update private.multiplayer_matches set
        white_reconnect_deadline = case when requested_caller_player_id = white_player_id
          then now() + interval '30 seconds' else white_reconnect_deadline end,
        black_reconnect_deadline = case when requested_caller_player_id = black_player_id
          then now() + interval '30 seconds' else black_reconnect_deadline end,
        updated_at = now()
      where match_id = requested_match_id returning * into match_row;
    end if;
  end if;
  return private.multiplayer_match_service_snapshot(match_row);
end;
$$;

create or replace function public.trusted_commit_multiplayer_move(
  requested_match_id uuid,
  requested_caller_player_id uuid,
  expected_revision bigint,
  trusted_state jsonb,
  trusted_roll text[],
  trusted_turn text,
  turn_completed boolean,
  trusted_winner text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare match_row private.multiplayer_matches%rowtype; elapsed_ms bigint; caller_side text;
begin
  if trusted_state is null or jsonb_typeof(trusted_state) <> 'object'
      or cardinality(trusted_roll) <> 3 or trusted_turn not in ('white','black')
      or trusted_winner is not null and trusted_winner not in ('white','black') then
    raise exception 'invalid trusted transition' using errcode = '22023';
  end if;
  select * into match_row from private.multiplayer_matches
    where match_id = requested_match_id for update;
  if match_row.match_id is null or match_row.status <> 'active' then
    raise exception 'active match not found' using errcode = 'P0002';
  end if;
  if match_row.revision <> expected_revision then
    raise exception 'stale revision' using errcode = '40001';
  end if;
  caller_side := case when requested_caller_player_id = match_row.white_player_id then 'white'
    when requested_caller_player_id = match_row.black_player_id then 'black' else null end;
  if caller_side is null or caller_side <> match_row.current_turn then
    raise exception 'active player authorization required' using errcode = '42501';
  end if;
  elapsed_ms := greatest(0, floor(extract(epoch from now() - match_row.active_turn_started_at) * 1000));
  if (caller_side = 'white' and elapsed_ms >= match_row.white_remaining_ms)
      or (caller_side = 'black' and elapsed_ms >= match_row.black_remaining_ms) then
    update private.multiplayer_matches set
      status = 'terminal', winner_player_id = case when caller_side = 'white' then black_player_id else white_player_id end,
      termination_reason = 'timeout', revision = revision + 1,
      white_remaining_ms = case when caller_side = 'white' then 0 else white_remaining_ms end,
      black_remaining_ms = case when caller_side = 'black' then 0 else black_remaining_ms end,
      active_turn_started_at = null, updated_at = now()
    where match_id = requested_match_id returning * into match_row;
  else
    update private.multiplayer_matches set
      canonical_state = trusted_state, current_roll = trusted_roll, current_turn = trusted_turn,
      white_remaining_ms = case when caller_side = 'white'
        then white_remaining_ms - elapsed_ms + case when turn_completed and trusted_winner is null then increment_ms else 0 end
        else white_remaining_ms end,
      black_remaining_ms = case when caller_side = 'black'
        then black_remaining_ms - elapsed_ms + case when turn_completed and trusted_winner is null then increment_ms else 0 end
        else black_remaining_ms end,
      status = case when trusted_winner is null then status else 'terminal'::public.multiplayer_match_status end,
      winner_player_id = case when trusted_winner = 'white' then white_player_id
        when trusted_winner = 'black' then black_player_id else null end,
      termination_reason = case when trusted_winner is null then null else 'king-captured' end,
      revision = revision + 1,
      active_turn_started_at = case when trusted_winner is null and turn_completed then now()
        when trusted_winner is null then active_turn_started_at else null end,
      white_reconnect_deadline = case when requested_caller_player_id = white_player_id
        then now() + interval '30 seconds' else white_reconnect_deadline end,
      black_reconnect_deadline = case when requested_caller_player_id = black_player_id
        then now() + interval '30 seconds' else black_reconnect_deadline end,
      updated_at = now()
    where match_id = requested_match_id returning * into match_row;
  end if;
  perform private.settle_multiplayer_match_if_eligible(match_row);
  return private.multiplayer_match_service_snapshot(match_row);
end;
$$;

create or replace function public.trusted_forfeit_multiplayer_match(
  requested_match_id uuid,
  requested_caller_player_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare match_row private.multiplayer_matches%rowtype;
begin
  select * into match_row from private.multiplayer_matches
    where match_id = requested_match_id for update;
  if match_row.match_id is null or match_row.status <> 'active'
      or requested_caller_player_id not in (match_row.white_player_id, match_row.black_player_id) then
    raise exception 'active match not found' using errcode = 'P0002';
  end if;
  update private.multiplayer_matches set status = 'terminal',
    winner_player_id = case when requested_caller_player_id = white_player_id then black_player_id else white_player_id end,
    termination_reason = 'forfeit', revision = revision + 1,
    active_turn_started_at = null, updated_at = now()
  where match_id = requested_match_id and status = 'active' returning * into match_row;
  perform private.settle_multiplayer_match_if_eligible(match_row);
  return private.multiplayer_match_service_snapshot(match_row);
end;
$$;

revoke all on function private.multiplayer_match_service_snapshot(private.multiplayer_matches) from public, anon, authenticated;
revoke all on function private.settle_multiplayer_match_if_eligible(private.multiplayer_matches) from public, anon, authenticated;
revoke all on function public.trusted_activate_multiplayer_match(uuid,uuid,boolean,jsonb,text[]) from public, anon, authenticated;
revoke all on function public.trusted_get_multiplayer_match(uuid,uuid,boolean) from public, anon, authenticated;
revoke all on function public.trusted_commit_multiplayer_move(uuid,uuid,bigint,jsonb,text[],text,boolean,text) from public, anon, authenticated;
revoke all on function public.trusted_forfeit_multiplayer_match(uuid,uuid) from public, anon, authenticated;
grant execute on function public.trusted_activate_multiplayer_match(uuid,uuid,boolean,jsonb,text[]),
  public.trusted_get_multiplayer_match(uuid,uuid,boolean),
  public.trusted_commit_multiplayer_move(uuid,uuid,bigint,jsonb,text[],text,boolean,text),
  public.trusted_forfeit_multiplayer_match(uuid,uuid) to service_role;

commit;
