-- MULTIPLAYER-01B: canonical lobby restoration and privacy-safe realtime invalidation.
begin;

create table public.multiplayer_lobby_events (
  event_id bigint generated always as identity primary key,
  scope text not null check (scope in ('public-list', 'participant')),
  recipient_player_id uuid references public.players(player_id) on delete cascade,
  lobby_id uuid,
  event_kind text not null check (event_kind in (
    'created', 'joined', 'opponent-left', 'opponent-kicked',
    'host-closed', 'starting', 'expired'
  )),
  created_at timestamptz not null default now(),
  check (
    (scope = 'public-list' and recipient_player_id is null and lobby_id is null)
    or (scope = 'participant' and recipient_player_id is not null and lobby_id is not null)
  )
);

alter table public.multiplayer_lobby_events enable row level security;

create policy multiplayer_lobby_events_read_safe
  on public.multiplayer_lobby_events
  for select
  to authenticated
  using (
    scope = 'public-list'
    or recipient_player_id = private.current_player_id()
  );

revoke all on table public.multiplayer_lobby_events from public, anon, authenticated;
grant select on table public.multiplayer_lobby_events to authenticated;

create or replace function private.publish_multiplayer_lobby_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
  recipient uuid;
begin
  event_name := coalesce(
    nullif(current_setting('roulettechess.lobby_event_kind', true), ''),
    case
    when tg_op = 'INSERT' then 'created'
    when new.status = 'starting' and old.status is distinct from new.status then 'starting'
    when new.status = 'closed' and old.status is distinct from new.status then 'host-closed'
    when new.status = 'ready' and old.status = 'waiting' then 'joined'
    when new.status = 'waiting' and old.status = 'ready'
      and old.opponent_player_id is not null then 'opponent-left'
    else null
    end
  );

  if event_name is null then return new; end if;

  if new.visibility = 'public' then
    insert into public.multiplayer_lobby_events(scope, event_kind)
      values ('public-list', event_name);
  end if;

  foreach recipient in array array[
    new.host_player_id,
    new.opponent_player_id,
    case when tg_op = 'UPDATE' then old.opponent_player_id else null end
  ] loop
    if recipient is not null then
      insert into public.multiplayer_lobby_events(
        scope, recipient_player_id, lobby_id, event_kind
      ) values ('participant', recipient, new.lobby_id, event_name);
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function private.publish_multiplayer_lobby_event()
  from public, anon, authenticated;

create trigger multiplayer_lobby_event_trigger
after insert or update of status, opponent_player_id
on private.multiplayer_lobbies
for each row execute function private.publish_multiplayer_lobby_event();

create or replace function public.kick_multiplayer_lobby_opponent(requested_lobby_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller uuid := private.current_player_id(); lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby from private.multiplayer_lobbies where lobby_id = requested_lobby_id for update;
  if lobby.host_player_id is distinct from caller then raise exception 'host authorization required' using errcode = '42501'; end if;
  if lobby.status <> 'ready' or lobby.opponent_player_id is null then raise exception 'lobby is not ready' using errcode = '55000'; end if;
  delete from private.multiplayer_active_participants where player_id = lobby.opponent_player_id and lobby_id = lobby.lobby_id;
  perform set_config('roulettechess.lobby_event_kind', 'opponent-kicked', true);
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
    perform set_config('roulettechess.lobby_event_kind', 'host-closed', true);
    update private.multiplayer_lobbies set status = 'closed', updated_at = now() where lobby_id = lobby.lobby_id;
  elsif caller = lobby.opponent_player_id then
    delete from private.multiplayer_active_participants where player_id = caller and lobby_id = lobby.lobby_id;
    perform set_config('roulettechess.lobby_event_kind', 'opponent-left', true);
    update private.multiplayer_lobbies set opponent_player_id = null, status = 'waiting', updated_at = now()
      where lobby_id = lobby.lobby_id;
  else raise exception 'lobby participant authorization required' using errcode = '42501';
  end if;
  return private.multiplayer_lobby_snapshot(lobby.lobby_id, caller);
end;
$$;

create or replace function public.get_current_multiplayer_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_player_id();
  membership private.multiplayer_active_participants%rowtype;
  lobby private.multiplayer_lobbies%rowtype;
begin
  if caller is null then
    raise exception 'active player not found' using errcode = 'P0002';
  end if;

  select * into membership
  from private.multiplayer_active_participants
  where player_id = caller
  for update;

  if membership.player_id is null then return null; end if;

  if membership.match_id is not null then
    return jsonb_build_object(
      'kind', 'match',
      'matchId', membership.match_id
    );
  end if;

  select * into lobby
  from private.multiplayer_lobbies
  where lobby_id = membership.lobby_id
  for update;

  if lobby.lobby_id is null or lobby.status = 'closed' then return null; end if;

  if lobby.expires_at <= now() and lobby.status in ('waiting', 'ready') then
    delete from private.multiplayer_active_participants where lobby_id = lobby.lobby_id;
    perform set_config('roulettechess.lobby_event_kind', 'expired', true);
    update private.multiplayer_lobbies
      set status = 'closed', updated_at = now()
      where lobby_id = lobby.lobby_id;
    return null;
  end if;

  return jsonb_build_object(
    'kind', 'lobby',
    'role', case when lobby.host_player_id = caller then 'host' else 'opponent' end,
    'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, caller)
  );
end;
$$;

create or replace function public.get_multiplayer_lobby_snapshot(
  requested_lobby_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := private.current_player_id();
  lobby private.multiplayer_lobbies%rowtype;
begin
  select * into lobby
  from private.multiplayer_lobbies
  where lobby_id = requested_lobby_id;

  if lobby.lobby_id is null
      or caller not in (lobby.host_player_id, lobby.opponent_player_id) then
    raise exception 'lobby not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'role', case when lobby.host_player_id = caller then 'host' else 'opponent' end,
    'lobby', private.multiplayer_lobby_snapshot(lobby.lobby_id, caller)
  );
end;
$$;

revoke all on function public.get_current_multiplayer_context() from public, anon;
revoke all on function public.get_multiplayer_lobby_snapshot(uuid) from public, anon;
grant execute on function public.get_current_multiplayer_context() to authenticated;
grant execute on function public.get_multiplayer_lobby_snapshot(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    raise exception 'supabase_realtime publication is required';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'multiplayer_lobby_events'
  ) then
    alter publication supabase_realtime add table public.multiplayer_lobby_events;
  end if;
end;
$$;

commit;
