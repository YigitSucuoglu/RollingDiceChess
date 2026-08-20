-- MULTIPLAYER-01C: enforce persisted lobby side preference inside the trusted activation transaction.
begin;

create or replace function private.prepare_authoritative_match_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare persisted_preference public.multiplayer_side_preference;
begin
  if old.status = 'initializing' and new.status = 'active' then
    select lobby.side_preference into persisted_preference
    from private.multiplayer_lobbies lobby where lobby.lobby_id = old.lobby_id;
    if persisted_preference = 'white' then
      new.white_player_id := old.player_a_id;
      new.black_player_id := old.player_b_id;
    elsif persisted_preference = 'black' then
      new.white_player_id := old.player_b_id;
      new.black_player_id := old.player_a_id;
    end if;
    -- Ranked lobbies are constrained to random; random keeps the trusted runtime choice.
  end if;
  if old.status = 'active' and new.status = 'active'
      and new.canonical_state is distinct from old.canonical_state then
    new.active_turn_started_at := now();
  end if;
  if old.status = 'active' and new.status = 'terminal'
      and new.termination_reason = 'forfeit'
      and ((old.white_reconnect_deadline is not null and old.white_reconnect_deadline <= now())
        or (old.black_reconnect_deadline is not null and old.black_reconnect_deadline <= now())) then
    new.termination_reason := 'disconnect-forfeit';
  end if;
  return new;
end;
$$;

commit;
