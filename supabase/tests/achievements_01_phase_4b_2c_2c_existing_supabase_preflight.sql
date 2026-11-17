-- ACHIEVEMENTS-01 Phase 4B-2C-2C, Stage A/B read-only preflight.
-- Run manually in the Supabase SQL Editor. No fixtures, writes, or secrets.
-- SQL Editor's admin role is NOT equivalent to an authenticated browser JWT.
begin transaction read only;

with checks(check_name, expected, actual, passed, details) as (
  select 'players table', 'present',
    coalesce(to_regclass('public.players')::text, 'missing'),
    to_regclass('public.players') is not null,
    'Canonical player rows; no identifiers are returned'
  union all select 'auth ownership table', 'present',
    coalesce(to_regclass('public.player_auth_owners')::text, 'missing'),
    to_regclass('public.player_auth_owners') is not null,
    'auth.uid() to canonical PlayerId mapping'
  union all select 'progression table', 'present',
    coalesce(to_regclass('public.player_progression')::text, 'missing'),
    to_regclass('public.player_progression') is not null,
    'Canonical progression projection'
  union all select 'progression operation ledger', 'present',
    coalesce(to_regclass('public.player_progression_operations')::text, 'missing'),
    to_regclass('public.player_progression_operations') is not null,
    'Operation-level idempotency ledger'
  union all select 'single-match completion ledger', 'present',
    coalesce(to_regclass('private.player_singleplayer_match_completions')::text, 'missing'),
    to_regclass('private.player_singleplayer_match_completions') is not null,
    'Match-level idempotency ledger'
  union all select 'achievement unlock ledger', 'present',
    coalesce(to_regclass('private.player_achievement_unlocks')::text, 'missing'),
    to_regclass('private.player_achievement_unlocks') is not null,
    'Canonical achievement unlock storage'
  union all select 'current player resolver', 'present',
    coalesce(to_regprocedure('private.current_player_id()')::text, 'missing'),
    to_regprocedure('private.current_player_id()') is not null,
    'Must resolve caller rather than accept a client PlayerId'
  union all select 'progression RPC', 'present',
    coalesce(to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::text, 'missing'),
    to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)') is not null,
    'Authenticated browser progression entry point'
  union all select 'achievement read RPC', 'present',
    coalesce(to_regprocedure('public.get_current_player_achievements()')::text, 'missing'),
    to_regprocedure('public.get_current_player_achievements()') is not null,
    'Caller-scoped achievement read model'
  union all select 'single-match validator', 'present',
    coalesce(to_regprocedure('private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)')::text, 'missing'),
    to_regprocedure('private.validate_singleplayer_match_completion(uuid,jsonb,jsonb)') is not null,
    'Payload validation helper'
  union all select 'single-match evaluator', 'present',
    coalesce(to_regprocedure('private.evaluate_single_match_achievements(jsonb)')::text, 'missing'),
    to_regprocedure('private.evaluate_single_match_achievements(jsonb)') is not null,
    'Server-side eligibility evaluator'
  union all select 'single-match unlock trigger function', 'present',
    coalesce(to_regprocedure('private.persist_single_match_achievement_unlocks()')::text, 'missing'),
    to_regprocedure('private.persist_single_match_achievement_unlocks()') is not null,
    'Atomic ledger-to-unlock projection'
  union all select 'RPC match advisory lock', 'present',
    case when coalesce(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid
    ) like '%pg_advisory_xact_lock%', false) then 'present' else 'missing' end,
    coalesce(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid
    ) like '%pg_advisory_xact_lock%', false),
    'Static body check only; not a two-session concurrency test'
  union all select 'RPC single-match fingerprint', 'present',
    case when coalesce(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid
    ) like '%digest(single_match::text%', false) then 'present' else 'missing' end,
    coalesce(pg_catalog.pg_get_functiondef(
      to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid
    ) like '%digest(single_match::text%', false),
    'SHA-256 match payload fingerprint; progression operation has a separate hash'
  union all select 'match primary key', 'present',
    case when exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('private.player_singleplayer_match_completions')
        and c.contype = 'p'
    ) then 'present' else 'missing' end,
    exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('private.player_singleplayer_match_completions')
        and c.contype = 'p'
    ),
    'One completion per match ID'
  union all select 'owner-operation uniqueness', 'present',
    case when exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('private.player_singleplayer_match_completions')
        and c.conname = 'player_singleplayer_match_completions_operation_unique'
        and c.contype = 'u'
    ) then 'present' else 'missing' end,
    exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('private.player_singleplayer_match_completions')
        and c.conname = 'player_singleplayer_match_completions_operation_unique'
        and c.contype = 'u'
    ),
    'One operation identity per owner'
  union all select 'unlock primary key', 'present',
    case when exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('private.player_achievement_unlocks')
        and c.contype = 'p'
    ) then 'present' else 'missing' end,
    exists (
      select 1 from pg_catalog.pg_constraint c
      where c.conrelid = to_regclass('private.player_achievement_unlocks')
        and c.contype = 'p'
    ),
    'One unlock per owner and achievement'
  union all select 'ledger-to-unlock trigger', 'O or A',
    coalesce((select t.tgenabled::text from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('private.player_singleplayer_match_completions')
        and t.tgname = 'persist_single_match_achievement_unlocks'
        and not t.tgisinternal), 'missing'),
    exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = to_regclass('private.player_singleplayer_match_completions')
        and t.tgname = 'persist_single_match_achievement_unlocks'
        and t.tgenabled in ('O','A') and not t.tgisinternal),
    'O or A means trigger is active in normal sessions'
  union all select 'pgcrypto extension', 'present',
    case when exists (select 1 from pg_catalog.pg_extension where extname = 'pgcrypto')
      then 'present' else 'missing' end,
    exists (select 1 from pg_catalog.pg_extension where extname = 'pgcrypto'),
    'Digest support for immutable payload fingerprint'
  union all select 'match ledger RLS', 'enabled',
    case when exists (select 1 from pg_catalog.pg_class
      where oid = to_regclass('private.player_singleplayer_match_completions')
        and relrowsecurity) then 'enabled' else 'disabled or missing' end,
    exists (select 1 from pg_catalog.pg_class
      where oid = to_regclass('private.player_singleplayer_match_completions')
        and relrowsecurity),
    'Admin SQL Editor bypass is not an authenticated browser authorization test'
  union all select 'unlock ledger RLS', 'enabled',
    case when exists (select 1 from pg_catalog.pg_class
      where oid = to_regclass('private.player_achievement_unlocks')
        and relrowsecurity) then 'enabled' else 'disabled or missing' end,
    exists (select 1 from pg_catalog.pg_class
      where oid = to_regclass('private.player_achievement_unlocks')
        and relrowsecurity),
    'Browser roles must not directly read or write private unlocks'
  union all select 'authenticated progression RPC', 'execute',
    case when to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid, 'EXECUTE')
      then 'execute' else 'missing or denied' end,
    to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid, 'EXECUTE'),
    'JWT-bound client entry point'
  union all select 'authenticated achievement read RPC', 'execute',
    case when to_regprocedure('public.get_current_player_achievements()') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.get_current_player_achievements()')::oid, 'EXECUTE')
      then 'execute' else 'missing or denied' end,
    to_regprocedure('public.get_current_player_achievements()') is not null
      and has_function_privilege('authenticated', to_regprocedure('public.get_current_player_achievements()')::oid, 'EXECUTE'),
    'JWT-bound read entry point'
  union all select 'anon progression RPC', 'denied',
    case when to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)') is not null
      and has_function_privilege('anon', to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid, 'EXECUTE')
      then 'execute' else 'denied' end,
    to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)') is null
      or not coalesce(has_function_privilege('anon', to_regprocedure('public.apply_player_progression_operation(uuid,jsonb)')::oid, 'EXECUTE'), false),
    'Anonymous role must not dispatch progression'
  union all select 'anon achievement read RPC', 'denied',
    case when to_regprocedure('public.get_current_player_achievements()') is not null
      and has_function_privilege('anon', to_regprocedure('public.get_current_player_achievements()')::oid, 'EXECUTE')
      then 'execute' else 'denied' end,
    to_regprocedure('public.get_current_player_achievements()') is null
      or not coalesce(has_function_privilege('anon', to_regprocedure('public.get_current_player_achievements()')::oid, 'EXECUTE'), false),
    'Anonymous role must not read player unlocks'
  union all select 'private schema', 'present',
    case when exists (select 1 from pg_catalog.pg_namespace where nspname = 'private')
      then 'present' else 'missing' end,
    exists (select 1 from pg_catalog.pg_namespace where nspname = 'private'),
    'Trusted ledger and evaluator namespace'
  union all select 'Supabase migration registry', 'inspect only',
    coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'missing'),
    true,
    'SQL Editor manual application may not create version rows; object checks above are authoritative here'
)
select check_name, expected, actual, passed, details
from checks order by check_name;

select 'active players' as check_name, count(*)::bigint as aggregate_count
from public.players where lifecycle = 'active'
union all
select 'retired players', count(*)::bigint
from public.players where lifecycle = 'retired'
union all
select 'single-match ledger rows', count(*)::bigint
from private.player_singleplayer_match_completions
union all
select 'achievement unlock rows', count(*)::bigint
from private.player_achievement_unlocks;

commit;
