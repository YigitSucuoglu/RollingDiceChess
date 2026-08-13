-- AUTH-01C: provider-independent player identity and ownership foundation.
-- Deployment status in this repository: NOT APPLIED. Apply through Supabase CLI/dashboard review.
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

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  new_player_id uuid := gen_random_uuid();
  generated_name text := 'Guest' || lpad((abs(hashtext(new.id::text)) % 10000)::text, 4, '0');
  owner_kind public.player_ownership_kind := case when coalesce(new.is_anonymous, false) then 'guest' else 'account' end;
begin
  insert into public.players(player_id, display_name, ownership_kind)
    values (new_player_id, generated_name, owner_kind);
  insert into public.player_auth_owners(auth_user_id, player_id) values (new.id, new_player_id);
  insert into public.player_progression(player_id) values (new_player_id);
  insert into public.player_ratings(player_id) values (new_player_id);
  insert into public.player_piece_statistics(player_id, piece_type)
    select new_player_id, piece_type from unnest(array['pawn','knight','bishop','rook','queen','king']) piece_type;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_auth_user();

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

create or replace function public.bootstrap_local_profile(
  source_profile_id text, source_schema_version integer, source_display_name text,
  source_total_xp bigint, source_games_played integer, source_wins integer, source_losses integer
) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := private.current_player_id();
begin
  if target is null then raise exception 'player not found' using errcode = 'P0002'; end if;
  insert into public.local_profile_bootstraps(player_id, source_profile_id, source_schema_version)
    values (target, source_profile_id, source_schema_version) on conflict do nothing;
  if not found then return target; end if;
  if source_total_xp < 0 or source_games_played < 0 or source_wins < 0 or source_losses < 0 then
    raise exception 'invalid progression' using errcode = '22023';
  end if;
  update public.player_progression set total_xp=source_total_xp, games_played=source_games_played,
    wins=source_wins, losses=source_losses, updated_at=now()
    where player_id=target and total_xp=0 and games_played=0;
  update public.players set display_name=left(regexp_replace(btrim(source_display_name), '\s+', ' ', 'g'),24), updated_at=now()
    where player_id=target and char_length(btrim(source_display_name)) >= 2;
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
  if intent.migration_id is null or intent.expires_at < now() then raise exception 'invalid or expired migration' using errcode='42501'; end if;
  if intent.resolved_at is not null then
    if intent.resolution <> requested_resolution then raise exception 'migration already resolved differently' using errcode='23505'; end if;
    return intent.surviving_player_id;
  end if;
  select player_id into google_player from public.player_auth_owners where auth_user_id=auth.uid() for update;
  if google_player is null or google_player=intent.guest_player_id then return intent.guest_player_id; end if;
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
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.rename_current_player(text) from public, anon, authenticated;
revoke all on function public.bootstrap_local_profile(text,integer,text,bigint,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.create_guest_upgrade_intent() from public, anon, authenticated;
revoke all on function public.resolve_profile_conflict(text, public.profile_conflict_resolution) from public, anon, authenticated;
revoke all on function public.inspect_profile_conflict(text) from public, anon, authenticated;
grant execute on function public.rename_current_player(text),
  public.bootstrap_local_profile(text,integer,text,bigint,integer,integer,integer),
  public.create_guest_upgrade_intent(),
  public.inspect_profile_conflict(text),
  public.resolve_profile_conflict(text,public.profile_conflict_resolution) to authenticated;

-- No browser role receives UPDATE on player_ratings. RATING-01 must add a trusted authority path.
