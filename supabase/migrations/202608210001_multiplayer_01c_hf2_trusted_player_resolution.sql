-- MULTIPLAYER-01C-HF2: resolve the server-verified Auth user without granting
-- the trusted runtime direct access to player ownership tables.
begin;

create or replace function public.trusted_resolve_multiplayer_player(
  requested_auth_user_id uuid
) returns uuid language plpgsql stable security definer set search_path = '' as $$
declare resolved_player_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if requested_auth_user_id is null then
    raise exception 'verified auth user required' using errcode = '22023';
  end if;
  select ownership.player_id into resolved_player_id
  from public.player_auth_owners ownership
  join public.players player on player.player_id = ownership.player_id
  where ownership.auth_user_id = requested_auth_user_id
    and player.lifecycle = 'active';
  return resolved_player_id;
end;
$$;

revoke all on function public.trusted_resolve_multiplayer_player(uuid)
  from public, anon, authenticated;
grant execute on function public.trusted_resolve_multiplayer_player(uuid) to service_role;

commit;
