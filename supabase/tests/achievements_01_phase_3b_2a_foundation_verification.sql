-- Run after 202609010005_achievements_01_phase_3b_2a_foundation.sql.
-- Transactional fixtures and all unlock writes are rolled back.
begin;

create temporary table achievement_test_state (
  name text primary key,
  passed boolean not null
) on commit drop;
create temporary table achievement_rpc_results (
  name text primary key,
  payload jsonb not null
) on commit drop;
grant insert,select on achievement_test_state to anon,authenticated;
grant insert,select on achievement_rpc_results to authenticated;

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values
  ('00000000-0000-0000-0000-000000000000','f3b20000-0000-4000-8000-000000000001',
   'authenticated','authenticated','achievement-a@example.invalid','',now(),
   '{"provider":"google","providers":["google"]}'::jsonb,'{}'::jsonb,now(),now(),'','','',''),
  ('00000000-0000-0000-0000-000000000000','f3b20000-0000-4000-8000-000000000002',
   'authenticated','authenticated','achievement-b@example.invalid','',now(),
   '{"provider":"google","providers":["google"]}'::jsonb,'{}'::jsonb,now(),now(),'','','','');

create temporary table achievement_players on commit drop as
select owner.auth_user_id,owner.player_id
from public.player_auth_owners owner
where owner.auth_user_id in (
  'f3b20000-0000-4000-8000-000000000001',
  'f3b20000-0000-4000-8000-000000000002'
);

do $$
declare player_a uuid; player_b uuid; source_a uuid:='f3b20000-0000-4000-8000-000000000101';
  first_insert boolean; duplicate_insert boolean; same_source_insert boolean;
begin
  select player_id into player_a from achievement_players
    where auth_user_id='f3b20000-0000-4000-8000-000000000001';
  select player_id into player_b from achievement_players
    where auth_user_id='f3b20000-0000-4000-8000-000000000002';
  if player_a is null or player_b is null then
    raise exception 'achievement auth fixtures did not receive canonical players';
  end if;

  first_insert:=private.persist_player_achievement_unlock(
    player_a,'rookie_campaign','singleplayer-operation',source_a,1
  );
  perform pg_sleep(0.01);
  duplicate_insert:=private.persist_player_achievement_unlock(
    player_a,'rookie_campaign','retroactive-career',
    'f3b20000-0000-4000-8000-000000000102',2
  );
  same_source_insert:=private.persist_player_achievement_unlock(
    player_a,'hundred_games','singleplayer-operation',source_a,1
  );
  perform private.persist_player_achievement_unlock(
    player_b,'rookie_campaign','retroactive-career',
    'f3b20000-0000-4000-8000-000000000103',1
  );
  perform private.persist_player_achievement_unlock(
    player_b,'king_hunter','multiplayer-settlement',
    'f3b20000-0000-4000-8000-000000000104',1
  );

  insert into achievement_test_state values
    ('first_insert',first_insert),
    ('duplicate_is_noop',not duplicate_insert),
    ('same_source_multiple_unlocks',same_source_insert),
    ('different_players_same_achievement',(
      select count(*)=2 from private.player_achievement_unlocks
      where achievement_id='rookie_campaign' and player_id in (player_a,player_b)
    )),
    ('first_metadata_preserved',(
      select source_type='singleplayer-operation' and source_id=source_a
        and catalog_version=1
      from private.player_achievement_unlocks
      where player_id=player_a and achievement_id='rookie_campaign'
    ));

  begin
    perform private.persist_player_achievement_unlock(
      player_a,'invented_achievement','retroactive-career',gen_random_uuid(),1
    );
    insert into achievement_test_state values ('invalid_id_rejected',false);
  exception when check_violation then
    insert into achievement_test_state values ('invalid_id_rejected',true);
  end;
  begin
    perform private.persist_player_achievement_unlock(
      player_a,'king_hunter','invalid-source',gen_random_uuid(),1
    );
    insert into achievement_test_state values ('invalid_source_rejected',false);
  exception when check_violation then
    insert into achievement_test_state values ('invalid_source_rejected',true);
  end;
  begin
    perform private.persist_player_achievement_unlock(
      player_a,'king_hunter','retroactive-career',gen_random_uuid(),0
    );
    insert into achievement_test_state values ('invalid_version_rejected',false);
  exception when check_violation then
    insert into achievement_test_state values ('invalid_version_rejected',true);
  end;
end;
$$;

