-- Read-only inventory. It does not mutate multiplayer or player data.
-- The first result targets the manually reported account by public discriminator.
select
  p.display_name,
  p.public_discriminator,
  membership.player_id,
  membership.joined_at as membership_joined_at,
  membership.lobby_id as membership_lobby_id,
  membership.match_id as membership_match_id,
  lobby.lobby_id,
  lobby.status as lobby_status,
  lobby.visibility,
  lobby.host_player_id,
  lobby.opponent_player_id,
  lobby.expires_at as lobby_expires_at,
  lobby.created_at as lobby_created_at,
  lobby.updated_at as lobby_updated_at,
  match.match_id,
  match.status as match_status,
  match.revision as match_revision,
  match.player_a_id,
  match.player_b_id,
  match.white_player_id,
  match.black_player_id,
  match.activated_at,
  match.updated_at as match_updated_at,
  match.canonical_state is not null as has_canonical_state,
  match.current_roll is not null as has_current_roll,
  match.current_turn is not null as has_current_turn,
  match.termination_reason,
  case
    when membership.lobby_id is not null and lobby.lobby_id is null then 'missing-lobby'
    when membership.match_id is not null and match.match_id is null then 'missing-match'
    when lobby.status = 'closed' then 'closed-lobby-membership'
    when match.status in ('terminal', 'technical-abort') then 'terminal-match-membership'
    when membership.lobby_id is not null
      and membership.player_id not in (lobby.host_player_id, lobby.opponent_player_id) then 'lobby-nonparticipant'
    when membership.match_id is not null
      and membership.player_id not in (match.player_a_id, match.player_b_id) then 'match-nonparticipant'
    when lobby.status = 'starting' and match.match_id is null then 'starting-without-match'
    when lobby.status = 'starting' and match.status = 'initializing'
      and match.updated_at < now() - interval '5 minutes' then 'stale-starting'
    when match.status = 'active' and match.canonical_state is null then 'active-without-canonical-state'
    when match.status = 'active' and match.current_roll is null then 'active-without-roll'
    else 'apparently-consistent'
  end as classification
from private.multiplayer_active_participants membership
join public.players p on p.player_id = membership.player_id
left join private.multiplayer_lobbies lobby
  on lobby.lobby_id = coalesce(membership.lobby_id, (
    select linked_match.lobby_id from private.multiplayer_matches linked_match
    where linked_match.match_id = membership.match_id
  ))
left join private.multiplayer_matches match
  on match.match_id = membership.match_id
  or (membership.lobby_id is not null and match.lobby_id = membership.lobby_id)
where p.public_discriminator = 'HMORC';

-- Aggregate anomaly inventory; IDs/codes are intentionally omitted.
with classified as (
  select case
    when membership.lobby_id is not null and lobby.lobby_id is null then 'missing-lobby'
    when membership.match_id is not null and match.match_id is null then 'missing-match'
    when lobby.status = 'closed' then 'closed-lobby-membership'
    when match.status in ('terminal', 'technical-abort') then 'terminal-match-membership'
    when membership.lobby_id is not null
      and membership.player_id not in (lobby.host_player_id, lobby.opponent_player_id) then 'lobby-nonparticipant'
    when membership.match_id is not null
      and membership.player_id not in (match.player_a_id, match.player_b_id) then 'match-nonparticipant'
    when lobby.status = 'starting' and match.match_id is null then 'starting-without-match'
    when lobby.status = 'starting' and match.status = 'initializing'
      and match.updated_at < now() - interval '5 minutes' then 'stale-starting'
    when match.status = 'active' and (match.canonical_state is null or match.current_roll is null)
      then 'invalid-active-match'
    else 'apparently-consistent'
  end as classification
  from private.multiplayer_active_participants membership
  left join private.multiplayer_lobbies lobby on lobby.lobby_id = membership.lobby_id
  left join private.multiplayer_matches match on match.match_id = membership.match_id
    or (membership.lobby_id is not null and match.lobby_id = membership.lobby_id)
)
select classification, count(*) as membership_count
from classified
group by classification
order by classification;

-- Stale STARTING entities grouped by lobby/match. No auth identity, private
-- code, profile progression, or rating data is selected.
select
  lobby.lobby_id,
  match.match_id,
  lobby.status as lobby_status,
  lobby.visibility,
  match.status as match_status,
  match.revision,
  match.updated_at as match_updated_at,
  match.activated_at,
  match.canonical_state is not null as has_canonical_state,
  match.current_roll is not null as has_current_roll,
  match.current_turn is not null as has_current_turn,
  match.termination_reason,
  count(membership.player_id) as active_membership_count,
  array_agg(player.display_name || ' #' || player.public_discriminator order by player.player_id) as participants
from private.multiplayer_lobbies lobby
join private.multiplayer_matches match on match.lobby_id = lobby.lobby_id
join private.multiplayer_active_participants membership
  on membership.lobby_id = lobby.lobby_id or membership.match_id = match.match_id
join public.players player on player.player_id = membership.player_id
where lobby.status = 'starting'
  and match.status = 'initializing'
  and match.updated_at < now() - interval '5 minutes'
group by lobby.lobby_id, match.match_id, lobby.status, lobby.visibility,
  match.status, match.revision, match.updated_at, match.activated_at,
  match.canonical_state, match.current_roll, match.current_turn, match.termination_reason
order by match.updated_at;
