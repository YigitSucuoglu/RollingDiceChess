-- Run after 202608210001_multiplayer_01c_hf2_trusted_player_resolution.sql.
begin;

do $$
declare function_definition text;
begin
  if not has_function_privilege(
      'service_role', 'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE') then
    raise exception 'service_role must be able to resolve a verified Auth user';
  end if;
  if has_function_privilege(
      'authenticated', 'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE')
      or has_function_privilege(
        'anon', 'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE') then
    raise exception 'browser roles must not resolve trusted multiplayer identity';
  end if;
  select pg_get_functiondef(
    'public.trusted_resolve_multiplayer_player(uuid)'::regprocedure)
    into function_definition;
  if function_definition not like '%auth.role() <> ''service_role''%'
      or function_definition not like '%public.player_auth_owners%'
      or function_definition not like '%player.lifecycle = ''active''%' then
    raise exception 'trusted resolver is missing its role, ownership, or lifecycle guard';
  end if;
end;
$$;

select
  has_function_privilege(
    'service_role', 'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE')
    as service_can_resolve,
  not has_function_privilege(
    'authenticated', 'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE')
    as browser_cannot_resolve,
  not has_function_privilege(
    'anon', 'public.trusted_resolve_multiplayer_player(uuid)', 'EXECUTE')
    as anonymous_cannot_resolve;

rollback;
