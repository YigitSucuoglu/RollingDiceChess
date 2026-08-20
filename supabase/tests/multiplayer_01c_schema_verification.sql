begin;

do $$
declare function_definition text;
begin
  if not has_function_privilege(
      'service_role',
      'public.trusted_activate_multiplayer_match(uuid,uuid,boolean,jsonb,text[])',
      'EXECUTE') then
    raise exception 'service_role must activate authoritative matches';
  end if;
  if has_function_privilege(
      'authenticated',
      'public.trusted_commit_multiplayer_move(uuid,uuid,bigint,jsonb,text[],text,boolean,text)',
      'EXECUTE')
      or has_function_privilege(
        'anon',
        'public.trusted_forfeit_multiplayer_match(uuid,uuid)',
        'EXECUTE') then
    raise exception 'browser roles must not execute trusted match transitions';
  end if;
  select pg_get_functiondef(
    'public.trusted_commit_multiplayer_move(uuid,uuid,bigint,jsonb,text[],text,boolean,text)'::regprocedure)
    into function_definition;
  if function_definition not like '%for update%'
      or function_definition not like '%stale revision%'
      or function_definition not like '%active player authorization required%' then
    raise exception 'trusted move commit must lock, revision-check and authorize the active participant';
  end if;
  select pg_get_functiondef(
    'private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)'::regprocedure)
    into function_definition;
  if function_definition not like '%private.settle_ranked_match%' then
    raise exception 'ranked terminal transitions must use the canonical settlement boundary';
  end if;
end;
$$;

select
  has_function_privilege('service_role',
    'public.trusted_get_multiplayer_match(uuid,uuid,boolean)', 'EXECUTE') as service_can_read,
  not has_function_privilege('authenticated',
    'public.trusted_get_multiplayer_match(uuid,uuid,boolean)', 'EXECUTE') as browser_cannot_read_trusted,
  not has_function_privilege('authenticated',
    'public.trusted_activate_multiplayer_match(uuid,uuid,boolean,jsonb,text[])', 'EXECUTE') as browser_cannot_activate,
  not has_function_privilege('authenticated',
    'public.trusted_commit_multiplayer_move(uuid,uuid,bigint,jsonb,text[],text,boolean,text)', 'EXECUTE') as browser_cannot_commit,
  not has_function_privilege('authenticated',
    'public.trusted_forfeit_multiplayer_match(uuid,uuid)', 'EXECUTE') as browser_cannot_forfeit;

rollback;
