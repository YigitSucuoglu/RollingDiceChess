# DATA-01A Supabase Deployment Runbook

## Target and current state

- Project: RouletteChess
- Expected project reference: `kbtnnknsgobfvyydxbex`
- Region: Central EU (Frankfurt)
- Migration: `supabase/migrations/202608130001_auth_01c_player_identity.sql`
- Remote status: **APPLIED** (developer-confirmed SQL Editor execution)

Never continue if the Dashboard URL/project reference differs. The migration is transactional and intended to be recorded/run once, not used as an idempotent repair script.

## Preflight inventory

| Object | Purpose / invariant |
| --- | --- |
| `player_lifecycle`, `player_ownership_kind`, `profile_conflict_resolution` | constrained state enums |
| `players` | UUID PlayerId PK, non-unique name, lifecycle/replacement checks |
| `player_auth_owners` | auth user PK + unique PlayerId, one-to-one ownership |
| `player_progression` | non-null/non-negative casual progression counters |
| `player_piece_statistics` | PlayerId + six constrained piece types PK |
| `player_ratings` | PlayerId PK, rating default 1000, rating lookup index |
| `local_profile_bootstraps` | PlayerId/source/schema composite idempotency key |
| `player_migration_intents` | hashed unique token, expiry and resolved-state check |
| auth-user trigger | creates normalized rows for future users |
| auth-user backfill | creates normalized rows for existing users in the same transaction |

Foreign keys reference PlayerId or supported `auth.users(id)` without rewriting Supabase Auth data. Duplicate display names are allowed. The migration creates no leaderboard or match rows.

## Function and privilege inventory

| Function | Caller | Result / mutation |
| --- | --- | --- |
| `private.current_player_id()` | definer functions only | resolves `auth.uid()` ownership |
| `private.ensure_player_for_auth_user(uuid, boolean)` | trigger/backfill only | idempotently creates a normalized player |
| `private.handle_roulettechess_auth_user_created()` | Auth trigger only | delegates new-user creation |
| `rename_current_player(text)` | authenticated | validates and changes only own display name |
| `bootstrap_local_profile(jsonb)` | authenticated | one-time normalized local copy; never touches rating |
| `create_guest_upgrade_intent()` | anonymous-authenticated Guest | stores only token hash and returns one-time token |
| `inspect_profile_conflict(text)` | permanent authenticated account | returns minimal Guest/Google summaries |
| `resolve_profile_conflict(text, enum)` | permanent authenticated account | locked, replacement-only conflict transaction |

All functions are `SECURITY DEFINER` with empty `search_path`, qualified relations and no dynamic SQL. Public/anon EXECUTE is revoked. `authenticated` receives only the five public RPCs. Direct INSERT/UPDATE/DELETE is not granted on player tables.

## Safest manual application

1. Open the Supabase Dashboard and select RouletteChess.
2. Confirm the browser URL/project reference is exactly `kbtnnknsgobfvyydxbex`.
3. Open SQL Editor and create one new query named `DATA-01A player schema`.
4. Copy the complete, unchanged migration file into the query.
5. Run it exactly once. The explicit `BEGIN`/`COMMIT` makes statement failure roll back the transaction.
6. Save the successful execution record. Do not rerun the file after success.
7. Open another new query, paste `supabase/tests/data_01a_schema_verification.sql`, and run it.
8. All assertions must pass before enabling runtime integration.
9. In Table Editor verify seven tables; in Database/Functions verify five public RPCs and three private helpers; inspect RLS/policies for all seven tables.
10. Report the exact failing statement and error if either query fails. Do not patch objects manually in Table Editor.

If CLI authentication is later configured, link only after confirming the same ref, use migration history, and never store the access token/database password in the repository.

## Required client-security validation

Use two disposable authenticated client sessions A and B. Admin SQL Editor/pgAdmin normally bypasses RLS and cannot prove these gates.

1. Confirm A and B each read exactly their own player/owner/progression/piece/rating rows.
2. From A, filter B's PlayerId in every table; expect zero rows.
3. Attempt direct UPDATE/INSERT/DELETE for player, progression, owner, intent and rating; expect permission denial.
4. Attempt rating `999999`; expect denial and unchanged rating 1000.
5. Call rename as A; own valid rename succeeds, blank/oversized/control names fail, B remains unchanged, duplicate names are allowed.
6. Attempt to insert/update A's ownership to B's PlayerId; expect denial.
7. Enable Anonymous Sign-Ins and manual identity linking only through Supabase Auth settings after review. Verify the anonymous JWT has `is_anonymous=true` and uses RLS as authenticated.
8. With disposable identities, verify linked Google identity preserves Guest PlayerId. For a two-profile conflict, test each choice in separate disposable fixtures, same-decision replay, contradictory replay and concurrent calls.
9. Delete only clearly disposable test Auth users through supported Dashboard/Auth administration and confirm the intended application-row retention behavior. Never delete the developer's real Google user.

