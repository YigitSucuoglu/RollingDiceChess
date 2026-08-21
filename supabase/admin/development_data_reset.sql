-- ============================================================================
-- DESTRUCTIVE DEVELOPMENT/TEST DATA RESET
-- NOT A DATABASE MIGRATION
-- NOT FOR AUTOMATIC CI/DEPLOYMENT
-- DO NOT RUN AGAINST PRODUCTION USER DATA
-- ============================================================================
-- DEV-DATA-CLEANUP-01: deletes the reviewed pre-production application data.
-- It intentionally leaves auth.users for the separate supported Admin API step.

begin;

do $$
declare
  auth_total bigint;
  anonymous_total bigint;
  permanent_total bigint;
  player_total bigint;
  settlement_total bigint;
begin
  if to_regclass('public.players') is null
      or to_regclass('public.player_auth_owners') is null
      or to_regclass('private.multiplayer_lobbies') is null
      or to_regclass('private.multiplayer_matches') is null
      or to_regprocedure('public.trusted_resolve_multiplayer_player(uuid)') is null then
    raise exception 'RouletteChess schema fingerprint does not match the reviewed project';
  end if;

  select count(*), count(*) filter (where coalesce(is_anonymous, false)),
    count(*) filter (where not coalesce(is_anonymous, false))
    into auth_total, anonymous_total, permanent_total
  from auth.users;
  select count(*) into player_total from public.players;
  select count(*) into settlement_total from private.rating_settlements;

  if auth_total <> 97 or anonymous_total <> 96 or permanent_total <> 1
      or player_total <> 97 or settlement_total <> 0 then
    raise exception using
      message = 'Development reset precondition failed; rerun Phase 1 inventory and review changes',
      detail = format(
        'auth=%s anonymous=%s permanent=%s players=%s settlements=%s',
        auth_total, anonymous_total, permanent_total, player_total, settlement_total
      );
  end if;
end;
$$;

-- A. Realtime/event/runtime dependents.
delete from public.multiplayer_match_events;
delete from public.multiplayer_lobby_events;
delete from private.multiplayer_active_participants;
delete from private.multiplayer_private_join_attempts;

-- B. Match-linked rating history, then matches before their RESTRICT parent lobby.
delete from private.rating_settlements;
delete from private.multiplayer_matches;
delete from private.multiplayer_lobbies;

-- C. Progression and account-migration history. Migration intents must be gone
-- before the separate Auth Admin deletion because their Auth FKs use RESTRICT.
delete from public.player_progression_operations;
delete from public.local_profile_bootstraps;
delete from public.player_migration_intents;

-- D. Player dependents and canonical ownership.
delete from public.player_piece_statistics;
delete from public.player_progression;
delete from public.player_ratings;
delete from public.player_auth_owners;

-- E. Break the retired-player self-reference explicitly, without changing its FK.
update public.players set superseded_by = null where superseded_by is not null;
delete from public.players;

do $$
declare remaining_rows bigint;
begin
  select
    (select count(*) from public.players)
    + (select count(*) from public.player_auth_owners)
    + (select count(*) from public.player_progression)
    + (select count(*) from public.player_piece_statistics)
    + (select count(*) from public.player_ratings)
    + (select count(*) from public.player_progression_operations)
    + (select count(*) from public.local_profile_bootstraps)
    + (select count(*) from public.player_migration_intents)
    + (select count(*) from private.rating_settlements)
    + (select count(*) from private.multiplayer_active_participants)
    + (select count(*) from private.multiplayer_private_join_attempts)
    + (select count(*) from private.multiplayer_matches)
    + (select count(*) from private.multiplayer_lobbies)
    + (select count(*) from public.multiplayer_lobby_events)
    + (select count(*) from public.multiplayer_match_events)
    into remaining_rows;
  if remaining_rows <> 0 then
    raise exception 'Application reset verification failed: % rows remain', remaining_rows;
  end if;
  if (select count(*) from auth.users) <> 97 then
    raise exception 'Auth users changed during application reset; rollback required';
  end if;
end;
$$;

commit;
