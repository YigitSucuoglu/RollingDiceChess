-- MULTIPLAYER-01B hotfix: allow the intended participant event read without
-- granting browser execution on the private current_player_id helper.
begin;

drop policy if exists multiplayer_lobby_events_read_safe
  on public.multiplayer_lobby_events;

create policy multiplayer_lobby_events_read_safe
  on public.multiplayer_lobby_events
  for select
  to authenticated
  using (
    scope = 'public-list'
    or recipient_player_id in (
      select ownership.player_id
      from public.player_auth_owners ownership
      where ownership.auth_user_id = (select auth.uid())
    )
  );

commit;
