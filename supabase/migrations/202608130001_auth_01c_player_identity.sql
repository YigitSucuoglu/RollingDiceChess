-- AUTH-01C: provider-independent player identity and ownership foundation.
-- Deployment status in this repository: NOT APPLIED. Apply through Supabase CLI/dashboard review.
-- This migration is transactional and intended to run exactly once through migration history.
begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create type public.player_lifecycle as enum ('active', 'retired');
create type public.player_ownership_kind as enum ('guest', 'account');
create type public.profile_conflict_resolution as enum ('USE_GOOGLE_PROFILE', 'USE_GUEST_PROFILE');

create table public.players (
  player_id uuid primary key default gen_random_uuid(),
  display_name text not null check (
    char_length(btrim(display_name)) between 2 and 24
    and display_name !~ '[<>/\\]'
    and display_name !~ '[[:cntrl:]]'
  ),
  ownership_kind public.player_ownership_kind not null,
  lifecycle public.player_lifecycle not null default 'active',
  superseded_by uuid references public.players(player_id),
  schema_version integer not null default 1 check (schema_version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lifecycle = 'active' and superseded_by is null) or lifecycle = 'retired')
);

create table public.player_auth_owners (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  player_id uuid not null unique references public.players(player_id) on delete restrict,
  linked_at timestamptz not null default now()
);

create table public.player_progression (
  player_id uuid primary key references public.players(player_id) on delete cascade,
  total_xp bigint not null default 0 check (total_xp >= 0),
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_win_streak integer not null default 0 check (current_win_streak >= 0),
  best_win_streak integer not null default 0 check (best_win_streak >= 0),
  total_play_time_seconds bigint not null default 0 check (total_play_time_seconds >= 0),
  kings_captured integer not null default 0 check (kings_captured >= 0),
  roulette_rolls integer not null default 0 check (roulette_rolls >= 0),
  player_turns_completed integer not null default 0 check (player_turns_completed >= 0),
  three_rights_turns integer not null default 0 check (three_rights_turns >= 0),
  triple_pawn_rolls integer not null default 0 check (triple_pawn_rolls >= 0),
  triple_knight_rolls integer not null default 0 check (triple_knight_rolls >= 0),
  triple_queen_rolls integer not null default 0 check (triple_queen_rolls >= 0),
  updated_at timestamptz not null default now()
);

create table public.player_piece_statistics (
  player_id uuid not null references public.players(player_id) on delete cascade,
  piece_type text not null check (piece_type in ('pawn','knight','bishop','rook','queen','king')),
  rolls integer not null default 0 check (rolls >= 0),
  moves integer not null default 0 check (moves >= 0),
  captures integer not null default 0 check (captures >= 0),
  primary key (player_id, piece_type)
);

create table public.player_ratings (
  player_id uuid primary key references public.players(player_id) on delete cascade,
  multiplayer_rating integer not null default 1000,
  rated_games integer not null default 0 check (rated_games >= 0),
  rating_version integer not null default 1,
  rating_updated_at timestamptz not null default now()
);

create table public.local_profile_bootstraps (
  player_id uuid not null references public.players(player_id) on delete cascade,
  source_profile_id text not null,
  source_schema_version integer not null check (source_schema_version > 0),
  applied_at timestamptz not null default now(),
  primary key (player_id, source_profile_id, source_schema_version)
);

create table public.player_migration_intents (
  migration_id uuid primary key default gen_random_uuid(),
  guest_auth_user_id uuid not null references auth.users(id) on delete restrict,
  guest_player_id uuid not null references public.players(player_id) on delete restrict,
  handoff_token_hash bytea not null unique,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  resolved_at timestamptz,
  resolution public.profile_conflict_resolution,
  surviving_player_id uuid references public.players(player_id),
  created_at timestamptz not null default now(),
  check ((resolved_at is null and resolution is null and surviving_player_id is null)
      or (resolved_at is not null and resolution is not null and surviving_player_id is not null))
);

create index players_rating_lookup_idx
  on public.player_ratings (multiplayer_rating desc, player_id);
create index migration_intents_guest_idx
  on public.player_migration_intents (guest_auth_user_id, created_at desc);

create or replace function private.current_player_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select player_id from public.player_auth_owners where auth_user_id = auth.uid();
$$;

