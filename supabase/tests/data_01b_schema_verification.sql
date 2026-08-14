-- Run after 202608140001_data_01b_progression_sync.sql in the Supabase SQL Editor.
do $$
begin
  if to_regclass('public.player_progression_operations') is null then
    raise exception 'player_progression_operations is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.player_progression_operations'::regclass) then
    raise exception 'player_progression_operations RLS is disabled';
  end if;
  if to_regprocedure('public.get_current_player_profile()') is null
      or to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)') is null then
    raise exception 'DATA-01B RPCs are missing';
  end if;
  if has_table_privilege('authenticated','public.player_progression_operations','INSERT')
      or has_table_privilege('authenticated','public.player_progression_operations','UPDATE')
      or has_table_privilege('authenticated','public.player_progression_operations','DELETE') then
    raise exception 'authenticated has forbidden operation-ledger mutation privilege';
  end if;
  if not has_function_privilege('authenticated','public.get_current_player_profile()','EXECUTE')
      or not has_function_privilege('authenticated','public.apply_player_progression_operation(uuid,jsonb)','EXECUTE') then
    raise exception 'authenticated lacks DATA-01B RPC execution';
  end if;
  if has_function_privilege('anon','public.apply_player_progression_operation(uuid,jsonb)','EXECUTE') then
    raise exception 'anon has forbidden progression RPC execution';
  end if;
end;
$$;
