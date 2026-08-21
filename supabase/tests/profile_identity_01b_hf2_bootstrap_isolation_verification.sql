-- PROFILE-IDENTITY-01B-HF2 catalog verification. READ-ONLY.
do $$
declare
  definition text := pg_get_functiondef('public.bootstrap_local_profile(jsonb)'::regprocedure);
begin
  if definition not like '%input_source_profile_id <> target::text%' then
    raise exception 'Bootstrap RPC does not enforce source/target PlayerId equality';
  end if;
  if definition not like '%auth.jwt()%is_anonymous%' then
    raise exception 'Bootstrap RPC does not preserve the explicit anonymous Guest path';
  end if;
  if definition not like '%cross-player bootstrap requires explicit migration authorization%' then
    raise exception 'Bootstrap RPC rejection branch is missing';
  end if;
end;
$$;

select
  has_function_privilege('authenticated', 'public.bootstrap_local_profile(jsonb)', 'EXECUTE')
    as authenticated_bootstrap_rpc_preserved,
  not has_function_privilege('anon', 'public.bootstrap_local_profile(jsonb)', 'EXECUTE')
    as anon_bootstrap_rpc_denied,
  not has_table_privilege('authenticated', 'public.local_profile_bootstraps', 'INSERT')
    as browser_direct_bootstrap_insert_denied,
  not has_table_privilege('authenticated', 'public.player_progression', 'UPDATE')
    as browser_direct_progression_update_denied;

