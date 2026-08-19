-- MULTIPLAYER-01A: lobby/session persistence and trusted activation boundary.
begin;

create type public.multiplayer_lobby_visibility as enum ('public', 'private');
create type public.multiplayer_mode as enum ('ranked', 'unranked');
create type public.multiplayer_side_preference as enum ('white', 'black', 'random');
create type public.multiplayer_lobby_status as enum ('waiting', 'ready', 'starting', 'closed');
create type public.multiplayer_match_status as enum ('initializing', 'active', 'terminal', 'technical-abort');

create table private.multiplayer_lobbies (
  lobby_id uuid primary key default gen_random_uuid(),
  host_player_id uuid not null references public.players(player_id) on delete restrict,
  opponent_player_id uuid references public.players(player_id) on delete restrict,
  visibility public.multiplayer_lobby_visibility not null default 'public',
  mode public.multiplayer_mode not null,
  side_preference public.multiplayer_side_preference not null,
  time_control_id text not null check (char_length(time_control_id) between 1 and 40),
  initial_ms integer not null check (initial_ms between 1000 and 10800000),
  increment_ms integer not null check (increment_ms between 0 and 60000),
  status public.multiplayer_lobby_status not null default 'waiting',
  private_code text check (private_code is null or private_code ~ '^[0-9]{6}$'),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (host_player_id is distinct from opponent_player_id),
  check ((visibility = 'private' and private_code is not null)
    or (visibility = 'public' and private_code is null)),
  check ((status = 'waiting' and opponent_player_id is null)
    or (status in ('ready', 'starting') and opponent_player_id is not null)
    or status = 'closed'),
  check (mode = 'unranked' or side_preference = 'random')
);

create unique index multiplayer_active_private_code_unique
  on private.multiplayer_lobbies(private_code)
  where visibility = 'private' and status in ('waiting', 'ready', 'starting');
create index multiplayer_public_waiting_lookup
  on private.multiplayer_lobbies(created_at desc)
  where visibility = 'public' and status = 'waiting';

create table private.multiplayer_matches (
  match_id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null unique references private.multiplayer_lobbies(lobby_id) on delete restrict,
  player_a_id uuid not null references public.players(player_id) on delete restrict,
  player_b_id uuid not null references public.players(player_id) on delete restrict,
  white_player_id uuid references public.players(player_id) on delete restrict,
  black_player_id uuid references public.players(player_id) on delete restrict,
  mode public.multiplayer_mode not null,
  time_control_id text not null,
  initial_ms integer not null,
  increment_ms integer not null,
  status public.multiplayer_match_status not null default 'initializing',
  revision bigint not null default 0 check (revision >= 0),
  realtime_topic text unique,
  canonical_state jsonb,
  current_roll text[],
  current_turn text,
  white_remaining_ms integer,
  black_remaining_ms integer,
  active_turn_started_at timestamptz,
  white_reconnect_deadline timestamptz,
  black_reconnect_deadline timestamptz,
  winner_player_id uuid references public.players(player_id) on delete restrict,
  termination_reason text,
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  check (player_a_id <> player_b_id),
  check (white_player_id is null or black_player_id is null or white_player_id <> black_player_id),
  check (current_turn is null or current_turn in ('white', 'black')),
  check (termination_reason is null or termination_reason in ('king-captured', 'timeout', 'forfeit', 'technical-abort')),
  check (current_roll is null or (
    cardinality(current_roll) = 3
    and current_roll <@ array['pawn','knight','bishop','rook','queen','king']::text[]
  )),
  check (status <> 'active' or (
    revision > 0 and realtime_topic is not null
    and white_player_id is not null and black_player_id is not null
    and canonical_state is not null and current_roll is not null
    and current_turn is not null and white_remaining_ms is not null
    and black_remaining_ms is not null and active_turn_started_at is not null
  ))
);

