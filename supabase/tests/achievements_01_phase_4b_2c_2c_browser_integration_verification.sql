-- ACHIEVEMENTS-01 Phase 4B-2C-2C, Stage C-1.
-- Read-only SQL Editor snapshot for ONE newly designated test PlayerId.
-- Replace NULL::uuid below with '<test-player-uuid>'::uuid locally; never paste
-- the UUID, auth token, or full browser storage into a shared report.
-- Run once before gameplay and again after each approved browser scenario.
-- Admin SQL Editor reads do NOT prove authenticated RPC access.
begin transaction read only;

with params as (
  select NULL::uuid as test_player_id
), target as (
  select p.player_id,p.ownership_kind,p.lifecycle
  from public.players p join params on p.player_id = params.test_player_id
), snapshot as (
  select jsonb_build_object(
    'parameterConfigured',params.test_player_id is not null,
    'testPlayerFound',exists(select 1 from target),
    'player',(
      select jsonb_build_object(
        'fingerprint',encode(substring(extensions.digest(t.player_id::text,'sha256') from 1 for 6),'hex'),
        'ownershipKind',t.ownership_kind,
        'lifecycle',t.lifecycle,
        'ownerRowCount',(select count(*) from public.player_auth_owners o where o.player_id=t.player_id)
      ) from target t
    ),
    'progression',(
      select jsonb_build_object(
        'totalXp',p.total_xp,'gamesPlayed',p.games_played,
        'wins',p.wins,'losses',p.losses,
        'kingsCaptured',p.kings_captured,
        'rouletteRolls',p.roulette_rolls
      ) from public.player_progression p join target t on t.player_id=p.player_id
    ),
    'operationCount',(
      select count(*) from public.player_progression_operations o
      join target t on t.player_id=o.player_id
    ),
    'operations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'operationFingerprint',encode(substring(extensions.digest(o.operation_id::text,'sha256') from 1 for 6),'hex'),
        'appliedAt',o.applied_at,
        'linkedMatchCount',(
          select count(*) from private.player_singleplayer_match_completions m
          where m.player_id=o.player_id and m.operation_id=o.operation_id
        )
      ) order by o.applied_at,o.operation_id)
      from public.player_progression_operations o
      join target t on t.player_id=o.player_id
    ),'[]'::jsonb),
    'singleMatchCount',(
      select count(*) from private.player_singleplayer_match_completions m
      join target t on t.player_id=m.player_id
    ),
    'singleMatches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'matchFingerprint',encode(substring(extensions.digest(m.match_id::text,'sha256') from 1 for 6),'hex'),
        'operationFingerprint',encode(substring(extensions.digest(m.operation_id::text,'sha256') from 1 for 6),'hex'),
        'completedAt',m.completed_at,
        'schemaVersion',m.completion_payload->>'schemaVersion',
        'terminationReason',m.completion_payload->'snapshot'->>'terminationReason',
        'winner',m.completion_payload->'snapshot'->>'winner',
        'operationLedgerLinked',exists(
          select 1 from public.player_progression_operations o
          where o.player_id=m.player_id and o.operation_id=m.operation_id
        ),
        'payloadHashMatches',m.payload_hash=extensions.digest(m.completion_payload::text,'sha256'),
        'matchUnlockCount',(
          select count(*) from private.player_achievement_unlocks u
          where u.player_id=m.player_id and u.source_type='singleplayer-match'
            and u.source_id=m.match_id
        )
      ) order by m.completed_at,m.match_id)
      from private.player_singleplayer_match_completions m
      join target t on t.player_id=m.player_id
    ),'[]'::jsonb),
    'unlockCount',(
      select count(*) from private.player_achievement_unlocks u
      join target t on t.player_id=u.player_id
    ),
    'unlocks',coalesce((
      select jsonb_agg(jsonb_build_object(
        'achievementId',u.achievement_id,
        'sourceType',u.source_type,
        'sourceFingerprint',encode(substring(extensions.digest(u.source_id::text,'sha256') from 1 for 6),'hex'),
        'catalogVersion',u.catalog_version,
        'unlockedAt',u.unlocked_at
      ) order by u.unlocked_at,u.achievement_id)
      from private.player_achievement_unlocks u
      join target t on t.player_id=u.player_id
    ),'[]'::jsonb)
  ) as result
  from params
)
select result from snapshot;

commit;