create or replace function private.ensure_player_for_auth_user(
  target_auth_user_id uuid,
  target_is_anonymous boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  existing_player_id uuid;
  new_player_id uuid := gen_random_uuid();
  generated_name text := 'Guest' || lpad((abs(hashtext(target_auth_user_id::text)) % 10000)::text, 4, '0');
  owner_kind public.player_ownership_kind := case when coalesce(target_is_anonymous, false) then 'guest' else 'account' end;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_auth_user_id::text, 0));
  select player_id into existing_player_id
    from public.player_auth_owners where auth_user_id=target_auth_user_id for update;
  if existing_player_id is not null then return existing_player_id; end if;
  insert into public.players(player_id, display_name, ownership_kind)
    values (new_player_id, generated_name, owner_kind);
  insert into public.player_auth_owners(auth_user_id, player_id) values (target_auth_user_id, new_player_id);
  insert into public.player_progression(player_id) values (new_player_id);
  insert into public.player_ratings(player_id) values (new_player_id);
  insert into public.player_piece_statistics(player_id, piece_type)
    select new_player_id, piece_type from unnest(array['pawn','knight','bishop','rook','queen','king']) piece_type;
  return new_player_id;
end;
$$;

create or replace function private.handle_roulettechess_auth_user_created()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_player_for_auth_user(new.id, coalesce(new.is_anonymous, false));
  return new;
end;
$$;

create trigger roulettechess_on_auth_user_created
after insert on auth.users for each row execute function private.handle_roulettechess_auth_user_created();

-- Backfill users who authenticated before this application schema existed.
do $$
declare existing_auth_user record;
begin
  for existing_auth_user in select id, is_anonymous from auth.users loop
    perform private.ensure_player_for_auth_user(
      existing_auth_user.id,
      coalesce(existing_auth_user.is_anonymous, false)
    );
  end loop;
end;
$$;

create or replace function public.rename_current_player(requested_name text)
returns public.players language plpgsql security definer set search_path = '' as $$
declare result public.players;
begin
  if char_length(btrim(requested_name)) not between 2 and 24
      or requested_name ~ '[<>/\\]' or requested_name ~ '[[:cntrl:]]' then
    raise exception 'invalid display name' using errcode = '22023';
  end if;
  update public.players set display_name = regexp_replace(btrim(requested_name), '\s+', ' ', 'g'), updated_at = now()
    where player_id = private.current_player_id() and lifecycle = 'active' returning * into result;
  if result.player_id is null then raise exception 'active player not found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.bootstrap_local_profile(source_profile jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target uuid := private.current_player_id();
  input_source_profile_id text := source_profile->>'playerId';
  input_source_schema_version integer := (source_profile->>'schemaVersion')::integer;
  source_display_name text := source_profile->>'displayName';
  source_stats jsonb := source_profile->'statistics';
  piece_name text;
