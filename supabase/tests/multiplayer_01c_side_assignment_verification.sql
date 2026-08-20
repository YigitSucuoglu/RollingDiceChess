begin;

do $$
declare definition text;
begin
  select pg_get_functiondef('private.prepare_authoritative_match_transition()'::regprocedure)
    into definition;
  if definition not like '%persisted_preference = ''white''%'
      or definition not like '%persisted_preference = ''black''%'
      or definition not like '%new.white_player_id := old.player_a_id%'
      or definition not like '%new.white_player_id := old.player_b_id%' then
    raise exception 'trusted activation does not enforce persisted side preference';
  end if;
end;
$$;

select
  not has_function_privilege('authenticated',
    'private.prepare_authoritative_match_transition()', 'EXECUTE') as browser_cannot_call_transition,
  has_function_privilege('service_role',
    'public.trusted_activate_multiplayer_match(uuid,uuid,boolean,jsonb,text[])', 'EXECUTE') as service_can_activate;

rollback;
