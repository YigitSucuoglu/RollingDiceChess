-- PROFILE-STATISTICS Phase 5D-A: trusted match-local multiplayer telemetry.
-- No historical backfill and no player career projection are performed here.
begin;

create or replace function private.empty_multiplayer_piece_counters()
returns jsonb language sql immutable set search_path = '' as $$
  select '{"pawn":0,"knight":0,"bishop":0,"rook":0,"queen":0,"king":0}'::jsonb;
$$;

create or replace function private.valid_multiplayer_piece_counters(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'object'
    and (select array_agg(key order by key) from jsonb_object_keys(value) keys(key))
      = array['bishop','king','knight','pawn','queen','rook']::text[]
    and not exists (
      select 1 from jsonb_each(value) entry
      where case
        when jsonb_typeof(entry.value) <> 'number' then true
        when entry.value::text !~ '^[0-9]+$' then true
        else entry.value::text::numeric > 9223372036854775807
      end
    );
$$;

create or replace function private.increment_multiplayer_piece_counter(
  counters jsonb,
  piece_type text,
  amount bigint default 1
) returns jsonb language plpgsql immutable set search_path = '' as $$
declare current_value bigint;
begin
  if piece_type is null or piece_type not in ('pawn','knight','bishop','rook','queen','king')
      or amount < 0 or not private.valid_multiplayer_piece_counters(counters) then
    raise exception 'invalid multiplayer telemetry piece counter' using errcode = '22023';
  end if;
  current_value := (counters ->> piece_type)::bigint;
  if current_value > 9223372036854775807 - amount then
    raise exception 'multiplayer telemetry counter overflow' using errcode = '22003';
  end if;
  return jsonb_set(counters, array[piece_type], to_jsonb(current_value + amount), false);
end;
$$;

create table private.multiplayer_match_player_telemetry (
  match_id uuid not null references private.multiplayer_matches(match_id) on delete restrict,
  player_id uuid not null references public.players(player_id) on delete restrict,
  match_mode public.multiplayer_mode not null,
  player_side text not null check (player_side in ('white','black')),
  tracking_started_at timestamptz not null default now(),
  roulette_rolls bigint not null default 0 check (roulette_rolls >= 0),
  play_time_ms bigint not null default 0 check (play_time_ms >= 0),
  player_turns_completed bigint not null default 0 check (player_turns_completed >= 0),
  three_rights_turns bigint not null default 0 check (
    three_rights_turns >= 0 and three_rights_turns <= player_turns_completed
  ),
  kings_captured bigint not null default 0 check (kings_captured between 0 and 1),
  rolls_by_piece jsonb not null default private.empty_multiplayer_piece_counters()
    check (private.valid_multiplayer_piece_counters(rolls_by_piece)),
  moves_by_piece jsonb not null default private.empty_multiplayer_piece_counters()
    check (private.valid_multiplayer_piece_counters(moves_by_piece)),
  triple_rolls_by_piece jsonb not null default private.empty_multiplayer_piece_counters()
    check (private.valid_multiplayer_piece_counters(triple_rolls_by_piece)),
  updated_at timestamptz not null default now(),
  primary key (match_id, player_id),
  unique (match_id, player_side)
);

create index multiplayer_match_player_telemetry_player_lookup
  on private.multiplayer_match_player_telemetry(player_id, match_id);

create table private.multiplayer_career_telemetry_settlements (
  match_id uuid primary key references private.multiplayer_matches(match_id) on delete restrict,
  match_mode public.multiplayer_mode not null,
  player_a_id uuid not null references public.players(player_id) on delete restrict,
  player_b_id uuid not null references public.players(player_id) on delete restrict,
  winner_player_id uuid not null references public.players(player_id) on delete restrict,
  termination_reason text not null check (termination_reason in (
    'king-captured','timeout','forfeit','disconnect-forfeit'
  )),
  telemetry_snapshot jsonb not null check (jsonb_typeof(telemetry_snapshot) = 'object'),
  finalized_at timestamptz not null default now(),
  projection_applied_at timestamptz,
  check (player_a_id <> player_b_id),
  check (winner_player_id in (player_a_id, player_b_id))
);

create index multiplayer_career_telemetry_pending_projection
  on private.multiplayer_career_telemetry_settlements(finalized_at, match_id)
  where projection_applied_at is null;

alter table private.multiplayer_match_player_telemetry enable row level security;
alter table private.multiplayer_career_telemetry_settlements enable row level security;
revoke all on private.multiplayer_match_player_telemetry from public, anon, authenticated;
revoke all on private.multiplayer_career_telemetry_settlements from public, anon, authenticated;

create or replace function private.record_multiplayer_telemetry_roll(
  requested_match_id uuid,
  requested_player_id uuid,
  trusted_roll text[]
) returns void language plpgsql security definer set search_path = '' as $$
declare piece_type text; first_piece text;
begin
  if cardinality(trusted_roll) <> 3
      or not trusted_roll <@ array['pawn','knight','bishop','rook','queen','king']::text[] then
    raise exception 'invalid authoritative telemetry roll' using errcode = '22023';
  end if;
  update private.multiplayer_match_player_telemetry telemetry
  set roulette_rolls = telemetry.roulette_rolls + 1, updated_at = now()
  where telemetry.match_id = requested_match_id and telemetry.player_id = requested_player_id;
  if not found then raise exception 'match telemetry participant missing' using errcode = 'P0002'; end if;
  foreach piece_type in array trusted_roll loop
    update private.multiplayer_match_player_telemetry telemetry
    set rolls_by_piece = private.increment_multiplayer_piece_counter(
      telemetry.rolls_by_piece, piece_type
    ), updated_at = now()
    where telemetry.match_id = requested_match_id and telemetry.player_id = requested_player_id;
  end loop;
  first_piece := trusted_roll[1];
  if trusted_roll[2] = first_piece and trusted_roll[3] = first_piece then
    update private.multiplayer_match_player_telemetry telemetry
    set triple_rolls_by_piece = private.increment_multiplayer_piece_counter(
      telemetry.triple_rolls_by_piece, first_piece
    ), updated_at = now()
    where telemetry.match_id = requested_match_id and telemetry.player_id = requested_player_id;
  end if;
end;
$$;

create or replace function private.finalize_multiplayer_career_telemetry(
  match_row private.multiplayer_matches
) returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; snapshot jsonb;
begin
  if match_row.status <> 'terminal'
      or match_row.winner_player_id is null
      or match_row.winner_player_id not in (match_row.player_a_id, match_row.player_b_id)
      or match_row.termination_reason not in (
        'king-captured','timeout','forfeit','disconnect-forfeit'
      ) then
    return false;
  end if;
  select jsonb_object_agg(telemetry.player_side, jsonb_build_object(
    'playerId', telemetry.player_id,
    'rouletteRolls', telemetry.roulette_rolls,
    'playTimeMs', telemetry.play_time_ms,
    'playerTurnsCompleted', telemetry.player_turns_completed,
    'threeRightsTurns', telemetry.three_rights_turns,
    'kingsCaptured', telemetry.kings_captured,
    'rollsByPiece', telemetry.rolls_by_piece,
    'movesByPiece', telemetry.moves_by_piece,
    'tripleRollsByPiece', telemetry.triple_rolls_by_piece
  )) into snapshot
  from private.multiplayer_match_player_telemetry telemetry
  where telemetry.match_id = match_row.match_id;
  if snapshot is null or not (snapshot ? 'white' and snapshot ? 'black') then
    raise exception 'complete match telemetry is required' using errcode = 'P0002';
  end if;
  insert into private.multiplayer_career_telemetry_settlements (
    match_id, match_mode, player_a_id, player_b_id, winner_player_id,
    termination_reason, telemetry_snapshot
  ) values (
    match_row.match_id, match_row.mode, match_row.player_a_id, match_row.player_b_id,
    match_row.winner_player_id, match_row.termination_reason, snapshot
  ) on conflict (match_id) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function private.capture_multiplayer_match_telemetry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  active_player_id uuid;
  next_player_id uuid;
  tracked_since timestamptz;
  charged_ms bigint;
  remaining_ms bigint;
  history_entry jsonb;
  turn_entry jsonb;
  moves_used integer;
  old_history_sequence bigint;
begin
  if old.status = 'initializing' and new.status = 'active' then
    insert into private.multiplayer_match_player_telemetry(
      match_id, player_id, match_mode, player_side
    ) values
      (new.match_id, new.white_player_id, new.mode, 'white'),
      (new.match_id, new.black_player_id, new.mode, 'black')
    on conflict (match_id, player_id) do nothing;
    perform private.record_multiplayer_telemetry_roll(
      new.match_id, new.white_player_id, new.current_roll
    );
    return new;
  end if;

  if old.status = 'active' and new.revision > old.revision then
    insert into private.multiplayer_match_player_telemetry(
      match_id, player_id, match_mode, player_side, tracking_started_at
    ) values
      (new.match_id, old.white_player_id, new.mode, 'white', now()),
      (new.match_id, old.black_player_id, new.mode, 'black', now())
    on conflict (match_id, player_id) do nothing;

    active_player_id := case when old.current_turn = 'white'
      then old.white_player_id else old.black_player_id end;
    if old.active_turn_started_at is not null and active_player_id is not null then
      select telemetry.tracking_started_at into tracked_since
      from private.multiplayer_match_player_telemetry telemetry
      where telemetry.match_id = old.match_id and telemetry.player_id = active_player_id;
      remaining_ms := case when old.current_turn = 'white'
        then old.white_remaining_ms else old.black_remaining_ms end;
      charged_ms := least(
        greatest(0, coalesce(remaining_ms, 0)),
        greatest(0, floor(extract(epoch from now() - greatest(
          old.active_turn_started_at, tracked_since
        )) * 1000))
      );
      update private.multiplayer_match_player_telemetry telemetry
      set play_time_ms = telemetry.play_time_ms + charged_ms, updated_at = now()
      where telemetry.match_id = old.match_id and telemetry.player_id = active_player_id;
    end if;

    old_history_sequence := coalesce((old.canonical_state ->> 'historySequence')::bigint, 0);
    for history_entry in
      select move_entry
      from jsonb_array_elements(coalesce(new.canonical_state -> 'moveHistory', '[]'::jsonb)) turn_row
      cross join lateral jsonb_array_elements(coalesce(turn_row -> 'whiteMoves', '[]'::jsonb)) move_entry
      where (move_entry ->> 'timestamp')::bigint > old_history_sequence
      union all
      select move_entry
      from jsonb_array_elements(coalesce(new.canonical_state -> 'moveHistory', '[]'::jsonb)) turn_row
      cross join lateral jsonb_array_elements(coalesce(turn_row -> 'blackMoves', '[]'::jsonb)) move_entry
      where (move_entry ->> 'timestamp')::bigint > old_history_sequence
    loop
      active_player_id := case when history_entry ->> 'player' = 'white'
        then new.white_player_id when history_entry ->> 'player' = 'black'
        then new.black_player_id else null end;
      if active_player_id is null then
        raise exception 'authoritative move telemetry has no participant' using errcode = '22023';
      end if;
      update private.multiplayer_match_player_telemetry telemetry
      set moves_by_piece = private.increment_multiplayer_piece_counter(
        telemetry.moves_by_piece, history_entry ->> 'piece'
      ), updated_at = now()
      where telemetry.match_id = new.match_id and telemetry.player_id = active_player_id;
    end loop;

    if new.status = 'active' and new.current_turn is distinct from old.current_turn then
      turn_entry := new.canonical_state -> 'moveHistory'
        -> (jsonb_array_length(old.canonical_state -> 'moveHistory') - 1);
      moves_used := jsonb_array_length(coalesce(
        turn_entry -> (case when old.current_turn = 'white' then 'whiteMoves' else 'blackMoves' end),
        '[]'::jsonb
      ));
      if moves_used > 0 then
        active_player_id := case when old.current_turn = 'white'
          then new.white_player_id else new.black_player_id end;
        update private.multiplayer_match_player_telemetry telemetry
        set player_turns_completed = telemetry.player_turns_completed + 1,
          three_rights_turns = telemetry.three_rights_turns
            + case when moves_used = 3 then 1 else 0 end,
          updated_at = now()
        where telemetry.match_id = new.match_id and telemetry.player_id = active_player_id;
      end if;
      next_player_id := case when new.current_turn = 'white'
        then new.white_player_id else new.black_player_id end;
      perform private.record_multiplayer_telemetry_roll(
        new.match_id, next_player_id, new.current_roll
      );
    end if;

    if new.status = 'terminal' and new.termination_reason = 'king-captured'
        and new.winner_player_id is not null then
      update private.multiplayer_match_player_telemetry telemetry
      set kings_captured = 1, updated_at = now()
      where telemetry.match_id = new.match_id
        and telemetry.player_id = new.winner_player_id;
    end if;
    if new.status = 'terminal' then
      perform private.finalize_multiplayer_career_telemetry(new);
    end if;
  end if;
  return new;
end;
$$;

-- Existing active matches begin at zero at the deployment boundary. Their
-- already-visible roll and elapsed pre-migration clock time are not inferred.
insert into private.multiplayer_match_player_telemetry(
  match_id, player_id, match_mode, player_side, tracking_started_at
)
select match.match_id, participant.player_id, match.mode, participant.side, now()
from private.multiplayer_matches match
cross join lateral (values
  (match.white_player_id, 'white'), (match.black_player_id, 'black')
) participant(player_id, side)
where match.status = 'active' and participant.player_id is not null
on conflict (match_id, player_id) do nothing;

drop trigger if exists capture_multiplayer_match_telemetry on private.multiplayer_matches;
create trigger capture_multiplayer_match_telemetry
after update on private.multiplayer_matches
for each row execute function private.capture_multiplayer_match_telemetry();

revoke all on function private.empty_multiplayer_piece_counters() from public, anon, authenticated;
revoke all on function private.valid_multiplayer_piece_counters(jsonb) from public, anon, authenticated;
revoke all on function private.increment_multiplayer_piece_counter(jsonb,text,bigint) from public, anon, authenticated;
revoke all on function private.record_multiplayer_telemetry_roll(uuid,uuid,text[]) from public, anon, authenticated;
revoke all on function private.finalize_multiplayer_career_telemetry(private.multiplayer_matches) from public, anon, authenticated;
revoke all on function private.capture_multiplayer_match_telemetry() from public, anon, authenticated;

commit;
