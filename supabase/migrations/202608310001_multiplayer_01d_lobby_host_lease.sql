-- MULTIPLAYER-01D: bounded pre-match host lease, independent from active-match presence.
begin;

alter table private.multiplayer_lobbies
  add column host_last_seen_at timestamptz not null default now(),
  add column host_lease_expires_at timestamptz not null default (now() + interval '3 minutes');

-- Existing open lobbies receive one bounded transition grace. Active hosts can renew it;
-- abandoned lobbies naturally expire without manually targeting production data.
update private.multiplayer_lobbies
set host_last_seen_at = now(),
    host_lease_expires_at = least(expires_at, now() + interval '3 minutes')
where status in ('waiting', 'ready');

alter table private.multiplayer_lobbies
  add constraint multiplayer_open_lobby_host_lease_valid check (
    status not in ('waiting', 'ready')
    or host_lease_expires_at <= expires_at
  );

create index multiplayer_open_lobby_lease_lookup
  on private.multiplayer_lobbies(host_lease_expires_at, expires_at)
  where status in ('waiting', 'ready');

create or replace function private.expire_multiplayer_lobby(target_lobby_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby from private.multiplayer_lobbies
    where lobby_id = target_lobby_id for update;
  if lobby.lobby_id is null or lobby.status not in ('waiting', 'ready') then return false; end if;
  if lobby.expires_at > now() and lobby.host_lease_expires_at > now() then return false; end if;
  perform set_config('roulettechess.lobby_event_kind', 'expired', true);
  update private.multiplayer_lobbies set status = 'closed', updated_at = now()
    where lobby_id = lobby.lobby_id and status in ('waiting', 'ready');
  return found;
end;
$$;

create or replace function private.expire_stale_multiplayer_lobbies(batch_size integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare expired_count integer;
begin
  if batch_size < 1 or batch_size > 500 then
    raise exception 'invalid expiry batch size' using errcode = '22023';
  end if;
  perform set_config('roulettechess.lobby_event_kind', 'expired', true);
  with expired as (
    select lobby_id from private.multiplayer_lobbies
    where status in ('waiting', 'ready')
      and (expires_at <= now() or host_lease_expires_at <= now())
    order by least(expires_at, host_lease_expires_at)
    limit batch_size
    for update skip locked
  )
  update private.multiplayer_lobbies lobby
    set status = 'closed', updated_at = now()
    from expired where lobby.lobby_id = expired.lobby_id;
  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

revoke all on function private.expire_multiplayer_lobby(uuid),
  private.expire_stale_multiplayer_lobbies(integer)
  from public, anon, authenticated;

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
) language plpgsql volatile security definer set search_path = '' as $$
begin
  perform private.expire_stale_multiplayer_lobbies(100);
  return query
    select lobby.lobby_id, player.display_name, player.public_discriminator,
      rating.multiplayer_rating, lobby.mode, lobby.side_preference,
      lobby.time_control_id, lobby.initial_ms, lobby.increment_ms, lobby.created_at
    from private.multiplayer_lobbies lobby
    join public.players player on player.player_id = lobby.host_player_id
    join public.player_ratings rating on rating.player_id = lobby.host_player_id
    where lobby.visibility = 'public' and lobby.status = 'waiting'
      and lobby.expires_at > now() and lobby.host_lease_expires_at > now()
      and player.lifecycle = 'active'
    order by lobby.created_at desc;
end;
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
  existing_lobby_id uuid;
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
  select lobby_id into existing_lobby_id from private.multiplayer_active_participants
    where player_id = caller and lobby_id is not null;
  if existing_lobby_id is not null then perform private.expire_multiplayer_lobby(existing_lobby_id); end if;
  if exists (select 1 from private.multiplayer_active_participants where player_id = caller) then
    raise exception 'player already has an active lobby or match' using errcode = '23505';
  end if;
  perform private.expire_stale_multiplayer_lobbies(100);
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
    time_control_id, initial_ms, increment_ms, private_code,
    host_last_seen_at, host_lease_expires_at
  ) values (
    created_lobby_id, caller, requested_visibility, requested_mode, normalized_side,
    requested_time_control_id, requested_initial_ms, requested_increment_ms, generated_code,
    now(), least(now() + interval '3 minutes', now() + interval '30 minutes')
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
      or lobby.expires_at <= now() or lobby.host_lease_expires_at <= now()
      or lobby.host_player_id = caller then
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

create or replace function public.heartbeat_multiplayer_lobby(requested_lobby_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby from private.multiplayer_lobbies
    where lobby_id = requested_lobby_id for update;
  if lobby.lobby_id is null or lobby.host_player_id is distinct from caller then
    raise exception 'host authorization required' using errcode = '42501';
  end if;
  if lobby.status not in ('waiting', 'ready')
      or lobby.expires_at <= now() or lobby.host_lease_expires_at <= now() then
    raise exception 'lobby is no longer available' using errcode = 'P0002';
  end if;
  update private.multiplayer_lobbies
    set host_last_seen_at = now(),
        host_lease_expires_at = least(expires_at, now() + interval '3 minutes')
    where lobby_id = lobby.lobby_id;
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
  if lobby.status <> 'ready' or lobby.opponent_player_id is null
      or lobby.expires_at <= now() or lobby.host_lease_expires_at <= now() then
    raise exception 'lobby is not ready' using errcode = '55000';
  end if;
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

create or replace function public.get_multiplayer_lobby_snapshot(requested_lobby_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby from private.multiplayer_lobbies where lobby_id = requested_lobby_id;
  if lobby.lobby_id is null or caller not in (lobby.host_player_id, lobby.opponent_player_id)
      or lobby.status = 'closed'
      or (lobby.status in ('waiting', 'ready')
        and (lobby.expires_at <= now() or lobby.host_lease_expires_at <= now())) then
    raise exception 'lobby not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'role', case when lobby.host_player_id = caller then 'host' else 'opponent' end,
    'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, caller)
  );
end;
$$;

create or replace function public.trusted_reconcile_multiplayer_state(requested_caller_player_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  membership private.multiplayer_active_participants%rowtype;
  lobby private.multiplayer_lobbies%rowtype;
  match_row private.multiplayer_matches%rowtype;
  membership_count integer;
  participant_membership_count integer;
  caller_role text;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required' using errcode = '42501'; end if;
  select * into membership from private.multiplayer_active_participants
    where player_id = requested_caller_player_id for update;
  if membership.player_id is null then return jsonb_build_object('kind', 'none'); end if;

  if membership.match_id is not null then
    select * into match_row from private.multiplayer_matches where match_id = membership.match_id for update;
    if match_row.match_id is null then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if requested_caller_player_id not in (match_row.player_a_id, match_row.player_b_id) then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    select * into lobby from private.multiplayer_lobbies where lobby_id = match_row.lobby_id for update;
  else
    select * into lobby from private.multiplayer_lobbies where lobby_id = membership.lobby_id for update;
    if lobby.lobby_id is null then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if requested_caller_player_id not in (lobby.host_player_id, lobby.opponent_player_id) then
      delete from private.multiplayer_active_participants where player_id = requested_caller_player_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    select * into match_row from private.multiplayer_matches where lobby_id = lobby.lobby_id for update;
  end if;

  if match_row.match_id is not null then
    if match_row.status in ('terminal', 'technical-abort') then
      delete from private.multiplayer_active_participants where match_id = match_row.match_id or lobby_id = match_row.lobby_id;
      if lobby.status is distinct from 'closed' then
        update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
      end if;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if match_row.status = 'active' then
      if match_row.canonical_state is not null and match_row.current_roll is not null
          and match_row.current_turn is not null
          and match_row.white_player_id in (match_row.player_a_id, match_row.player_b_id)
          and match_row.black_player_id in (match_row.player_a_id, match_row.player_b_id)
          and match_row.white_player_id is distinct from match_row.black_player_id then
        update private.multiplayer_active_participants set match_id = match_row.match_id, lobby_id = null
          where lobby_id = match_row.lobby_id;
        if lobby.status is distinct from 'closed' then
          update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
        end if;
        return jsonb_build_object('kind', 'match', 'matchId', match_row.match_id);
      end if;
      update private.multiplayer_matches set status = 'technical-abort', termination_reason = 'technical-abort',
        winner_player_id = null, active_turn_started_at = null, revision = revision + 1, updated_at = now()
        where match_id = match_row.match_id;
      update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
    if match_row.status = 'initializing' then
      if lobby.status = 'starting' and match_row.updated_at >= now() - interval '5 minutes' then
        caller_role := case when requested_caller_player_id = lobby.host_player_id then 'host' else 'opponent' end;
        return jsonb_build_object('kind', 'starting', 'matchId', match_row.match_id, 'role', caller_role);
      end if;
      update private.multiplayer_matches set status = 'technical-abort', termination_reason = 'technical-abort',
        winner_player_id = null, active_turn_started_at = null, revision = revision + 1, updated_at = now()
        where match_id = match_row.match_id;
      update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = match_row.lobby_id;
      return jsonb_build_object('kind', 'recovered');
    end if;
  end if;

  if lobby.status = 'closed' then
    delete from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
    return jsonb_build_object('kind', 'recovered');
  end if;
  if lobby.status in ('waiting', 'ready')
      and (lobby.expires_at <= now() or lobby.host_lease_expires_at <= now()) then
    perform set_config('roulettechess.lobby_event_kind', 'expired', true);
    update private.multiplayer_lobbies set status = 'closed', updated_at = now()
      where lobby_id = lobby.lobby_id;
    return jsonb_build_object('kind', 'recovered');
  end if;
  select count(*), count(*) filter (where player_id in (lobby.host_player_id, lobby.opponent_player_id))
    into membership_count, participant_membership_count
    from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
  if (lobby.status = 'waiting' and lobby.opponent_player_id is null
        and membership_count = 1 and participant_membership_count = 1)
      or (lobby.status = 'ready' and lobby.opponent_player_id is not null
        and membership_count = 2 and participant_membership_count = 2) then
    return jsonb_build_object('kind', 'lobby',
      'role', case when requested_caller_player_id = lobby.host_player_id then 'host' else 'opponent' end,
      'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, requested_caller_player_id));
  end if;
  if lobby.status = 'starting' and lobby.updated_at >= now() - interval '5 minutes' then
    return jsonb_build_object('kind', 'lobby',
      'role', case when requested_caller_player_id = lobby.host_player_id then 'host' else 'opponent' end,
      'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, requested_caller_player_id));
  end if;
  update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
  return jsonb_build_object('kind', 'recovered');
end;
$$;

revoke all on function public.heartbeat_multiplayer_lobby(uuid) from public, anon, authenticated;
grant execute on function public.heartbeat_multiplayer_lobby(uuid) to authenticated;
revoke all on function public.trusted_reconcile_multiplayer_state(uuid) from public, anon, authenticated;
grant execute on function public.trusted_reconcile_multiplayer_state(uuid) to service_role;

commit;
