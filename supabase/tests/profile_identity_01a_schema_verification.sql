begin;

do $$
declare
  original_id uuid := gen_random_uuid();
  generated_id uuid := gen_random_uuid();
  allocated text;
  generated_discriminator text;
  rename_definition text;
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='players'
        and column_name='public_discriminator' and is_nullable='NO') then
    raise exception 'public_discriminator NOT NULL column is missing';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='players'
        and column_name='username_onboarding_required' and is_nullable='NO') then
    raise exception 'username onboarding state is missing';
  end if;
  if exists (select 1 from public.players where public_discriminator !~ '^[A-Z0-9]{5}$') then
    raise exception 'invalid discriminator exists';
  end if;
  if exists (select public_discriminator from public.players group by public_discriminator having count(*)>1) then
    raise exception 'duplicate discriminator exists';
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.players'::regclass
      and conname='players_public_discriminator_unique' and contype='u') then
    raise exception 'discriminator UNIQUE constraint is missing';
  end if;
  if exists (select 1 from pg_constraint where conrelid='public.players'::regclass
      and contype='u' and pg_get_constraintdef(oid) ilike '%display_name%') then
    raise exception 'display_name must remain non-unique';
  end if;
  if has_table_privilege('authenticated','public.players','UPDATE') then
    raise exception 'browser must not update player identity directly';
  end if;
  if not has_function_privilege('authenticated','public.rename_current_player(text)','EXECUTE') then
    raise exception 'account rename RPC is unavailable';
  end if;
  if has_function_privilege('authenticated','private.allocate_public_discriminator(text[])','EXECUTE') then
    raise exception 'browser can execute discriminator allocator';
  end if;
  select pg_get_functiondef('public.rename_current_player(text)'::regprocedure)
    into rename_definition;
  if rename_definition not like '%ownership_kind=''account''%'
      or rename_definition not like '%^Guest[0-9]{4}$%'
      or rename_definition not like '%auth.uid()%' then
    raise exception 'rename RPC account/Guest/ownership policy is incomplete';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid='public.players'::regclass
      and tgname='roulettechess_enforce_player_public_identity' and not tgisinternal) then
    raise exception 'player public identity trigger is missing';
  end if;

  insert into public.players(player_id,display_name,ownership_kind,public_discriminator)
    values(original_id,'Collision Fixture','guest','ABCDE');
  insert into public.players(player_id,display_name,ownership_kind)
    values(generated_id,'Collision Fixture','guest')
    returning public_discriminator into generated_discriminator;
  if generated_discriminator !~ '^[A-Z0-9]{5}$' then
    raise exception 'new player trigger did not allocate a discriminator';
  end if;
  allocated := private.allocate_public_discriminator(array['ABCDE','FGHIJ']);
  if allocated <> 'FGHIJ' then raise exception 'forced collision did not retry'; end if;
  begin
    update public.players set public_discriminator='ZZZZZ' where player_id=original_id;
    raise exception 'discriminator mutation unexpectedly succeeded';
  exception when check_violation then null;
  end;
end $$;

select
  count(*) as player_count,
  count(distinct public_discriminator) as distinct_discriminators,
  count(*) filter (where username_onboarding_required) as onboarding_required
from public.players;

rollback;
