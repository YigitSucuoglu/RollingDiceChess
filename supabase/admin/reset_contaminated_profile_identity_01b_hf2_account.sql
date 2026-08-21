-- ============================================================================
-- DESTRUCTIVE TARGETED DEVELOPMENT ACCOUNT RESET
-- NOT A MIGRATION. DO NOT RUN FROM CI OR APPLICATION CODE.
-- PROFILE-IDENTITY-01B-HF2 stale-browser acceptance preparation.
-- ============================================================================
-- Deletes only the verified contaminated canonical PlayerId and its dependent
-- application/runtime rows. The matching auth.users row is intentionally left
-- for the supported Admin API step.

begin;

create temporary table target_hf2_account on commit drop as
select
  player.player_id,
  owner.auth_user_id
from public.players player
join public.player_auth_owners owner using (player_id)
join public.player_progression progression using (player_id)
join auth.users auth_user on auth_user.id = owner.auth_user_id
where player.public_discriminator = '9Z7VG'
  and player.display_name = 'Yigit'
  and player.ownership_kind = 'account'
  and player.lifecycle = 'active'
  and player.superseded_by is null
  and not coalesce(auth_user.is_anonymous, false)
  and encode(
    substring(extensions.digest(auth_user.id::text, 'sha256') from 1 for 6),
    'hex'
  ) = '0e392ad07ae9'
  and progression.total_xp = 208
  and progression.games_played = 3
  and exists (
    select 1
    from public.local_profile_bootstraps bootstrap
    where bootstrap.player_id = player.player_id
      and bootstrap.source_profile_id <> player.player_id::text
  );

do $$
declare target_count integer;
begin
  select count(*) into target_count from target_hf2_account;
  if target_count <> 1 then
    raise exception using
      message = 'Targeted HF2 reset precondition failed; transaction rolled back',
      detail = format('expected exactly one verified contaminated account, found %s', target_count);
  end if;
  if exists (
    select 1 from public.players other
    where other.superseded_by = (select player_id from target_hf2_account)
  ) then
    raise exception 'Target has dependent replacement history; review before deletion';
  end if;
end;
$$;

create temporary table target_hf2_lobbies on commit drop as
select lobby.lobby_id
from private.multiplayer_lobbies lobby
where lobby.host_player_id = (select player_id from target_hf2_account)
   or lobby.opponent_player_id = (select player_id from target_hf2_account)
union
select membership.lobby_id
from private.multiplayer_active_participants membership
where membership.player_id = (select player_id from target_hf2_account)
  and membership.lobby_id is not null;

create temporary table target_hf2_matches on commit drop as
select match.match_id, match.lobby_id
from private.multiplayer_matches match
where match.player_a_id = (select player_id from target_hf2_account)
   or match.player_b_id = (select player_id from target_hf2_account)
   or match.white_player_id = (select player_id from target_hf2_account)
   or match.black_player_id = (select player_id from target_hf2_account)
   or match.winner_player_id = (select player_id from target_hf2_account)
   or match.lobby_id in (select lobby_id from target_hf2_lobbies);

insert into target_hf2_lobbies(lobby_id)
select match.lobby_id from target_hf2_matches match
on conflict do nothing;

-- Runtime/event dependents.
delete from public.multiplayer_match_events event
where event.match_id in (select match_id from target_hf2_matches);

delete from public.multiplayer_lobby_events event
where event.recipient_player_id = (select player_id from target_hf2_account)
   or event.lobby_id in (select lobby_id from target_hf2_lobbies);

delete from private.multiplayer_active_participants membership
where membership.player_id = (select player_id from target_hf2_account)
   or membership.match_id in (select match_id from target_hf2_matches)
   or membership.lobby_id in (select lobby_id from target_hf2_lobbies);

delete from private.multiplayer_private_join_attempts attempt
where attempt.auth_user_id = (select auth_user_id from target_hf2_account);

delete from private.rating_settlements settlement
where settlement.player_a_id = (select player_id from target_hf2_account)
   or settlement.player_b_id = (select player_id from target_hf2_account)
   or settlement.winner_id = (select player_id from target_hf2_account)
   or settlement.match_id in (select match_id from target_hf2_matches);

delete from private.multiplayer_matches match
where match.match_id in (select match_id from target_hf2_matches);

delete from private.multiplayer_lobbies lobby
where lobby.lobby_id in (select lobby_id from target_hf2_lobbies);

-- Migration and progression dependents.
delete from public.player_migration_intents intent
where intent.guest_player_id = (select player_id from target_hf2_account)
   or intent.surviving_player_id = (select player_id from target_hf2_account)
   or intent.guest_auth_user_id = (select auth_user_id from target_hf2_account)
   or intent.account_auth_user_id = (select auth_user_id from target_hf2_account);

delete from public.player_progression_operations operation
where operation.player_id = (select player_id from target_hf2_account);

delete from public.local_profile_bootstraps bootstrap
where bootstrap.player_id = (select player_id from target_hf2_account);

delete from public.player_piece_statistics stats
where stats.player_id = (select player_id from target_hf2_account);

delete from public.player_progression progression
where progression.player_id = (select player_id from target_hf2_account);

delete from public.player_ratings rating
where rating.player_id = (select player_id from target_hf2_account);

delete from public.player_auth_owners owner
where owner.player_id = (select player_id from target_hf2_account)
  and owner.auth_user_id = (select auth_user_id from target_hf2_account);

delete from public.players player
where player.player_id = (select player_id from target_hf2_account);

do $$
begin
  if exists (
    select 1 from public.players where public_discriminator = '9Z7VG'
  ) then
    raise exception 'Target PlayerId still exists; transaction rolled back';
  end if;
  if not exists (
    select 1 from auth.users auth_user
    where encode(
      substring(extensions.digest(auth_user.id::text, 'sha256') from 1 for 6),
      'hex'
    ) = '0e392ad07ae9'
  ) then
    raise exception 'Auth user changed during SQL phase; transaction rolled back';
  end if;
end;
$$;

commit;

-- Expected result after this SQL phase: one row, application_rows_remaining=0.
select
  encode(substring(extensions.digest(auth_user.id::text, 'sha256') from 1 for 6), 'hex')
    as auth_fingerprint,
  (
    select count(*) from public.player_auth_owners owner
    where owner.auth_user_id = auth_user.id
  ) + (
    select count(*) from private.multiplayer_private_join_attempts attempt
    where attempt.auth_user_id = auth_user.id
  ) + (
    select count(*) from public.player_migration_intents intent
    where intent.guest_auth_user_id = auth_user.id
       or intent.account_auth_user_id = auth_user.id
  ) as application_rows_remaining
from auth.users auth_user
where encode(
  substring(extensions.digest(auth_user.id::text, 'sha256') from 1 for 6),
  'hex'
) = '0e392ad07ae9';

