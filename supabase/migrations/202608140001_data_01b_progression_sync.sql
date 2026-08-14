-- DATA-01B: replay-safe casual progression operations. Apply once after DATA-01A.
begin;

create table public.player_progression_operations (
  player_id uuid not null references public.players(player_id) on delete cascade,
  operation_id uuid not null,
  payload_hash bytea not null,
  applied_at timestamptz not null default now(),
  primary key (player_id, operation_id)
);

create index player_progression_operations_applied_idx
  on public.player_progression_operations (applied_at);

alter table public.player_progression_operations enable row level security;
revoke all on public.player_progression_operations from public, anon, authenticated;

create or replace function private.current_player_profile_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'playerId', p.player_id,
    'displayName', p.display_name,
    'ownershipKind', p.ownership_kind,
    'lifecycle', p.lifecycle,
    'createdAt', p.created_at,
    'progression', to_jsonb(g) - 'player_id' - 'updated_at',
    'pieceStatistics', coalesce((
      select jsonb_object_agg(s.piece_type, jsonb_build_object(
        'rolls', s.rolls, 'moves', s.moves, 'captures', s.captures
      )) from public.player_piece_statistics s where s.player_id=p.player_id
    ), '{}'::jsonb),
    'rating', jsonb_build_object(
      'multiplayerRating', r.multiplayer_rating,
      'ratedGames', r.rated_games,
      'ratingVersion', r.rating_version
    ),
    'bootstrapApplied', exists(
      select 1 from public.local_profile_bootstraps b where b.player_id=p.player_id
    )
  )
  from public.players p
  join public.player_progression g using(player_id)
  join public.player_ratings r using(player_id)
  where p.player_id=private.current_player_id() and p.lifecycle='active';
$$;

create or replace function public.get_current_player_profile()
returns jsonb language sql stable security definer set search_path = '' as $$
  select private.current_player_profile_json();
$$;

create or replace function public.apply_player_progression_operation(
  requested_operation_id uuid,
  operation jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target uuid := private.current_player_id();
  operation_hash bytea := extensions.digest(operation::text, 'sha256');
  existing_hash bytea;
  piece_name text;
  scalar_name text;
  allowed_keys constant text[] := array[
    'xpDelta','gamesDelta','winsDelta','lossesDelta','playTimeSecondsDelta',
    'kingsCapturedDelta','rouletteRollsDelta','playerTurnsCompletedDelta',
    'threeRightsTurnsDelta','triplePawnRollsDelta','tripleKnightRollsDelta',
    'tripleQueenRollsDelta','rollsByPieceDelta','movesByPieceDelta',
    'capturesByPieceDelta'
  ];
begin
  if target is null then raise exception 'player not found' using errcode='P0002'; end if;
  if requested_operation_id is null or jsonb_typeof(operation)<>'object' then
    raise exception 'invalid progression operation' using errcode='22023';
  end if;
  if exists (select 1 from jsonb_object_keys(operation) key where not (key=any(allowed_keys))) then
    raise exception 'unsupported progression field' using errcode='22023';
  end if;
  if (operation->>'gamesDelta')::integer <> 1
      or (operation->>'winsDelta')::integer + (operation->>'lossesDelta')::integer <> 1
      or (operation->>'xpDelta')::integer not between 0 and 10000
      or (operation->>'playTimeSecondsDelta')::integer not between 0 and 86400 then
    raise exception 'invalid match progression delta' using errcode='22023';
  end if;
  foreach scalar_name in array array[
    'kingsCapturedDelta','rouletteRollsDelta','playerTurnsCompletedDelta',
    'threeRightsTurnsDelta','triplePawnRollsDelta','tripleKnightRollsDelta',
    'tripleQueenRollsDelta'
  ] loop
    if coalesce((operation->>scalar_name)::integer, 0) not between 0 and 10000 then
      raise exception 'invalid progression counter delta' using errcode='22023';
    end if;
  end loop;
  if jsonb_typeof(coalesce(operation->'rollsByPieceDelta','{}'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(operation->'movesByPieceDelta','{}'::jsonb)) <> 'object'
      or jsonb_typeof(coalesce(operation->'capturesByPieceDelta','{}'::jsonb)) <> 'object' then
    raise exception 'invalid piece progression maps' using errcode='22023';
  end if;
  foreach piece_name in array array['pawn','knight','bishop','rook','queen','king'] loop
    if coalesce((operation->'rollsByPieceDelta'->>piece_name)::integer,0) not between 0 and 1000
        or coalesce((operation->'movesByPieceDelta'->>piece_name)::integer,0) not between 0 and 1000
        or coalesce((operation->'capturesByPieceDelta'->>piece_name)::integer,0) not between 0 and 1000 then
      raise exception 'invalid piece progression delta' using errcode='22023';
    end if;
  end loop;

  perform 1 from public.player_progression where player_id=target for update;
  select payload_hash into existing_hash from public.player_progression_operations
    where player_id=target and operation_id=requested_operation_id;
  if existing_hash is not null then
    if existing_hash<>operation_hash then
      raise exception 'operation id was already used with another payload' using errcode='23505';
    end if;
    return private.current_player_profile_json();
  end if;

  insert into public.player_progression_operations(player_id,operation_id,payload_hash)
    values(target,requested_operation_id,operation_hash);
  update public.player_progression set
    total_xp=total_xp+(operation->>'xpDelta')::integer,
    games_played=games_played+1,
    wins=wins+(operation->>'winsDelta')::integer,
    losses=losses+(operation->>'lossesDelta')::integer,
    current_win_streak=case when (operation->>'winsDelta')::integer=1 then current_win_streak+1 else 0 end,
    best_win_streak=greatest(best_win_streak,
      case when (operation->>'winsDelta')::integer=1 then current_win_streak+1 else best_win_streak end),
    total_play_time_seconds=total_play_time_seconds+(operation->>'playTimeSecondsDelta')::integer,
    kings_captured=kings_captured+(operation->>'kingsCapturedDelta')::integer,
    roulette_rolls=roulette_rolls+(operation->>'rouletteRollsDelta')::integer,
    player_turns_completed=player_turns_completed+(operation->>'playerTurnsCompletedDelta')::integer,
    three_rights_turns=three_rights_turns+(operation->>'threeRightsTurnsDelta')::integer,
    triple_pawn_rolls=triple_pawn_rolls+(operation->>'triplePawnRollsDelta')::integer,
    triple_knight_rolls=triple_knight_rolls+(operation->>'tripleKnightRollsDelta')::integer,
    triple_queen_rolls=triple_queen_rolls+(operation->>'tripleQueenRollsDelta')::integer,
    updated_at=now()
    where player_id=target;
  foreach piece_name in array array['pawn','knight','bishop','rook','queen','king'] loop
    update public.player_piece_statistics set
      rolls=rolls+coalesce((operation->'rollsByPieceDelta'->>piece_name)::integer,0),
      moves=moves+coalesce((operation->'movesByPieceDelta'->>piece_name)::integer,0),
      captures=captures+coalesce((operation->'capturesByPieceDelta'->>piece_name)::integer,0)
      where player_id=target and piece_type=piece_name;
  end loop;
  return private.current_player_profile_json();
end;
$$;

revoke all on function private.current_player_profile_json() from public, anon, authenticated;
revoke all on function public.get_current_player_profile() from public, anon, authenticated;
revoke all on function public.apply_player_progression_operation(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.get_current_player_profile(),
  public.apply_player_progression_operation(uuid,jsonb) to authenticated;

commit;
