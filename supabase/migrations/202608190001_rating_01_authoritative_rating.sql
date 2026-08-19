-- RATING-01: trusted, transactional and idempotent ranked rating settlement.
-- This function is intentionally outside the browser-exposed public schema.
begin;

alter table public.player_ratings
  add constraint player_ratings_multiplayer_rating_nonnegative
  check (multiplayer_rating >= 0) not valid;

alter table public.player_ratings
  validate constraint player_ratings_multiplayer_rating_nonnegative;

create table private.rating_settlements (
  match_id uuid primary key,
  match_mode text not null check (match_mode = 'multiplayer-ranked'),
  player_a_id uuid not null references public.players(player_id) on delete restrict,
  player_b_id uuid not null references public.players(player_id) on delete restrict,
  winner_id uuid not null references public.players(player_id) on delete restrict,
  termination_reason text not null check (termination_reason in ('normal', 'forfeit')),
  player_a_rating_before integer not null check (player_a_rating_before >= 0),
  player_b_rating_before integer not null check (player_b_rating_before >= 0),
  player_a_rating_after integer not null check (player_a_rating_after >= 0),
  player_b_rating_after integer not null check (player_b_rating_after >= 0),
  player_a_delta integer not null,
  player_b_delta integer not null,
  nominal_movement integer not null check (nominal_movement between 5 and 25),
  effective_difference integer not null check (effective_difference between 0 and 200),
  formula_version integer not null default 1 check (formula_version = 1),
  settled_at timestamptz not null default now(),
  check (player_a_id <> player_b_id),
  check (winner_id in (player_a_id, player_b_id)),
  check (player_a_rating_after - player_a_rating_before = player_a_delta),
  check (player_b_rating_after - player_b_rating_before = player_b_delta)
);

comment on table private.rating_settlements is
  'Append-only authoritative rating ledger and match-id idempotency boundary.';

create or replace function private.settle_ranked_match(
  requested_match_id uuid,
  requested_match_mode text,
  requested_player_a_id uuid,
  requested_player_b_id uuid,
  requested_winner_id uuid,
  requested_termination_reason text
) returns table (
  match_id uuid,
  player_a_id uuid,
  player_b_id uuid,
  winner_id uuid,
  player_a_rating_before integer,
  player_b_rating_before integer,
  player_a_rating_after integer,
  player_b_rating_after integer,
  player_a_delta integer,
  player_b_delta integer,
  nominal_movement integer,
  effective_difference integer,
  floor_applied boolean
) language plpgsql security definer set search_path = '' as $$
declare
  existing private.rating_settlements%rowtype;
  locked_count integer;
  a_before integer;
  b_before integer;
  a_after integer;
  b_after integer;
  a_delta integer;
  b_delta integer;
  capped_difference integer;
  movement integer;
  favorite_won boolean;
begin
  if requested_match_id is null then
    raise exception 'authoritative match id is required' using errcode = '22023';
  end if;
  if requested_match_mode is distinct from 'multiplayer-ranked' then
    raise exception 'only ranked multiplayer results are rating eligible' using errcode = '22023';
  end if;
  if requested_player_a_id is null or requested_player_b_id is null
      or requested_player_a_id = requested_player_b_id then
    raise exception 'two distinct PlayerIds are required' using errcode = '22023';
  end if;
  if requested_winner_id is null
      or requested_winner_id not in (requested_player_a_id, requested_player_b_id) then
    raise exception 'winner must be a match participant' using errcode = '22023';
  end if;
  if requested_termination_reason is null
      or requested_termination_reason not in ('normal', 'forfeit') then
    raise exception 'technical aborts and unsupported outcomes are not rating eligible'
      using errcode = '22023';
  end if;

  -- Serializes retries for one authoritative match before checking the ledger.
  perform pg_advisory_xact_lock(hashtextextended(requested_match_id::text, 1));

  select settlement.* into existing
  from private.rating_settlements settlement
  where settlement.match_id = requested_match_id;

  if existing.match_id is not null then
    if existing.match_mode <> requested_match_mode
        or existing.player_a_id <> requested_player_a_id
        or existing.player_b_id <> requested_player_b_id
        or existing.winner_id <> requested_winner_id
        or existing.termination_reason <> requested_termination_reason then
      raise exception 'match id was already settled with a different result' using errcode = '23505';
    end if;
    return query select
      existing.match_id, existing.player_a_id, existing.player_b_id, existing.winner_id,
      existing.player_a_rating_before, existing.player_b_rating_before,
      existing.player_a_rating_after, existing.player_b_rating_after,
      existing.player_a_delta, existing.player_b_delta, existing.nominal_movement,
      existing.effective_difference,
      existing.player_a_delta + existing.player_b_delta <> 0;
    return;
  end if;

  -- Stable UUID ordering prevents deadlocks between concurrent settlements.
  perform rating.player_id
  from public.player_ratings rating
  where rating.player_id in (requested_player_a_id, requested_player_b_id)
  order by rating.player_id
  for update;
  get diagnostics locked_count = row_count;
  if locked_count <> 2 then
    raise exception 'authoritative rating rows were not found' using errcode = 'P0002';
  end if;

  select rating.multiplayer_rating into a_before
  from public.player_ratings rating where rating.player_id = requested_player_a_id;
  select rating.multiplayer_rating into b_before
  from public.player_ratings rating where rating.player_id = requested_player_b_id;

  capped_difference := least(abs(a_before - b_before), 200);
  favorite_won := a_before <> b_before and (
    (a_before > b_before and requested_winner_id = requested_player_a_id)
    or (b_before > a_before and requested_winner_id = requested_player_b_id)
  );
  movement := round((15 + case
    when a_before = b_before then 0
    when favorite_won then -(capped_difference / 20.0)
    else capped_difference / 20.0
  end)::numeric)::integer;

  if requested_winner_id = requested_player_a_id then
    if a_before > 2147483647 - movement then
      raise exception 'winner rating exceeds the supported integer range' using errcode = '22003';
    end if;
    a_after := a_before + movement;
    b_after := greatest(0, b_before - movement);
  else
    if b_before > 2147483647 - movement then
      raise exception 'winner rating exceeds the supported integer range' using errcode = '22003';
    end if;
    a_after := greatest(0, a_before - movement);
    b_after := b_before + movement;
  end if;
  a_delta := a_after - a_before;
  b_delta := b_after - b_before;

  update public.player_ratings rating set
    multiplayer_rating = case
      when rating.player_id = requested_player_a_id then a_after else b_after end,
    rated_games = rating.rated_games + 1,
    rating_version = rating.rating_version + 1,
    rating_updated_at = now()
  where rating.player_id in (requested_player_a_id, requested_player_b_id);

  insert into private.rating_settlements (
    match_id, match_mode, player_a_id, player_b_id, winner_id, termination_reason,
    player_a_rating_before, player_b_rating_before,
    player_a_rating_after, player_b_rating_after,
    player_a_delta, player_b_delta, nominal_movement, effective_difference
  ) values (
    requested_match_id, requested_match_mode, requested_player_a_id, requested_player_b_id,
    requested_winner_id, requested_termination_reason, a_before, b_before, a_after, b_after,
    a_delta, b_delta, movement, capped_difference
  );

  return query select
    requested_match_id, requested_player_a_id, requested_player_b_id, requested_winner_id,
    a_before, b_before, a_after, b_after, a_delta, b_delta, movement, capped_difference,
    a_delta + b_delta <> 0;
end;
$$;

revoke all on table private.rating_settlements from public, anon, authenticated;
revoke all on function private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.settle_ranked_match(uuid,text,uuid,uuid,uuid,text)
  to service_role;

commit;
