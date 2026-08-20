begin;

-- A pre-01C start can be stranded after match creation but before trusted
-- activation. Only old, initializing rows without canonical state qualify.
create or replace function public.get_current_multiplayer_context()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); membership private.multiplayer_active_participants%rowtype;
  lobby private.multiplayer_lobbies%rowtype; match_row private.multiplayer_matches%rowtype;
begin
  if caller is null then raise exception 'active player not found' using errcode = 'P0002'; end if;
  select * into membership from private.multiplayer_active_participants where player_id = caller for update;
  if membership.player_id is null then return null; end if;
  if membership.match_id is not null then
    select * into match_row from private.multiplayer_matches where match_id = membership.match_id;
    if match_row.status in ('terminal', 'technical-abort') then
      delete from private.multiplayer_active_participants where match_id = membership.match_id;
      return null;
    end if;
    return jsonb_build_object('kind', 'match', 'matchId', membership.match_id);
  end if;
  select * into lobby from private.multiplayer_lobbies where lobby_id = membership.lobby_id for update;
  if lobby.lobby_id is null or lobby.status = 'closed' then
    delete from private.multiplayer_active_participants where player_id = caller;
    return null;
  end if;
  if lobby.status = 'starting' then
    select * into match_row from private.multiplayer_matches where lobby_id = lobby.lobby_id;
    if match_row.match_id is not null and match_row.status = 'active' and match_row.canonical_state is not null then
      update private.multiplayer_active_participants set match_id = match_row.match_id, lobby_id = null
        where lobby_id = lobby.lobby_id;
      update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
      return jsonb_build_object('kind', 'match', 'matchId', match_row.match_id);
    end if;
    if match_row.match_id is not null and match_row.status = 'initializing'
        and match_row.canonical_state is null and match_row.created_at < now() - interval '5 minutes' then
      return jsonb_build_object('kind', 'legacy-match', 'matchId', match_row.match_id);
    end if;
    if match_row.match_id is not null then return jsonb_build_object('kind', 'match', 'matchId', match_row.match_id); end if;
  end if;
  if lobby.expires_at <= now() and lobby.status in ('waiting', 'ready') then
    delete from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
    perform set_config('roulettechess.lobby_event_kind', 'expired', true);
    update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
    return null;
  end if;
  return jsonb_build_object('kind', 'lobby', 'role', case when lobby.host_player_id = caller then 'host' else 'opponent' end,
    'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, caller));
end;
$$;

create or replace function public.trusted_recover_legacy_multiplayer_match(
  requested_match_id uuid, requested_caller_player_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare match_row private.multiplayer_matches%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  select * into match_row from private.multiplayer_matches where match_id = requested_match_id for update;
  if match_row.match_id is null or requested_caller_player_id not in (match_row.player_a_id, match_row.player_b_id) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  if match_row.status = 'technical-abort' and match_row.termination_reason = 'technical-abort' then
    delete from private.multiplayer_active_participants where match_id = match_row.match_id or lobby_id = match_row.lobby_id;
    return private.multiplayer_match_service_snapshot(match_row);
  end if;
  if match_row.status <> 'initializing' or match_row.canonical_state is not null
      or match_row.created_at >= now() - interval '5 minutes' then
    raise exception 'match is not legacy recoverable' using errcode = '42501';
  end if;
  update private.multiplayer_matches set status = 'technical-abort', termination_reason = 'technical-abort',
    winner_player_id = null, active_turn_started_at = null, revision = revision + 1, updated_at = now()
    where match_id = match_row.match_id returning * into match_row;
  perform set_config('roulettechess.lobby_event_kind', 'legacy-recovered', true);
  update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
  delete from private.multiplayer_active_participants where match_id = match_row.match_id or lobby_id = match_row.lobby_id;
  return private.multiplayer_match_service_snapshot(match_row);
end;
$$;

revoke all on function public.trusted_recover_legacy_multiplayer_match(uuid,uuid) from public, anon, authenticated;
grant execute on function public.trusted_recover_legacy_multiplayer_match(uuid,uuid) to service_role;

commit;
