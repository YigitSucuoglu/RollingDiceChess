-- Run only AFTER migration 202609010011. All fixture writes roll back.
begin;

create temporary table ui02_results(name text primary key, passed boolean not null) on commit drop;
create temporary table ui02_before as
select count(*)::bigint as unlock_count from private.player_achievement_unlocks;

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
  confirmation_token,email_change,email_change_token_new,recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  'f5020000-0000-4000-8000-000000000001',
  'authenticated','authenticated','ui02-piece-mastery@example.invalid','',now(),
  '{"provider":"google","providers":["google"]}'::jsonb,'{}',now(),now(),'','','',''
);

create temporary table ui02_player on commit drop as
select owner.player_id from public.player_auth_owners owner
where owner.auth_user_id='f5020000-0000-4000-8000-000000000001';

update public.player_piece_statistics statistic set moves=case statistic.piece_type
  when 'pawn' then 499 when 'knight' then 250 when 'king' then 100 else 0 end
where statistic.player_id=(select player_id from ui02_player);

do $$ declare target_player uuid:=(select player_id from ui02_player);
begin
  perform private.evaluate_and_persist_career_achievements(
    target_player,'singleplayer','f5020000-0000-4000-8000-000000000101');
  insert into ui02_results values ('old_thresholds_do_not_unlock',not exists(
    select 1 from private.player_achievement_unlocks unlock
    where unlock.player_id=target_player and unlock.achievement_id in
      ('pawn_commander','knight_specialist','royal_maneuvers')));
end $$;

update public.player_piece_statistics statistic set moves=500
where statistic.player_id=(select player_id from ui02_player)
  and statistic.piece_type in ('pawn','knight','king');

do $$ declare target_player uuid:=(select player_id from ui02_player);
begin
  perform private.evaluate_and_persist_career_achievements(
    target_player,'singleplayer','f5020000-0000-4000-8000-000000000102');
  insert into ui02_results values ('new_500_threshold_unlocks_all_three',(
    select count(*)=3 from private.player_achievement_unlocks unlock
    where unlock.player_id=target_player and unlock.achievement_id in
      ('pawn_commander','knight_specialist','royal_maneuvers')));
  perform private.evaluate_and_persist_career_achievements(
    target_player,'singleplayer','f5020000-0000-4000-8000-000000000102');
  insert into ui02_results values ('replay_does_not_duplicate_unlocks',(
    select count(*)=3 from private.player_achievement_unlocks unlock
    where unlock.player_id=target_player and unlock.achievement_id in
      ('pawn_commander','knight_specialist','royal_maneuvers')));
  insert into ui02_results values ('canonical_player_ownership_preserved',(
    select count(*)=1 from public.player_auth_owners owner
    where owner.player_id=target_player and owner.auth_user_id='f5020000-0000-4000-8000-000000000001'));
end $$;

insert into ui02_results values
('existing_unlock_rows_untouched',(
  select count(*)=(select unlock_count from ui02_before)+3 from private.player_achievement_unlocks)),
('other_achievements_unchanged',(
  select position('if knight_moves>=500' in pg_get_functiondef(
    'private.evaluate_and_persist_career_achievements(uuid,text,uuid)'::regprocedure))>0
    and position('if king_moves>=500' in pg_get_functiondef(
    'private.evaluate_and_persist_career_achievements(uuid,text,uuid)'::regprocedure))>0
    and position('if pawn_moves>=500' in pg_get_functiondef(
    'private.evaluate_and_persist_career_achievements(uuid,text,uuid)'::regprocedure))>0));

do $$ begin
  if exists(select 1 from ui02_results where not passed) then
    raise exception 'UI-02 verification failed';
  end if;
end $$;

select name,passed from ui02_results order by name;
rollback;