## Acceptance record — 2026-08-14

- Migration: **APPLIED** — full version-controlled migration executed exactly once by the developer.
- Catalog verification SQL: **PASS** — assertion block completed without exception.
- Anonymous Sign-Ins: **ENABLED** by the developer.
- Manual identity linking: **DISABLED / DEFERRED** to the Guest-to-Google runtime migration task.
- Two-user own/cross read: **PASS** using two real isolated anonymous client sessions.
- Direct player/progression mutation denial: **PASS**.
- Rating `999999` and cross-player rating denial: **PASS**; both ratings remained 1000.
- Ownership theft denial: **PASS**; both ownership mappings remained unchanged.
- Rename, duplicate names, invalid names and cross-player boundary: **PASS**.
- Bootstrap isolation/idempotency and rating separation: **PASS**.
- Protected migration RPC caller checks: **PASS**.
- Conflict RPC end-to-end: **DEFERRED**; no Google identity was linked or replaced.
- Test-data cleanup: **REMAINS**.

Remote harness used only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. No admin/service-role credential, token output or persistent session storage was used. On this corporate Windows host, Node required its verified `--use-system-ca` mode; TLS verification was never disabled.

Disposable Auth users:

- Client A: `21f0f4a1-6078-4eb4-bcc8-e6bb9ecabcab`
- Client B: `fcb55a7a-0eed-4578-b878-ec22c58bcb4e`

Client A also owns a disposable migration intent. Because `player_migration_intents.guest_auth_user_id` uses `ON DELETE RESTRICT`, delete the intent before deleting A. Deleting only an Auth user cascades its ownership row but intentionally does not delete the independent PlayerId/progression rows. For complete cleanup, use a reviewed SQL Editor transaction that first captures both owned PlayerIds, deletes their migration intents, deletes only these two Auth users, then deletes only the captured PlayerIds (child progression/piece/rating/bootstrap rows cascade). Do not delete any other Auth user or player.

Exact cleanup query (review both UUIDs before running):

```sql
begin;

create temporary table data_01a_cleanup_players on commit drop as
select player_id
from public.player_auth_owners
where auth_user_id in (
  '21f0f4a1-6078-4eb4-bcc8-e6bb9ecabcab'::uuid,
  'fcb55a7a-0eed-4578-b878-ec22c58bcb4e'::uuid
);

do $$
begin
  if (select count(*) from data_01a_cleanup_players) <> 2 then
    raise exception 'Expected exactly two DATA-01A disposable players; cleanup aborted';
  end if;
end;
$$;

delete from public.player_migration_intents
where guest_auth_user_id in (
  '21f0f4a1-6078-4eb4-bcc8-e6bb9ecabcab'::uuid,
  'fcb55a7a-0eed-4578-b878-ec22c58bcb4e'::uuid
) or guest_player_id in (select player_id from data_01a_cleanup_players)
  or surviving_player_id in (select player_id from data_01a_cleanup_players);

delete from auth.users
where id in (
  '21f0f4a1-6078-4eb4-bcc8-e6bb9ecabcab'::uuid,
  'fcb55a7a-0eed-4578-b878-ec22c58bcb4e'::uuid
);

delete from public.players
where player_id in (select player_id from data_01a_cleanup_players);

commit;
```

All critical DATA-01A remote security gates passed. DATA-01B remains the next task.

## DATA-01B harness extension

`test:data:remote` now also exercises caller-only progression, exact replay once, foreign-player isolation, unchanged rating 1000, malformed/negative/huge payload rejection and direct operation-ledger denial. `202608140001_data_01b_progression_sync.sql` is **APPLIED**, `data_01b_schema_verification.sql` passed, and the extended remote harness passed.

DATA-01B disposable Auth users from the successful remote run (manual Dashboard/FK-aware cleanup remains required):

- Client A: `a7d7faef-5560-4b7c-84eb-c81dd4e181b4`
- Client B: `8df14129-5435-4cca-85d4-ce6aa61cb215`

Normal `test:e2e` and GitHub Chromium regression are deterministic and must never be treated as remote Supabase verification. They use an E2E-only application adapter and reject every Supabase request. Only an explicit `test:data:remote` invocation may create disposable anonymous users.