create table private.multiplayer_active_participants (
  player_id uuid primary key references public.players(player_id) on delete cascade,
  lobby_id uuid references private.multiplayer_lobbies(lobby_id) on delete cascade,
  match_id uuid references private.multiplayer_matches(match_id) on delete cascade,
  joined_at timestamptz not null default now(),
  check ((lobby_id is not null)::integer + (match_id is not null)::integer = 1)
);

create table private.multiplayer_private_join_attempts (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index multiplayer_private_join_attempts_lookup
  on private.multiplayer_private_join_attempts(auth_user_id, attempted_at desc);

alter table private.multiplayer_lobbies enable row level security;
alter table private.multiplayer_matches enable row level security;
alter table private.multiplayer_active_participants enable row level security;
alter table private.multiplayer_private_join_attempts enable row level security;

create or replace function private.multiplayer_participant_summary(target_player_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'displayName', player.display_name,
    'publicDiscriminator', player.public_discriminator,
    'multiplayerRating', rating.multiplayer_rating
  )
  from public.players player
  join public.player_ratings rating using (player_id)
  where player.player_id = target_player_id and player.lifecycle = 'active';
$$;

create or replace function private.multiplayer_lobby_snapshot(
  target_lobby_id uuid,
  viewer_player_id uuid
) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'lobbyId', lobby.lobby_id,
    'status', lobby.status,
    'visibility', lobby.visibility,
    'mode', lobby.mode,
    'sidePreference', lobby.side_preference,
    'timeControl', jsonb_build_object(
      'id', lobby.time_control_id,
      'initialMs', lobby.initial_ms,
      'incrementMs', lobby.increment_ms
    ),
    'host', private.multiplayer_participant_summary(lobby.host_player_id),
    'opponent', case when lobby.opponent_player_id is null then null
      else private.multiplayer_participant_summary(lobby.opponent_player_id) end,
    'privateCode', case when viewer_player_id in (lobby.host_player_id, lobby.opponent_player_id)
      then lobby.private_code else null end,
    'expiresAt', lobby.expires_at
  )
  from private.multiplayer_lobbies lobby
  where lobby.lobby_id = target_lobby_id;
$$;

create or replace function public.list_open_multiplayer_lobbies()
returns table (
  lobby_id uuid,
  host_display_name text,
  host_public_discriminator text,
  host_rating integer,
  mode public.multiplayer_mode,
  side_preference public.multiplayer_side_preference,
  time_control_id text,
  initial_ms integer,
  increment_ms integer,
  created_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select lobby.lobby_id, player.display_name, player.public_discriminator,
    rating.multiplayer_rating, lobby.mode, lobby.side_preference,
    lobby.time_control_id, lobby.initial_ms, lobby.increment_ms, lobby.created_at
  from private.multiplayer_lobbies lobby
  join public.players player on player.player_id = lobby.host_player_id
  join public.player_ratings rating on rating.player_id = lobby.host_player_id
  where lobby.visibility = 'public' and lobby.status = 'waiting'
    and lobby.expires_at > now() and player.lifecycle = 'active'
  order by lobby.created_at desc;
$$;

create or replace function public.create_multiplayer_lobby(
  requested_visibility public.multiplayer_lobby_visibility,
  requested_mode public.multiplayer_mode,
  requested_side_preference public.multiplayer_side_preference,
  requested_time_control_id text,
  requested_initial_ms integer,
  requested_increment_ms integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := private.current_player_id();
  created_lobby_id uuid := gen_random_uuid();
  generated_code text;
  normalized_side public.multiplayer_side_preference;
  attempt integer;
begin
  if caller is null or not exists (
    select 1 from public.players where player_id = caller and lifecycle = 'active'
  ) then raise exception 'active player not found' using errcode = 'P0002'; end if;
  if requested_time_control_id is null or char_length(requested_time_control_id) not between 1 and 40
      or requested_initial_ms not between 1000 and 10800000
      or requested_increment_ms not between 0 and 60000 then
    raise exception 'invalid time control' using errcode = '22023';
  end if;
  if requested_mode = 'ranked' and requested_side_preference <> 'random' then
    raise exception 'ranked side assignment is random only' using errcode = '22023';
  end if;
  normalized_side := case when requested_mode = 'ranked' then 'random' else requested_side_preference end;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 21));
  if exists (select 1 from private.multiplayer_active_participants where player_id = caller) then
    raise exception 'player already has an active lobby or match' using errcode = '23505';
  end if;
  if requested_visibility = 'private' then
    for attempt in 1..20 loop
      generated_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
      exit when not exists (
        select 1 from private.multiplayer_lobbies
        where private_code = generated_code and status in ('waiting', 'ready', 'starting')
      );
    end loop;
    if attempt = 20 and exists (
      select 1 from private.multiplayer_lobbies
      where private_code = generated_code and status in ('waiting', 'ready', 'starting')
    ) then raise exception 'private code allocation exhausted' using errcode = 'P0001'; end if;
  end if;
  insert into private.multiplayer_lobbies (
    lobby_id, host_player_id, visibility, mode, side_preference,
    time_control_id, initial_ms, increment_ms, private_code
  ) values (
    created_lobby_id, caller, requested_visibility, requested_mode, normalized_side,
    requested_time_control_id, requested_initial_ms, requested_increment_ms, generated_code
  );
  insert into private.multiplayer_active_participants(player_id, lobby_id)
    values (caller, created_lobby_id);
  return private.multiplayer_lobby_snapshot(created_lobby_id, caller);
