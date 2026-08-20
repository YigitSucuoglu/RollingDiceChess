begin;

create or replace function public.trusted_diagnose_multiplayer_reconciliation(
  requested_caller_player_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  membership private.multiplayer_active_participants%rowtype;
  lobby private.multiplayer_lobbies%rowtype;
  match_row private.multiplayer_matches%rowtype;
  participant_valid boolean := false;
  classification text := 'unknown';
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  select * into membership from private.multiplayer_active_participants
    where player_id = requested_caller_player_id;
  if membership.player_id is null then
    return jsonb_build_object('membershipFound', false, 'classification', 'none');
  end if;
  if membership.match_id is not null then
    select * into match_row from private.multiplayer_matches where match_id = membership.match_id;
    if match_row.match_id is not null then
      select * into lobby from private.multiplayer_lobbies where lobby_id = match_row.lobby_id;
      participant_valid := requested_caller_player_id in (match_row.player_a_id, match_row.player_b_id);
    end if;
  else
    select * into lobby from private.multiplayer_lobbies where lobby_id = membership.lobby_id;
    select * into match_row from private.multiplayer_matches where lobby_id = membership.lobby_id;
    participant_valid := lobby.lobby_id is not null
      and requested_caller_player_id in (lobby.host_player_id, lobby.opponent_player_id);
  end if;
  classification := case
    when membership.match_id is not null and match_row.match_id is null then 'orphaned'
    when membership.lobby_id is not null and lobby.lobby_id is null then 'orphaned'
    when not participant_valid then 'inconsistent'
    when match_row.status in ('terminal', 'technical-abort') then 'terminal'
    when match_row.status = 'active' and match_row.canonical_state is not null then 'active'
    when lobby.status = 'waiting' then 'waiting'
    when lobby.status = 'ready' then 'ready'
    when lobby.status = 'starting' and match_row.status = 'initializing'
      and match_row.updated_at >= now() - interval '5 minutes' then 'recent-starting'
    when lobby.status = 'starting' and match_row.status = 'initializing'
      and match_row.updated_at < now() - interval '5 minutes' then 'stale-starting'
    else 'unknown'
  end;
  return jsonb_build_object(
    'membershipFound', true,
    'membershipLink', case when membership.match_id is null then 'lobby' else 'match' end,
    'lobbyFound', lobby.lobby_id is not null,
    'lobbyStatus', lobby.status,
    'matchFound', match_row.match_id is not null,
    'matchStatus', match_row.status,
    'matchRevision', match_row.revision,
    'canonicalSnapshotFound', match_row.canonical_state is not null,
    'rollFound', match_row.current_roll is not null,
    'turnFound', match_row.current_turn is not null,
    'participantValid', participant_valid,
    'matchAgeSeconds', case when match_row.match_id is null then null
      else floor(extract(epoch from now() - match_row.updated_at)) end,
    'staleThresholdSeconds', 300,
    'staleThresholdMet', match_row.match_id is not null
      and match_row.updated_at < now() - interval '5 minutes',
    'classification', classification
  );
end;
$$;

revoke all on function public.trusted_diagnose_multiplayer_reconciliation(uuid)
  from public, anon, authenticated;
grant execute on function public.trusted_diagnose_multiplayer_reconciliation(uuid) to service_role;

commit;