begin
  if target is null then raise exception 'player not found' using errcode = 'P0002'; end if;
  if input_source_profile_id is null or char_length(input_source_profile_id) not between 1 and 128
      or input_source_schema_version <> 1
      or char_length(btrim(source_display_name)) not between 2 and 24
      or source_display_name ~ '[<>/\\]' or source_display_name ~ '[[:cntrl:]]'
      or jsonb_typeof(source_stats) <> 'object' then
    raise exception 'invalid local profile payload' using errcode = '22023';
  end if;
  perform 1 from public.player_progression where player_id=target for update;
  if exists (
    select 1 from public.player_progression where player_id=target
      and (total_xp<>0 or games_played<>0 or wins<>0 or losses<>0
        or current_win_streak<>0 or best_win_streak<>0 or total_play_time_seconds<>0
        or kings_captured<>0 or roulette_rolls<>0 or player_turns_completed<>0
        or three_rights_turns<>0 or triple_pawn_rolls<>0
        or triple_knight_rolls<>0 or triple_queen_rolls<>0)
  ) or exists (
    select 1 from public.player_piece_statistics where player_id=target
      and (rolls<>0 or moves<>0 or captures<>0)
  ) then
    if exists (select 1 from public.local_profile_bootstraps
      where player_id=target and source_profile_id=input_source_profile_id
        and source_schema_version=input_source_schema_version)
    then return target; end if;
    raise exception 'cloud profile is not empty; explicit migration decision required' using errcode='23505';
  end if;
  insert into public.local_profile_bootstraps(player_id, source_profile_id, source_schema_version)
    values (target, input_source_profile_id, input_source_schema_version) on conflict do nothing;
  if not found then return target; end if;
  if (source_profile->>'totalXp')::bigint < 0
      or (source_stats->>'gamesPlayed')::integer < 0
      or (source_stats->>'wins')::integer < 0
      or (source_stats->>'losses')::integer < 0 then
    raise exception 'invalid progression' using errcode = '22023';
  end if;
  update public.player_progression set
    total_xp=(source_profile->>'totalXp')::bigint,
    games_played=(source_stats->>'gamesPlayed')::integer,
    wins=(source_stats->>'wins')::integer,
    losses=(source_stats->>'losses')::integer,
    current_win_streak=(source_stats->>'currentWinStreak')::integer,
    best_win_streak=(source_stats->>'bestWinStreak')::integer,
    total_play_time_seconds=(source_stats->>'totalPlayTimeSeconds')::bigint,
    kings_captured=(source_stats->>'kingsCaptured')::integer,
    roulette_rolls=(source_stats->>'rouletteRolls')::integer,
    player_turns_completed=(source_stats->>'playerTurnsCompleted')::integer,
    three_rights_turns=(source_stats->>'threeRightsTurns')::integer,
    triple_pawn_rolls=(source_stats->>'triplePawnRolls')::integer,
    triple_knight_rolls=(source_stats->>'tripleKnightRolls')::integer,
    triple_queen_rolls=(source_stats->>'tripleQueenRolls')::integer,
    updated_at=now()
    where player_id=target;
  foreach piece_name in array array['pawn','knight','bishop','rook','queen','king'] loop
    update public.player_piece_statistics set
      rolls=(source_stats->'rollsByPiece'->>piece_name)::integer,
      moves=(source_stats->'movesByPiece'->>piece_name)::integer,
      captures=(source_stats->'capturesByPiece'->>piece_name)::integer
      where player_id=target and piece_type=piece_name;
  end loop;
  update public.players set
    display_name=regexp_replace(btrim(source_display_name), '\s+', ' ', 'g'), updated_at=now()
    where player_id=target;
  return target;
end;
$$;

create or replace function public.create_guest_upgrade_intent()
returns table(migration_id uuid, handoff_token text) language plpgsql security definer set search_path = '' as $$
declare raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'guest session required' using errcode = '42501';
  end if;
  return query insert into public.player_migration_intents(guest_auth_user_id, guest_player_id, handoff_token_hash)
    values (auth.uid(), private.current_player_id(), extensions.digest(raw_token, 'sha256'))
    returning player_migration_intents.migration_id, raw_token;
end;
$$;

create or replace function public.resolve_profile_conflict(
  handoff_token text, requested_resolution public.profile_conflict_resolution
) returns uuid language plpgsql security definer set search_path = '' as $$
declare intent public.player_migration_intents; google_player uuid; survivor uuid;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'account session required' using errcode='42501';
  end if;
  select * into intent from public.player_migration_intents
    where handoff_token_hash=extensions.digest(handoff_token,'sha256') for update;
  if intent.migration_id is null then raise exception 'invalid migration' using errcode='42501'; end if;
  if intent.resolved_at is not null then
    if intent.resolution <> requested_resolution then raise exception 'migration already resolved differently' using errcode='23505'; end if;
    return intent.surviving_player_id;
  end if;
  if intent.expires_at < now() then raise exception 'expired migration' using errcode='42501'; end if;
  if not exists (select 1 from public.player_auth_owners
      where auth_user_id=intent.guest_auth_user_id and player_id=intent.guest_player_id for update) then
    raise exception 'guest ownership no longer active' using errcode='42501';
  end if;
  select player_id into google_player from public.player_auth_owners where auth_user_id=auth.uid() for update;
  if google_player is null then raise exception 'account player not found' using errcode='P0002'; end if;
  if google_player=intent.guest_player_id then raise exception 'profiles are already linked' using errcode='22023'; end if;
  if requested_resolution='USE_GOOGLE_PROFILE' then
    survivor := google_player;
    update public.players set lifecycle='retired', superseded_by=survivor, updated_at=now() where player_id=intent.guest_player_id;
    delete from public.player_auth_owners where auth_user_id=intent.guest_auth_user_id;
  else
    survivor := intent.guest_player_id;
    update public.players set lifecycle='retired', superseded_by=survivor, updated_at=now() where player_id=google_player;
    delete from public.player_auth_owners where auth_user_id in (intent.guest_auth_user_id, auth.uid());
    insert into public.player_auth_owners(auth_user_id, player_id) values(auth.uid(), survivor);
    update public.players set ownership_kind='account', updated_at=now() where player_id=survivor;
  end if;
  update public.player_migration_intents set resolved_at=now(), resolution=requested_resolution,
    surviving_player_id=survivor where migration_id=intent.migration_id;
  return survivor;
