begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='player_migration_intents'
      and column_name='account_auth_user_id' and data_type='uuid'
  ) then raise exception 'DATA-01C account binding column is missing'; end if;
  if to_regprocedure('public.complete_linked_guest_upgrade(text)') is null
      or to_regprocedure('public.inspect_profile_conflict(text)') is null
      or to_regprocedure('public.resolve_profile_conflict(text,public.profile_conflict_resolution)') is null then
    raise exception 'DATA-01C RPC is missing';
  end if;
  if has_function_privilege('anon','public.complete_linked_guest_upgrade(text)','EXECUTE') then
    raise exception 'anon must not execute account migration completion';
  end if;
  if not has_function_privilege('authenticated','public.complete_linked_guest_upgrade(text)','EXECUTE') then
    raise exception 'authenticated role cannot execute account migration completion';
  end if;
  if has_table_privilege('authenticated','public.player_migration_intents','UPDATE') then
    raise exception 'browser role must not mutate migration intents directly';
  end if;
end $$;

rollback;