-- Authenticated current-player read exercises auth.uid(), canonical ownership and
-- the SECURITY DEFINER RPC without granting direct private-table access.
select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f3b20000-0000-4000-8000-000000000001','role','authenticated'
)::text,true);
set local role authenticated;
insert into achievement_rpc_results(name,payload)
values ('before-survivor',public.get_current_player_achievements());
do $$
begin
  begin
    perform 1 from private.player_achievement_unlocks limit 1;
    insert into achievement_test_state values ('authenticated_table_read_denied',false);
  exception when insufficient_privilege then
    insert into achievement_test_state values ('authenticated_table_read_denied',true);
  end;
  begin
    insert into private.player_achievement_unlocks(
      player_id,achievement_id,source_type,source_id,catalog_version
    ) values (gen_random_uuid(),'rookie_campaign','retroactive-career',gen_random_uuid(),1);
    insert into achievement_test_state values ('authenticated_table_write_denied',false);
  exception when insufficient_privilege then
    insert into achievement_test_state values ('authenticated_table_write_denied',true);
  end;
  begin
    perform private.persist_player_achievement_unlock(
      gen_random_uuid(),'rookie_campaign','retroactive-career',gen_random_uuid(),1
    );
    insert into achievement_test_state values ('authenticated_helper_denied',false);
  exception when insufficient_privilege then
    insert into achievement_test_state values ('authenticated_helper_denied',true);
  end;
end;
$$;
reset role;

set local role anon;
do $$
begin
  begin
    perform 1 from private.player_achievement_unlocks limit 1;
    insert into achievement_test_state values ('anonymous_table_read_denied',false);
  exception when insufficient_privilege then
    insert into achievement_test_state values ('anonymous_table_read_denied',true);
  end;
end;
$$;
reset role;

-- Simulate the existing survivor rule without merging data: player B survives and
-- the authenticated owner moves from retired player A to active player B.
delete from public.player_auth_owners
where auth_user_id='f3b20000-0000-4000-8000-000000000002';
update public.players retired set lifecycle='retired',superseded_by=survivor.player_id
from achievement_players survivor
where retired.player_id=(select player_id from achievement_players
    where auth_user_id='f3b20000-0000-4000-8000-000000000001')
  and survivor.auth_user_id='f3b20000-0000-4000-8000-000000000002';
update public.player_auth_owners owner set player_id=survivor.player_id
from achievement_players survivor
where owner.auth_user_id='f3b20000-0000-4000-8000-000000000001'
  and survivor.auth_user_id='f3b20000-0000-4000-8000-000000000002';

select set_config('request.jwt.claims',jsonb_build_object(
  'sub','f3b20000-0000-4000-8000-000000000001','role','authenticated'
)::text,true);
set local role authenticated;
insert into achievement_rpc_results(name,payload)
values ('after-survivor',public.get_current_player_achievements());
reset role;

select
  (select bool_and(passed) from achievement_test_state) as behavioral_checks_pass,
  (select count(*)=12 from achievement_test_state) as behavioral_check_count_correct,
  (select payload->>'catalogVersion'='1' and payload->>'unlockedCount'='2'
      and jsonb_array_length(payload->'unlocks')=2
      and payload->'unlocks'->0->>'achievementId'='hundred_games'
      and payload->'unlocks'->1->>'achievementId'='rookie_campaign'
      and (payload->'unlocks'->0->>'unlockedAt')::timestamptz is not null
    from achievement_rpc_results where name='before-survivor') as current_player_read_correct,
  (select payload->>'unlockedCount'='2'
      and payload->'unlocks'->0->>'achievementId'='king_hunter'
      and payload->'unlocks'->1->>'achievementId'='rookie_campaign'
      and payload::text not like '%hundred_games%'
    from achievement_rpc_results where name='after-survivor') as survivor_isolation_correct,
  not has_table_privilege('anon','private.player_achievement_unlocks','SELECT,INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated','private.player_achievement_unlocks','SELECT,INSERT,UPDATE,DELETE')
    as browser_table_access_denied,
  not has_function_privilege('anon','public.get_current_player_achievements()','EXECUTE')
    and has_function_privilege('authenticated','public.get_current_player_achievements()','EXECUTE')
    and not has_function_privilege(
      'authenticated',
      'private.persist_player_achievement_unlock(uuid,text,text,uuid,integer)',
      'EXECUTE'
    ) as function_grants_correct,
  pg_get_functiondef('public.get_current_player_achievements()'::regprocedure)
      ~ 'private\.current_player_id\(\)'
    and pg_get_functiondef('public.get_current_player_achievements()'::regprocedure)
      ~ 'player\.lifecycle\s*=\s*''active''(?:::([a-zA-Z_][a-zA-Z0-9_]*\.)?[a-zA-Z_][a-zA-Z0-9_]*)?'
    and not exists (
      select 1 from achievement_rpc_results result,
        lateral jsonb_object_keys(result.payload) key
      where key not in ('catalogVersion','unlockedCount','unlocks')
    )
    and not exists (
      select 1 from achievement_rpc_results result,
        lateral jsonb_array_elements(result.payload->'unlocks') unlock,
        lateral jsonb_object_keys(unlock) key
      where key not in ('achievementId','unlockedAt')
    )
    as minimal_read_contract_correct,
  exists(select 1 from pg_constraint where conrelid=
      'private.player_achievement_unlocks'::regclass and contype='p')
    and exists(select 1 from pg_constraint where conrelid=
      'private.player_achievement_unlocks'::regclass and contype='f')
    and exists(select 1 from pg_indexes where schemaname='private'
      and tablename='player_achievement_unlocks'
      and indexname='player_achievement_unlocks_source_lookup')
    as schema_constraints_and_index_present;

rollback;
