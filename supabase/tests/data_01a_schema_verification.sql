-- DATA-01A read-only catalog verification. Run after the migration as an admin.
-- This script creates no test users or application data.
do $$
declare
  missing_tables text[];
  rls_disabled text[];
begin
  select array_agg(expected.name order by expected.name) into missing_tables
  from unnest(array[
    'players','player_auth_owners','player_progression','player_piece_statistics',
    'player_ratings','local_profile_bootstraps','player_migration_intents'
  ]) expected(name)
  where to_regclass('public.' || expected.name) is null;
  if missing_tables is not null then
    raise exception 'Missing DATA-01A tables: %', missing_tables;
  end if;

  select array_agg(c.relname order by c.relname) into rls_disabled
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname=any(array[
      'players','player_auth_owners','player_progression','player_piece_statistics',
      'player_ratings','local_profile_bootstraps','player_migration_intents'
    ]) and not c.relrowsecurity;
  if rls_disabled is not null then
    raise exception 'RLS disabled on: %', rls_disabled;
  end if;

  if (select column_default from information_schema.columns
      where table_schema='public' and table_name='player_ratings'
        and column_name='multiplayer_rating') <> '1000' then
    raise exception 'player_ratings.multiplayer_rating default is not 1000';
  end if;

  if has_table_privilege('authenticated','public.player_ratings','UPDATE')
      or has_table_privilege('authenticated','public.player_auth_owners','INSERT')
      or has_table_privilege('authenticated','public.player_auth_owners','UPDATE')
      or has_table_privilege('authenticated','public.players','UPDATE') then
    raise exception 'Browser role has a forbidden direct mutation grant';
  end if;

  if not has_function_privilege('authenticated','public.rename_current_player(text)','EXECUTE')
      or not has_function_privilege('authenticated','public.bootstrap_local_profile(jsonb)','EXECUTE')
      or not has_function_privilege('authenticated','public.create_guest_upgrade_intent()','EXECUTE')
      or not has_function_privilege('authenticated','public.inspect_profile_conflict(text)','EXECUTE')
      or not has_function_privilege('authenticated','public.resolve_profile_conflict(text,public.profile_conflict_resolution)','EXECUTE') then
    raise exception 'Expected authenticated RPC grant is missing';
  end if;

  if has_function_privilege('anon','public.rename_current_player(text)','EXECUTE')
      or has_function_privilege('anon','public.bootstrap_local_profile(jsonb)','EXECUTE')
      or has_function_privilege('anon','public.resolve_profile_conflict(text,public.profile_conflict_resolution)','EXECUTE') then
    raise exception 'Unauthenticated anon role can execute a protected RPC';
  end if;

  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='auth' and c.relname='users'
      and t.tgname='roulettechess_on_auth_user_created' and not t.tgisinternal
  ) then raise exception 'RouletteChess auth-user trigger is missing'; end if;

  if exists (
    select 1 from auth.users u left join public.player_auth_owners o on o.auth_user_id=u.id
    where o.auth_user_id is null
  ) then raise exception 'At least one existing auth user was not backfilled'; end if;
end;
$$;

-- Human-readable audit inventory returned after assertions pass.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname like 'player%'
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename in (
  'players','player_auth_owners','player_progression','player_piece_statistics',
  'player_ratings','local_profile_bootstraps','player_migration_intents'
)
order by tablename, policyname;

select routine_schema, routine_name, security_type, data_type
from information_schema.routines
where (routine_schema='public' and routine_name in (
  'rename_current_player','bootstrap_local_profile','create_guest_upgrade_intent',
  'inspect_profile_conflict','resolve_profile_conflict'
)) or (routine_schema='private' and routine_name in (
  'current_player_id','ensure_player_for_auth_user','handle_roulettechess_auth_user_created'
))
order by routine_schema, routine_name;
