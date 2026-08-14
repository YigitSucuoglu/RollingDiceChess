# RouletteChess Player Data Model

## Deployment status

`supabase/migrations/202608130001_auth_01c_player_identity.sql`: **APPLIED**.

The developer applied the complete migration exactly once to RouletteChess project `kbtnnknsgobfvyydxbex`; the catalog verification assertions passed. This establishes the database boundary only. Normal application runtime still does not create/synchronize cloud profiles.

## Identity and ownership

`player_id` is the permanent RouletteChess identity. It is distinct from `AccountId`, Supabase `auth.users.id`, Google identity and `display_name`. A rename changes only `display_name`; progression, rating and future match history continue to reference `player_id`.

Supabase Anonymous Auth is the selected cloud Guest strategy. It supplies a server-recognized `auth.uid()` for RLS without email/password. Identity linking can preserve the same auth user and PlayerId. If browser auth storage is cleared, an unlinked Guest may become unrecoverable. A Google identity already owned by another auth user requires a short-lived server-recorded handoff and explicit conflict choice.

Anonymous Sign-Ins are enabled and remote RLS was validated with two disposable anonymous client sessions. The shipped Guest flow nevertheless remains local until DATA-01B deliberately integrates it. Manual identity linking remains disabled and is deferred.

## Persisted model

- `players`: PlayerId, non-unique display name, ownership kind and lifecycle.
- `player_auth_owners`: one auth user to one active PlayerId association.
- `player_progression`: client-originated casual XP and aggregate statistics.
- `player_piece_statistics`: normalized per-piece counters.
- `player_ratings`: separate rating default `1000`; browser roles receive no UPDATE path.
- `local_profile_bootstraps`: schema-versioned bootstrap idempotency ledger.
- `player_migration_intents`: expiring hashed handoff and auditable outcome.

Local `PlayerProfile.playerId` is a source-record identifier, not cloud PlayerId. Display name, XP and statistics are bootstrap inputs. `processedMatchIds` stays local cache/idempotency data. Language, sound, themes and setup preferences remain settings, outside identity.

## Trust and migration boundaries

Singleplayer bot-game XP/statistics are client-originated casual progression. Bot games never change multiplayer rating. Future RATING-01 owns an authoritative ranked-match update path.

RLS exposes only the current owner's private rows. Rename and one-time bootstrap use narrow RPCs. Conflict resolution locks its records and is all-or-nothing/idempotent:

- `USE_GOOGLE_PROFILE`: Google PlayerId survives; Guest PlayerId retires. Values are not added.
- `USE_GUEST_PROFILE`: Guest PlayerId survives; Google ownership moves to it and the previous Google PlayerId retires. Values are not added.

Names are non-unique and never authorization data. Basic length/control/HTML-delimiter validation is applied; moderation and reserved names are deferred.

```text
Supabase Auth session != cloud player rows != local PlayerProfile != settings
```

The local profile remains after bootstrap for recovery. No token, email, provider metadata or raw database row enters player DTOs, MatchSnapshot, local profile storage or Sentry context.

## DATA-01 deployment checklist

1. Review/apply the migration in a non-production Supabase branch/project.
2. Enable Anonymous Sign-Ins and manual identity linking.
3. Verify trigger-created players, rating 1000 and six piece-stat rows.
4. Test RLS as two auth users; cross-player access and direct rating/ownership writes must fail.
5. Verify bootstrap replay, local recovery, same-user Google linking and both conflict choices.
6. Verify concurrent/opposite conflict retries.
7. Only then connect infrastructure/UI and mark remote status **APPLIED**.

Future history references PlayerId, not name. Guests and Google-linked users may both later appear on a rating leaderboard. Multiplayer, RATING-01 and LEADERBOARD-01 are out of scope.

## DATA-01A preflight and operational status

Remote project target: RouletteChess (`kbtnnknsgobfvyydxbex`, Central EU/Frankfurt). The project reference is taken from the developer-provided task context; it was **not authenticated or queried by Codex**. No Supabase CLI, linked local project, database credential, access token or installed local PostgreSQL/Docker runtime was available.

Preflight found and corrected two deployment blockers before any remote DDL:

- existing Supabase Auth users were not backfilled because the original trigger covered only future users;
- the bootstrap RPC copied only XP/games/wins/losses and could silently omit the remaining local statistics.

The migration is now explicitly transactional and one-shot. It installs a uniquely named auth trigger, safely backfills existing Auth users, expands bootstrap into normalized columns from a versioned JSON input, refuses overwrite of a non-empty cloud profile, and keeps bootstrap replay idempotent. Conflict resolution verifies live Guest ownership, locks ownership records, accepts same-decision replay after completion and rejects contradictory/stale operations.

### Security inventory

All seven user-data tables have RLS enabled. `authenticated` receives SELECT only on current-player views of `players`, ownership, progression, piece statistics and ratings. `anon` receives no table/RPC access. Bootstrap/intents receive no direct table grants. The browser receives only the five narrow RPC grants; it receives no direct INSERT/UPDATE/DELETE grant and no rating mutation path.

Every helper/RPC uses `SECURITY DEFINER`, an empty `search_path`, qualified relations, no dynamic SQL and caller identity derived from `auth.uid()`/`auth.jwt()`. Non-RPC helpers live in the non-exposed `private` schema with EXECUTE revoked from browser roles. Public RPCs validate current ownership rather than accepting an arbitrary target PlayerId.

Policy summary:

| Table | Browser operation | Condition |
| --- | --- | --- |
| players | SELECT | owned PlayerId only |
| player_auth_owners | SELECT | `auth_user_id = auth.uid()` |
| player_progression | SELECT | owned PlayerId only |
| player_piece_statistics | SELECT | owned PlayerId only |
| player_ratings | SELECT | owned PlayerId only |
| local_profile_bootstraps | none | SECURITY DEFINER RPC only |
| player_migration_intents | none | SECURITY DEFINER RPC only |

`supabase/tests/data_01a_schema_verification.sql` is a non-destructive post-deployment catalog assertion script. It checks tables, backfill, RLS, policies/functions and forbidden grants. Admin/pgAdmin or Supabase SQL Editor access can bypass RLS and therefore is not evidence of browser-client authorization; two distinct client sessions remain mandatory.

Current operational results:

- Remote migration: **APPLIED** (developer-confirmed).
- Catalog verification SQL: **PASS**.
- Anonymous Sign-Ins: **ENABLED** (developer-confirmed).
- Manual identity linking: **DISABLED / DEFERRED**.
- Two-user own/cross RLS: **PASS** using real publishable-key client sessions.
- Direct player/progression mutation denial: **PASS**.
- Rating and cross-player rating mutation denial: **PASS**; rating remained 1000.
- Ownership theft denial: **PASS**.
- Rename and bootstrap security boundaries: **PASS**.
- Conflict replacement end-to-end: **DEFERRED**.
- Disposable test data: **REMAINS**; Auth user IDs and FK-aware cleanup guidance are recorded in `DATA_01A_RUNBOOK.md`.