end;
$$;

create or replace function public.join_multiplayer_lobby(
  requested_lobby_id uuid default null,
  requested_private_code text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := private.current_player_id();
  lobby private.multiplayer_lobbies%rowtype;
  attempts integer;
begin
  if caller is null then raise exception 'active player not found' using errcode = 'P0002'; end if;
  if (requested_lobby_id is null) = (requested_private_code is null) then
    raise exception 'provide one lobby locator' using errcode = '22023';
  end if;
  if requested_private_code is not null then
    insert into private.multiplayer_private_join_attempts(auth_user_id) values (auth.uid());
    select count(*) into attempts from private.multiplayer_private_join_attempts
      where auth_user_id = auth.uid() and attempted_at >= now() - interval '1 minute';
    if attempts > 10 then raise exception 'private lobby lookup rate exceeded' using errcode = 'P0001'; end if;
    if requested_private_code !~ '^[0-9]{6}$' then
      raise exception 'lobby is no longer available' using errcode = 'P0002';
    end if;
    select * into lobby from private.multiplayer_lobbies
      where visibility = 'private' and private_code = requested_private_code for update;
  else
    select * into lobby from private.multiplayer_lobbies
      where visibility = 'public' and lobby_id = requested_lobby_id for update;
  end if;
  if lobby.lobby_id is null or lobby.status <> 'waiting' or lobby.opponent_player_id is not null
      or lobby.expires_at <= now() or lobby.host_player_id = caller then
    raise exception 'lobby is no longer available' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 21));
  if exists (select 1 from private.multiplayer_active_participants where player_id = caller) then
    raise exception 'player already has an active lobby or match' using errcode = '23505';
  end if;
  insert into private.multiplayer_active_participants(player_id, lobby_id)
    values (caller, lobby.lobby_id);
  update private.multiplayer_lobbies set opponent_player_id = caller, status = 'ready', updated_at = now()
    where lobby_id = lobby.lobby_id;
  return private.multiplayer_lobby_snapshot(lobby.lobby_id, caller);
exception when unique_violation then
  raise exception 'lobby is no longer available' using errcode = 'P0002';
end;
$$;

