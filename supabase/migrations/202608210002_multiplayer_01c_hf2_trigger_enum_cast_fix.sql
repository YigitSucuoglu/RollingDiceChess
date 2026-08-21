-- MULTIPLAYER-01C-HF2: the shared membership cleanup trigger runs for both
-- match-status and lobby-status enums. Compare their values as text so literals
-- are never coerced to the wrong enum type during trigger evaluation.
begin;

create or replace function private.release_terminal_multiplayer_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'multiplayer_matches'
      and new.status::text in ('terminal', 'technical-abort') then
    delete from private.multiplayer_active_participants
      where match_id = new.match_id or lobby_id = new.lobby_id;
  elsif tg_table_name = 'multiplayer_lobbies' and new.status::text = 'closed' then
    delete from private.multiplayer_active_participants where lobby_id = new.lobby_id;
  end if;
  return new;
end;
$$;

revoke all on function private.release_terminal_multiplayer_membership()
  from public, anon, authenticated;

commit;
