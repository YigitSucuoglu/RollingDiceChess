do $$
declare inspect_definition text; resolve_definition text; linked_definition text;
begin
  select pg_get_functiondef('public.inspect_profile_conflict(text)'::regprocedure)
    into inspect_definition;
  select pg_get_functiondef(
    'public.resolve_profile_conflict(text,public.profile_conflict_resolution)'::regprocedure
  ) into resolve_definition;
  select pg_get_functiondef('public.complete_linked_guest_upgrade(text)'::regprocedure)
    into linked_definition;

  if position('intent.expires_at < now() and intent.account_auth_user_id is null'
      in inspect_definition) = 0 then
    raise exception 'inspect_profile_conflict does not preserve bound conflict recovery';
  end if;
  if position('intent.expires_at < now() and intent.account_auth_user_id is null'
      in resolve_definition) = 0 then
    raise exception 'resolve_profile_conflict does not preserve bound conflict recovery';
  end if;
  if position('auth.uid() <> intent.guest_auth_user_id' in linked_definition) = 0 then
    raise exception 'linked Guest recovery lost its source-owner check';
  end if;
  if position('intent.expires_at < now()' in linked_definition) > 0 then
    raise exception 'linked Guest recovery is still irrecoverably time-limited';
  end if;
end;
$$;

select
  has_function_privilege('authenticated', 'public.inspect_profile_conflict(text)', 'EXECUTE')
    as authenticated_can_inspect,
  has_function_privilege(
    'authenticated',
    'public.resolve_profile_conflict(text,public.profile_conflict_resolution)',
    'EXECUTE'
  ) as authenticated_can_resolve,
  not has_function_privilege('anon', 'public.inspect_profile_conflict(text)', 'EXECUTE')
    as anon_cannot_inspect;
