-- Profile Statistics Phase 5A: canonical multiplayer aggregates.
begin;

alter table public.player_ratings
  add column unranked_games integer not null default 0;
alter table public.player_ratings
  add constraint player_ratings_unranked_games_nonnegative check (unranked_games >= 0);

create table private.unranked_match_completions (
  match_id uuid primary key references private.multiplayer_matches(match_id) on delete restrict,
  player_a_id uuid not null references public.players(player_id) on delete restrict,
  player_b_id uuid not null references public.players(player_id) on delete restrict,
  termination_reason text not null check (termination_reason in (
    'king-captured', 'timeout', 'forfeit', 'disconnect-forfeit'
  )),
  recorded_at timestamptz not null default now(),
  check (player_a_id <> player_b_id)
);

alter table private.unranked_match_completions enable row level security;
revoke all on private.unranked_match_completions from public, anon, authenticated;

-- The retained canonical match row is sufficient for deterministic backfill.
-- Only rows whose mode, terminal status, winner and non-technical outcome agree
-- are accepted; incomplete/technical history is deliberately not inferred.
insert into private.unranked_match_completions (
  match_id, player_a_id, player_b_id, termination_reason, recorded_at
)
select match.match_id, match.player_a_id, match.player_b_id,
  match.termination_reason, match.updated_at
from private.multiplayer_matches match
where match.mode = 'unranked'
  and match.status = 'terminal'
  and match.winner_player_id in (match.player_a_id, match.player_b_id)
  and match.termination_reason in (
    'king-captured', 'timeout', 'forfeit', 'disconnect-forfeit'
  )
on conflict (match_id) do nothing;

update public.player_ratings rating
set unranked_games = (
  select count(*)::integer
  from private.unranked_match_completions completion
  where rating.player_id in (completion.player_a_id, completion.player_b_id)
);

create or replace function private.record_unranked_match_completion(
  match_row private.multiplayer_matches
) returns boolean language plpgsql security definer set search_path = '' as $$
declare inserted_count integer; updated_count integer;
begin
  if match_row.mode <> 'unranked'
      or match_row.status <> 'terminal'
      or match_row.winner_player_id is null
      or match_row.winner_player_id not in (match_row.player_a_id, match_row.player_b_id)
      or match_row.termination_reason is null
      or match_row.termination_reason not in (
        'king-captured', 'timeout', 'forfeit', 'disconnect-forfeit'
      ) then
    return false;
  end if;

  insert into private.unranked_match_completions (
    match_id, player_a_id, player_b_id, termination_reason
  ) values (
    match_row.match_id, match_row.player_a_id, match_row.player_b_id,
    match_row.termination_reason
  ) on conflict (match_id) do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then return false; end if;

  update public.player_ratings rating
  set unranked_games = rating.unranked_games + 1
  where rating.player_id in (match_row.player_a_id, match_row.player_b_id);
  get diagnostics updated_count = row_count;
  if updated_count <> 2 then
    raise exception 'canonical multiplayer rating rows are missing' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

create or replace function private.settle_multiplayer_match_if_eligible(
  match_row private.multiplayer_matches
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if match_row.mode = 'ranked'
      and match_row.status = 'terminal'
      and match_row.winner_player_id is not null
      and match_row.termination_reason in (
        'king-captured', 'timeout', 'forfeit', 'disconnect-forfeit'
      ) then
    perform private.settle_ranked_match(
      match_row.match_id,
      'multiplayer-ranked',
      match_row.player_a_id,
      match_row.player_b_id,
      match_row.winner_player_id,
      case when match_row.termination_reason in ('forfeit', 'disconnect-forfeit')
        then 'forfeit' else 'normal' end
    );
  elsif match_row.mode = 'unranked' then
    perform private.record_unranked_match_completion(match_row);
  end if;
end;
$$;

create or replace function private.current_player_profile_json()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'schemaVersion', 1,
    'playerId', player.player_id,
    'displayName', player.display_name,
    'publicDiscriminator', player.public_discriminator,
    'usernameOnboardingRequired', player.username_onboarding_required,
    'ownershipKind', player.ownership_kind,
    'lifecycle', player.lifecycle,
    'createdAt', player.created_at,
    'progression', to_jsonb(progression) - 'player_id' - 'updated_at',
    'pieceStatistics', coalesce((
      select jsonb_object_agg(statistic.piece_type, jsonb_build_object(
        'rolls', statistic.rolls,
        'moves', statistic.moves,
        'captures', statistic.captures
      ))
      from public.player_piece_statistics statistic
      where statistic.player_id = player.player_id
    ), '{}'::jsonb),
    'rating', jsonb_build_object(
      'multiplayerRating', rating.multiplayer_rating,
      'ratedGames', rating.rated_games,
      'rankedWins', rating.ranked_wins,
      'rankedLosses', rating.ranked_losses,
      'rankedWinRate', rating.ranked_win_rate,
      'unrankedGames', rating.unranked_games,
      'ratingVersion', rating.rating_version
    ),
    'bootstrapApplied', exists(
      select 1 from public.local_profile_bootstraps bootstrap
      where bootstrap.player_id = player.player_id
    )
  )
  from public.players player
  join public.player_progression progression using (player_id)
  join public.player_ratings rating using (player_id)
  where player.player_id = private.current_player_id()
    and player.lifecycle = 'active';
$$;

revoke all on function private.record_unranked_match_completion(private.multiplayer_matches)
  from public, anon, authenticated;
revoke all on function private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)
  from public, anon, authenticated;
revoke all on function private.current_player_profile_json()
  from public, anon, authenticated;
grant execute on function private.record_unranked_match_completion(private.multiplayer_matches),
  private.settle_multiplayer_match_if_eligible(private.multiplayer_matches)
  to service_role;

commit;
