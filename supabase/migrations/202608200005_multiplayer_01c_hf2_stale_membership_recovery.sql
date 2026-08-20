begin;

create or replace function private.release_terminal_multiplayer_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'multiplayer_matches'
      and new.status in ('terminal', 'technical-abort') then
    delete from private.multiplayer_active_participants where match_id = new.match_id or lobby_id = new.lobby_id;
  elsif tg_table_name = 'multiplayer_lobbies' and new.status = 'closed' then
    delete from private.multiplayer_active_participants where lobby_id = new.lobby_id;
  end if;
  return new;
end;
$$;

drop trigger if exists release_terminal_match_membership on private.multiplayer_matches;
create trigger release_terminal_match_membership
after insert or update of status on private.multiplayer_matches
for each row execute function private.release_terminal_multiplayer_membership();

drop trigger if exists release_closed_lobby_membership on private.multiplayer_lobbies;
create trigger release_closed_lobby_membership
after insert or update of status on private.multiplayer_lobbies
for each row execute function private.release_terminal_multiplayer_membership();

create or replace function public.trusted_reconcile_multiplayer_state(requested_caller_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  membership private.multiplayer_active_participants%rowtype;
  lobby private.multiplayer_lobbies%rowtype;
  match_row private.multiplayer_matches%rowtype;
  membership_count integer;
  participant_membership_count integer;
  caller_role text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  select * into membership from private.multiplayer_active_participants
    where player_id = requested_caller_player_id for update;
  if membership.player_id is null then return jsonb_build_object('kind', 'none'); end if;

  if membership.match_id is not null then
    select * into match_row from private.multiplayer_matches where match_id = membership.match_id for update;
    if match_row.match_id is null then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if requested_caller_player_id not in (match_row.player_a_id, match_row.player_b_id) then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    select * into lobby from private.multiplayer_lobbies where lobby_id = match_row.lobby_id for update;
  else
    select * into lobby from private.multiplayer_lobbies where lobby_id = membership.lobby_id for update;
    if lobby.lobby_id is null then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if requested_caller_player_id not in (lobby.host_player_id, lobby.opponent_player_id) then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    select * into match_row from private.multiplayer_matches where lobby_id = lobby.lobby_id for update;
  end if;

  if match_row.match_id is not null then
    if match_row.status in ('terminal', 'technical-abort') then
      delete from private.multiplayer_active_participants where match_id = match_row.match_id or lobby_id = match_row.lobby_id;
      if lobby.status is distinct from 'closed' then
        update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
      end if;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if match_row.status = 'active' then
      if match_row.canonical_state is not null and match_row.current_roll is not null
          and match_row.current_turn is not null
          and match_row.white_player_id in (match_row.player_a_id, match_row.player_b_id)
          and match_row.black_player_id in (match_row.player_a_id, match_row.player_b_id)
          and match_row.white_player_id is distinct from match_row.black_player_id then
        update private.multiplayer_active_participants set match_id = match_row.match_id, lobby_id = null
          where lobby_id = match_row.lobby_id;
        if lobby.status is distinct from 'closed' then
          update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
        end if;
        return jsonb_build_object('kind', 'match', 'matchId', match_row.match_id);
      end if;
      update private.multiplayer_matches set status = 'technical-abort', termination_reason = 'technical-abort',
        winner_player_id = null, active_turn_started_at = null, revision = revision + 1, updated_at = now()
        where match_id = match_row.match_id;
      update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if match_row.status = 'initializing' then
      if lobby.status = 'starting' and match_row.updated_at >= now() - interval '5 minutes' then
        caller_role := case when requested_caller_player_id = lobby.host_player_id then 'host' else 'opponent' end;
        return jsonb_build_object('kind', 'starting', 'matchId', match_row.match_id, 'role', caller_role);
      end if;
      update private.multiplayer_matches set status = 'technical-abort', termination_reason = 'technical-abort',
        winner_player_id = null, active_turn_started_at = null, revision = revision + 1, updated_at = now()
        where match_id = match_row.match_id;
      update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
  end if;

  if lobby.status = 'closed' then
    delete from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
    return jsonb_build_object('kind', 'recovered');
  end if;
  select count(*), count(*) filter (where player_id in (lobby.host_player_id, lobby.opponent_player_id))
    into membership_count, participant_membership_count
    from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
  if (lobby.status = 'waiting' and lobby.opponent_player_id is null
        and membership_count = 1 and participant_membership_count = 1)
      or (lobby.status = 'ready' and lobby.opponent_player_id is not null
        and membership_count = 2 and participant_membership_count = 2) then
    return jsonb_build_object('kind', 'lobby',
      'role', case when requested_caller_player_id = lobby.host_player_id then 'host' else 'opponent' end,
      'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, requested_caller_player_id));
  end if;
  if lobby.status = 'starting' and lobby.updated_at >= now() - interval '5 minutes' then
    return jsonb_build_object('kind', 'lobby',
      'role', case when requested_caller_player_id = lobby.host_player_id then 'host' else 'opponent' end,
      'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, requested_caller_player_id));
  end if;
  update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
  return jsonb_build_object('kind', 'recovered');
end;
$$;

revoke all on function public.trusted_reconcile_multiplayer_state(uuid) from public, anon, authenticated;
grant execute on function public.trusted_reconcile_multiplayer_state(uuid) to service_role;
revoke execute on function public.get_current_multiplayer_context() from authenticated;
revoke all on function private.release_terminal_multiplayer_membership() from public, anon, authenticated;

commit;