create or replace function public.kick_multiplayer_lobby_opponent(requested_lobby_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby from private.multiplayer_lobbies where lobby_id = requested_lobby_id for update;
  if lobby.host_player_id is distinct from caller then raise exception 'host authorization required' using errcode = '42501'; end if;
  if lobby.status <> 'ready' or lobby.opponent_player_id is null then raise exception 'lobby is not ready' using errcode = '55000'; end if;
  delete from private.multiplayer_active_participants where player_id = lobby.opponent_player_id and lobby_id = lobby.lobby_id;
  update private.multiplayer_lobbies set opponent_player_id = null, status = 'waiting', updated_at = now()
    where lobby_id = lobby.lobby_id;
  return private.multiplayer_lobby_snapshot(lobby.lobby_id, caller);
end;
$$;

create or replace function public.leave_multiplayer_lobby(requested_lobby_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby from private.multiplayer_lobbies where lobby_id = requested_lobby_id for update;
  if lobby.lobby_id is null or lobby.status not in ('waiting', 'ready') then raise exception 'lobby cannot be left' using errcode = '55000'; end if;
  if caller = lobby.host_player_id then
    delete from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
    update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
  elsif caller = lobby.opponent_player_id then
    delete from private.multiplayer_active_participants where player_id = caller and lobby_id = lobby.lobby_id;
    update private.multiplayer_lobbies set opponent_player_id = null, status = 'waiting', updated_at = now()
      where lobby_id = lobby.lobby_id;
  else raise exception 'lobby participant authorization required' using errcode = '42501';
  end if;
  return private.multiplayer_lobby_snapshot(lobby.lobby_id, caller);
end;
$$;

create or replace function public.request_multiplayer_match_start(requested_lobby_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); lobby private.multiplayer_lobbies%rowtype; created_match_id uuid;
begin
  select * into lobby from private.multiplayer_lobbies where lobby_id = requested_lobby_id for update;
  if lobby.host_player_id is distinct from caller then raise exception 'host authorization required' using errcode = '42501'; end if;
  select match_id into created_match_id from private.multiplayer_matches where lobby_id = lobby.lobby_id;
  if created_match_id is not null then return created_match_id; end if;
  if lobby.status <> 'ready' or lobby.opponent_player_id is null then raise exception 'lobby is not ready' using errcode = '55000'; end if;
  insert into private.multiplayer_matches (
    lobby_id, player_a_id, player_b_id, mode, time_control_id, initial_ms, increment_ms
  ) values (
    lobby.lobby_id, lobby.host_player_id, lobby.opponent_player_id,
    lobby.mode, lobby.time_control_id, lobby.initial_ms, lobby.increment_ms
  ) returning match_id into created_match_id;
  update private.multiplayer_lobbies set status = 'starting', updated_at = now() where lobby_id = lobby.lobby_id;
  return created_match_id;
end;
$$;

create or replace function private.activate_multiplayer_match(
  requested_match_id uuid,
  trusted_initial_state jsonb
) returns private.multiplayer_matches language plpgsql security definer set search_path = '' as $$
declare match_row private.multiplayer_matches%rowtype; lobby private.multiplayer_lobbies%rowtype;
  host_is_white boolean; roll_result text[]; result private.multiplayer_matches;
begin
  if trusted_initial_state is null or jsonb_typeof(trusted_initial_state) <> 'object' then
    raise exception 'trusted canonical initial state is required' using errcode = '22023';
  end if;
  select * into match_row from private.multiplayer_matches where match_id = requested_match_id for update;
  if match_row.match_id is null then raise exception 'match not found' using errcode = 'P0002'; end if;
  if match_row.status = 'active' then return match_row; end if;
  if match_row.status <> 'initializing' then raise exception 'match cannot be activated' using errcode = '55000'; end if;
  select * into lobby from private.multiplayer_lobbies where lobby_id = match_row.lobby_id for update;
  if lobby.status <> 'starting' or lobby.opponent_player_id is null then raise exception 'lobby start invariant failed' using errcode = '55000'; end if;
  host_is_white := case lobby.side_preference when 'white' then true when 'black' then false else random() < 0.5 end;
  roll_result := array[
    (array['pawn','knight','bishop','rook','queen','king'])[floor(random() * 6)::integer + 1],
    (array['pawn','knight','bishop','rook','queen','king'])[floor(random() * 6)::integer + 1],
    (array['pawn','knight','bishop','rook','queen','king'])[floor(random() * 6)::integer + 1]
  ];
  update private.multiplayer_matches set
    white_player_id = case when host_is_white then player_a_id else player_b_id end,
    black_player_id = case when host_is_white then player_b_id else player_a_id end,
    canonical_state = trusted_initial_state,
    realtime_topic = 'match:' || match_id::text,
    current_roll = roll_result,
    current_turn = 'white',
    white_remaining_ms = initial_ms,
    black_remaining_ms = initial_ms,
    active_turn_started_at = now(),
    status = 'active', revision = 1, activated_at = now(), updated_at = now()
  where match_id = requested_match_id returning * into result;
  update private.multiplayer_active_participants set match_id = requested_match_id, lobby_id = null
    where lobby_id = lobby.lobby_id;
  update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
  return result;
end;
$$;

create or replace function public.get_multiplayer_match_snapshot(requested_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); match_row private.multiplayer_matches%rowtype;
begin
  select * into match_row from private.multiplayer_matches where match_id = requested_match_id;
  if match_row.match_id is null or caller not in (match_row.player_a_id, match_row.player_b_id) then
    raise exception 'match not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'schemaVersion', 1, 'matchId', match_row.match_id, 'revision', match_row.revision,
    'status', match_row.status, 'mode', match_row.mode,
    'realtimeTopic', match_row.realtime_topic,
    'youSide', case when caller = match_row.white_player_id then 'white' when caller = match_row.black_player_id then 'black' else null end,
    'white', case when match_row.white_player_id is null then null else private.multiplayer_participant_summary(match_row.white_player_id) end,
    'black', case when match_row.black_player_id is null then null else private.multiplayer_participant_summary(match_row.black_player_id) end,
    'timeControl', jsonb_build_object('id', match_row.time_control_id, 'initialMs', match_row.initial_ms, 'incrementMs', match_row.increment_ms),
    'canonicalState', match_row.canonical_state, 'currentRoll', match_row.current_roll,
    'currentTurn', match_row.current_turn,
    'clock', jsonb_build_object('whiteRemainingMs', match_row.white_remaining_ms, 'blackRemainingMs', match_row.black_remaining_ms, 'activeTurnStartedAt', match_row.active_turn_started_at, 'incrementMs', match_row.increment_ms),
    'connections', jsonb_build_object('whiteReconnectDeadline', match_row.white_reconnect_deadline, 'blackReconnectDeadline', match_row.black_reconnect_deadline),
    'terminationReason', match_row.termination_reason
  );
end;
$$;

revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function private.multiplayer_participant_summary(uuid) from public, anon, authenticated;
revoke all on function private.multiplayer_lobby_snapshot(uuid,uuid) from public, anon, authenticated;
revoke all on function private.activate_multiplayer_match(uuid,jsonb) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.activate_multiplayer_match(uuid,jsonb) to service_role;

revoke all on function public.list_open_multiplayer_lobbies() from public, anon, authenticated;
revoke all on function public.create_multiplayer_lobby(public.multiplayer_lobby_visibility,public.multiplayer_mode,public.multiplayer_side_preference,text,integer,integer) from public, anon, authenticated;
revoke all on function public.join_multiplayer_lobby(uuid,text) from public, anon, authenticated;
revoke all on function public.kick_multiplayer_lobby_opponent(uuid) from public, anon, authenticated;
revoke all on function public.leave_multiplayer_lobby(uuid) from public, anon, authenticated;
revoke all on function public.request_multiplayer_match_start(uuid) from public, anon, authenticated;
revoke all on function public.get_multiplayer_match_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.list_open_multiplayer_lobbies(),
  public.create_multiplayer_lobby(public.multiplayer_lobby_visibility,public.multiplayer_mode,public.multiplayer_side_preference,text,integer,integer),
  public.join_multiplayer_lobby(uuid,text),
  public.kick_multiplayer_lobby_opponent(uuid),
  public.leave_multiplayer_lobby(uuid),
  public.request_multiplayer_match_start(uuid),
  public.get_multiplayer_match_snapshot(uuid) to authenticated;

commit;
