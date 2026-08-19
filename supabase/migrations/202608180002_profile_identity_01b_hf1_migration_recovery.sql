begin;

-- Once a migration is cryptographically bound to its source Guest or target
-- account, expiry must not make an unresolved profile choice unrecoverable.
-- Unbound handoff tokens retain the original 15-minute expiry boundary.
create or replace function public.complete_linked_guest_upgrade(handoff_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare intent public.player_migration_intents;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'account session required' using errcode='42501';
  end if;
  select * into intent from public.player_migration_intents
    where handoff_token_hash=extensions.digest(handoff_token,'sha256') for update;
  if intent.migration_id is null then raise exception 'invalid migration' using errcode='42501'; end if;
  if intent.resolved_at is not null then
    if intent.resolution <> 'USE_GUEST_PROFILE'
        or intent.surviving_player_id <> intent.guest_player_id
        or intent.account_auth_user_id <> auth.uid() then
      raise exception 'migration already resolved differently' using errcode='23505';
    end if;
    return intent.surviving_player_id;
  end if;
  if auth.uid() <> intent.guest_auth_user_id then
    raise exception 'linked account does not match guest session' using errcode='42501';
  end if;
  if not exists (select 1 from public.player_auth_owners
      where auth_user_id=auth.uid() and player_id=intent.guest_player_id for update) then
    raise exception 'guest ownership no longer active' using errcode='42501';
  end if;
  update public.players set ownership_kind='account', updated_at=now()
    where player_id=intent.guest_player_id and lifecycle='active';
  update public.player_migration_intents set
    account_auth_user_id=auth.uid(), resolved_at=now(), resolution='USE_GUEST_PROFILE',
    surviving_player_id=intent.guest_player_id
    where migration_id=intent.migration_id;
  return intent.guest_player_id;
end;
$$;

create or replace function public.inspect_profile_conflict(handoff_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare intent public.player_migration_intents; google_player uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'account session required' using errcode='42501';
  end if;
  select * into intent from public.player_migration_intents
    where handoff_token_hash=extensions.digest(handoff_token,'sha256') for update;
  if intent.migration_id is null then raise exception 'invalid migration' using errcode='42501'; end if;
  select player_id into google_player from public.player_auth_owners
    where auth_user_id=auth.uid() for update;
  if google_player is null then raise exception 'account player not found' using errcode='P0002'; end if;
  if intent.resolved_at is not null then
    if intent.account_auth_user_id <> auth.uid() then
      raise exception 'migration belongs to another account' using errcode='42501';
    end if;
    return jsonb_build_object('status','resolved','resolution',intent.resolution,
      'survivingPlayerId',intent.surviving_player_id);
  end if;
  if intent.account_auth_user_id is not null and intent.account_auth_user_id <> auth.uid() then
    raise exception 'migration belongs to another account' using errcode='42501';
  end if;
  if intent.expires_at < now() and intent.account_auth_user_id is null then
    raise exception 'expired migration' using errcode='42501';
  end if;
  if not exists (select 1 from public.player_auth_owners
      where auth_user_id=intent.guest_auth_user_id and player_id=intent.guest_player_id for update) then
    raise exception 'guest ownership no longer active' using errcode='42501';
  end if;
  if google_player=intent.guest_player_id then
    raise exception 'profiles are already linked' using errcode='22023';
  end if;
  update public.player_migration_intents set account_auth_user_id=auth.uid()
    where migration_id=intent.migration_id and account_auth_user_id is null;
  return jsonb_build_object(
    'status','profile-conflict',
    'guest',private.migration_profile_summary(intent.guest_player_id),
    'google',private.migration_profile_summary(google_player)
  );
end;
$$;

create or replace function public.resolve_profile_conflict(
  handoff_token text, requested_resolution public.profile_conflict_resolution
) returns uuid language plpgsql security definer set search_path = '' as $$
declare intent public.player_migration_intents; google_player uuid; survivor uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'account session required' using errcode='42501';
  end if;
  select * into intent from public.player_migration_intents
    where handoff_token_hash=extensions.digest(handoff_token,'sha256') for update;
  if intent.migration_id is null then raise exception 'invalid migration' using errcode='42501'; end if;
  if intent.resolved_at is not null then
    if intent.account_auth_user_id <> auth.uid() then
      raise exception 'migration belongs to another account' using errcode='42501';
    end if;
    if intent.resolution <> requested_resolution then
      raise exception 'migration already resolved differently' using errcode='23505';
    end if;
    return intent.surviving_player_id;
  end if;
  if intent.account_auth_user_id is not null and intent.account_auth_user_id <> auth.uid() then
    raise exception 'migration belongs to another account' using errcode='42501';
  end if;
  if intent.expires_at < now() and intent.account_auth_user_id is null then
    raise exception 'expired migration' using errcode='42501';
  end if;
  if not exists (select 1 from public.player_auth_owners
      where auth_user_id=intent.guest_auth_user_id and player_id=intent.guest_player_id for update) then
    raise exception 'guest ownership no longer active' using errcode='42501';
  end if;
  select player_id into google_player from public.player_auth_owners
    where auth_user_id=auth.uid() for update;
  if google_player is null then raise exception 'account player not found' using errcode='P0002'; end if;
  if google_player=intent.guest_player_id then raise exception 'profiles are already linked' using errcode='22023'; end if;
  if requested_resolution='USE_GOOGLE_PROFILE' then
    survivor := google_player;
    update public.players set lifecycle='retired', superseded_by=survivor, updated_at=now()
      where player_id=intent.guest_player_id and lifecycle='active';
    delete from public.player_auth_owners where auth_user_id=intent.guest_auth_user_id;
  else
    survivor := intent.guest_player_id;
    update public.players set lifecycle='retired', superseded_by=survivor, updated_at=now()
      where player_id=google_player and lifecycle='active';
    delete from public.player_auth_owners where auth_user_id in (intent.guest_auth_user_id, auth.uid());
    insert into public.player_auth_owners(auth_user_id, player_id) values(auth.uid(), survivor);
    update public.players set ownership_kind='account', updated_at=now() where player_id=survivor;
  end if;
  update public.player_migration_intents set account_auth_user_id=auth.uid(), resolved_at=now(),
    resolution=requested_resolution, surviving_player_id=survivor
    where migration_id=intent.migration_id;
  return survivor;
end;
$$;

revoke all on function public.complete_linked_guest_upgrade(text) from public, anon, authenticated;
revoke all on function public.inspect_profile_conflict(text) from public, anon, authenticated;
revoke all on function public.resolve_profile_conflict(text, public.profile_conflict_resolution)
  from public, anon, authenticated;
grant execute on function public.complete_linked_guest_upgrade(text),
  public.inspect_profile_conflict(text),
  public.resolve_profile_conflict(text, public.profile_conflict_resolution) to authenticated;

commit;
