-- MULTIPLAYER-01C follow-up: clock rebasing, disconnect reason and participant-scoped Realtime hints.
begin;

alter table private.multiplayer_matches
  drop constraint multiplayer_matches_termination_reason_check;
alter table private.multiplayer_matches
  add constraint multiplayer_matches_termination_reason_check
  check (termination_reason is null or termination_reason in (
    'king-captured', 'timeout', 'forfeit', 'disconnect-forfeit', 'technical-abort'
  ));

create or replace function private.prepare_authoritative_match_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'active'
      and new.canonical_state is distinct from old.canonical_state then
    -- The commit function has already deducted elapsed time. Rebase so a second
    -- move in the same RouletteChess turn cannot deduct that interval twice.
    new.active_turn_started_at := now();
  end if;
  if old.status = 'active' and new.status = 'terminal'
      and new.termination_reason = 'forfeit'
      and ((old.white_reconnect_deadline is not null and old.white_reconnect_deadline <= now())
        or (old.black_reconnect_deadline is not null and old.black_reconnect_deadline <= now())) then
    new.termination_reason := 'disconnect-forfeit';
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_authoritative_match_transition on private.multiplayer_matches;
create trigger prepare_authoritative_match_transition
before update on private.multiplayer_matches
for each row execute function private.prepare_authoritative_match_transition();

create or replace function private.settle_multiplayer_match_if_eligible(match_row private.multiplayer_matches)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if match_row.mode = 'ranked'
      and match_row.status = 'terminal'
      and match_row.winner_player_id is not null
      and match_row.termination_reason in ('king-captured', 'timeout', 'forfeit', 'disconnect-forfeit') then
    perform private.settle_ranked_match(
      match_row.match_id,
      'multiplayer-ranked',
      match_row.player_a_id,
      match_row.player_b_id,
      match_row.winner_player_id,
      case when match_row.termination_reason in ('forfeit', 'disconnect-forfeit') then 'forfeit' else 'normal' end
    );
  end if;
end;
$$;

create table public.multiplayer_match_events (
  event_id bigint generated always as identity primary key,
  match_id uuid not null,
  revision bigint not null,
  player_a_id uuid not null references public.players(player_id) on delete cascade,
  player_b_id uuid not null references public.players(player_id) on delete cascade,
  event_kind text not null check (event_kind in ('activated', 'revision-changed', 'terminated')),
  created_at timestamptz not null default now(),
  check (player_a_id <> player_b_id)
);
create index multiplayer_match_events_participant_lookup
  on public.multiplayer_match_events(match_id, revision desc);
alter table public.multiplayer_match_events enable row level security;

create policy multiplayer_match_events_participant_select
on public.multiplayer_match_events for select to authenticated
using (
  player_a_id in (
    select ownership.player_id from public.player_auth_owners ownership
    where ownership.auth_user_id = (select auth.uid())
  )
  or player_b_id in (
    select ownership.player_id from public.player_auth_owners ownership
    where ownership.auth_user_id = (select auth.uid())
  )
);

create or replace function private.publish_multiplayer_match_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.revision = old.revision then return new; end if;
  insert into public.multiplayer_match_events(
    match_id, revision, player_a_id, player_b_id, event_kind
  ) values (
    new.match_id, new.revision, new.player_a_id, new.player_b_id,
    case
      when old.status = 'initializing' and new.status = 'active' then 'activated'
      when old.status = 'active' and new.status in ('terminal', 'technical-abort') then 'terminated'
      else 'revision-changed'
    end
  );
  return new;
end;
$$;

drop trigger if exists publish_multiplayer_match_event on private.multiplayer_matches;
create trigger publish_multiplayer_match_event
after update on private.multiplayer_matches
for each row execute function private.publish_multiplayer_match_event();

revoke all on public.multiplayer_match_events from public, anon, authenticated;
grant select on public.multiplayer_match_events to authenticated;
revoke all on function private.prepare_authoritative_match_transition() from public, anon, authenticated;
revoke all on function private.publish_multiplayer_match_event() from public, anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'multiplayer_match_events'
  ) then
    alter publication supabase_realtime add table public.multiplayer_match_events;
  end if;
end;
$$;

commit;