end;
$$;

create or replace function public.inspect_profile_conflict(handoff_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare intent public.player_migration_intents; google_player uuid;
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is true then
    raise exception 'account session required' using errcode='42501';
  end if;
  select * into intent from public.player_migration_intents
    where handoff_token_hash=extensions.digest(handoff_token,'sha256');
  if intent.migration_id is null or intent.expires_at < now() then
    raise exception 'invalid or expired migration' using errcode='42501';
  end if;
  select player_id into google_player from public.player_auth_owners where auth_user_id=auth.uid();
  return jsonb_build_object(
    'status','profile-conflict','conflictId',intent.migration_id,
    'guest',(select jsonb_build_object('playerId',p.player_id,'displayName',p.display_name,
      'totalXp',g.total_xp,'multiplayerRating',r.multiplayer_rating)
      from public.players p join public.player_progression g using(player_id)
      join public.player_ratings r using(player_id) where p.player_id=intent.guest_player_id),
    'google',(select jsonb_build_object('playerId',p.player_id,'displayName',p.display_name,
      'totalXp',g.total_xp,'multiplayerRating',r.multiplayer_rating)
      from public.players p join public.player_progression g using(player_id)
      join public.player_ratings r using(player_id) where p.player_id=google_player)
  );
end;
$$;

alter table public.players enable row level security;
alter table public.player_auth_owners enable row level security;
alter table public.player_progression enable row level security;
alter table public.player_piece_statistics enable row level security;
alter table public.player_ratings enable row level security;
alter table public.local_profile_bootstraps enable row level security;
alter table public.player_migration_intents enable row level security;

create policy own_player_read on public.players for select to authenticated
  using (player_id in (select player_id from public.player_auth_owners where auth_user_id=(select auth.uid())));
create policy own_owner_read on public.player_auth_owners for select to authenticated
  using (auth_user_id=auth.uid());
create policy own_progression_read on public.player_progression for select to authenticated
  using (player_id in (select player_id from public.player_auth_owners where auth_user_id=(select auth.uid())));
create policy own_piece_stats_read on public.player_piece_statistics for select to authenticated
  using (player_id in (select player_id from public.player_auth_owners where auth_user_id=(select auth.uid())));
create policy own_rating_read on public.player_ratings for select to authenticated
  using (player_id in (select player_id from public.player_auth_owners where auth_user_id=(select auth.uid())));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.players, public.player_auth_owners, public.player_progression,
  public.player_piece_statistics, public.player_ratings to authenticated;
revoke all on function private.current_player_id() from public, anon, authenticated;
revoke all on function private.ensure_player_for_auth_user(uuid,boolean) from public, anon, authenticated;
revoke all on function private.handle_roulettechess_auth_user_created() from public, anon, authenticated;
revoke all on function public.rename_current_player(text) from public, anon, authenticated;
revoke all on function public.bootstrap_local_profile(jsonb) from public, anon, authenticated;
revoke all on function public.create_guest_upgrade_intent() from public, anon, authenticated;
revoke all on function public.resolve_profile_conflict(text, public.profile_conflict_resolution) from public, anon, authenticated;
revoke all on function public.inspect_profile_conflict(text) from public, anon, authenticated;
grant execute on function public.rename_current_player(text),
  public.bootstrap_local_profile(jsonb),
  public.create_guest_upgrade_intent(),
  public.inspect_profile_conflict(text),
  public.resolve_profile_conflict(text,public.profile_conflict_resolution) to authenticated;

-- No browser role receives UPDATE on player_ratings. RATING-01 must add a trusted authority path.

commit;
