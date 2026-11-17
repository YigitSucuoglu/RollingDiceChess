# ACHIEVEMENTS-01 Phase 4B-2C-2C — Stage A plan

Status: preparation only. No production SQL, test account, progression, unlock, or cleanup was executed in this stage.

## Contract and ownership

`Game` event sink → `SingleMatchAchievementTracker` → `PlayerProfileService.completeMatch` → `CompletionJournal` → `PlayerSyncCoordinator.flush` → `SupabaseCloudPlayerSync.applyOperation` → `public.apply_player_progression_operation(uuid,jsonb)` → `private.player_singleplayer_match_completions` → `persist_single_match_achievement_unlocks` trigger → `private.player_achievement_unlocks` → `public.get_current_player_achievements()`.

- The browser supplies an operation UUID and versioned `singleMatch` snapshot; the RPC derives the canonical PlayerId from `private.current_player_id()` → `public.player_auth_owners.auth_user_id = auth.uid()`. A browser-supplied PlayerId is not authority.
- `public.player_progression_operations` has primary key `(player_id, operation_id)`. The single-match ledger has primary key `match_id` and unique `(player_id, operation_id)`. Its SHA-256 match fingerprint is over `singleMatch::text`, not the complete progression operation. The RPC also locks the owner progression row and takes a transaction-scoped advisory match lock before inserting. The AFTER INSERT trigger evaluates and writes eligible unlocks atomically; unlock primary key is `(player_id, achievement_id)`.
- The read RPC resolves the same canonical owner and returns `catalogVersion`, `unlockedCount`, and minimal unlock metadata. No achievement UI exists yet. SQL Editor's admin context is not a substitute for an authenticated JWT call.
- Migration `202609010005` establishes the unlock/read boundary; `006` adds career runtime; `007` performs historical backfill; `008` adds the SP match ledger; `009` adds the SP evaluator/trigger. They are assumed already applied and must not be rerun.

## Test identity and manifest

Use a newly created, explicitly designated test identity through the normal app Auth/bootstrap flow; never synthesize an `auth.users` row. Do not use the developer's existing account or any pre-existing Guest. Before the first write, record its canonical PlayerId and Auth user identity in a private local manifest, together with every test match ID, operation ID, expected unlock ID, and creation time. Do not commit or paste tokens, credentials, or private identity values into reports. A second test identity is needed for cross-owner/account-switch cases. Obtain explicit approval for each write stage.

## Read-only preflight

The preflight SQL is a read-only transaction. It checks exact table/function signatures, match and unlock uniqueness, the trigger, RLS, RPC grants, `pgcrypto`, and aggregate active/retired/ledger/unlock counts without returning player identifiers. It checks whether Supabase's migration registry exists, but does not treat its rows as authoritative: manual SQL Editor application may not register versions there. It cannot prove authenticated browser behavior or concurrency.

## Later verification design — not yet executed

1. Adversarial SQL: the first probe uses only synthetic UUIDs embedded in JSON, no Auth/Player fixture row, and no progression RPC. It calls the existing `IMMUTABLE` private validator and evaluator, catches *expected* exceptions, and rolls back temporary result objects. It exercises missing/null required fields, SQL `NULL` predicates, bad casts, negative/fractional numbers, large strings/JSON, extra keys, duplicate/invalid promotion IDs, schema/outcome mismatch, cross-field contradictions, owner mismatch, and timeout-versus-king-capture eligibility. This proves the validator/evaluator path, not browser JWT dispatch or ledger writes. Measure legitimate producer payload sizes before selecting any limit. No migration is proposed before these results.
2. Browser manual: with the designated test account, complete a king-capture SP game, an eligible and an ineligible challenge, and a timeout game; record the browser completion/journal/queue state, then compare owner-scoped progression, operation ledger, match ledger, unlock, and authenticated read RPC. Separately test reload with pending journal, offline→reconnect, duplicate completion, account A→B while A has pending work, and Guest→Google survivor. Do not use Profile UI to assert achievement unlock. For failures collect redacted HTTP status, RPC error code, match/operation correlation IDs, and counts—never tokens.
3. DB-CON-01–05: same operation/same payload; same match/different operation/identical snapshot; same match/conflicting snapshot; different matches/same owner; different owners. Each requires two actual independent PostgreSQL connections with controlled overlapping transactions and before/after counts. Two SQL Editor tabs or `Promise.all` through one connection are not deterministic proof. The current workstation has no `psql`, Docker, Supabase CLI, or configured direct PostgreSQL connection, so this is **NOT EXECUTED**. A Node two-connection harness is feasible only after a direct DB connection mechanism and tightly scoped test credentials are agreed; no production credential belongs in source or frontend.

## Cleanup gate

Do not clean while tests are running. First produce a read-only preview tied to the manifest: test Auth/PlayerId, ownership and lifecycle, operation IDs, match IDs, progression/unlock/ledger counts, and FK/migration relationships. Deleting only ledger rows does not reverse progression. Prefer removing the dedicated test identity and all its owned data through an FK-safe, reviewed plan; do not touch existing users/Guests or retired/survivor relationships. Show exact targets, obtain fresh approval, then have the developer perform cleanup manually. Verify counts afterward. Never issue broad `DELETE`/`TRUNCATE`.

## Known limits and risks

- SQL shape checks cannot prove browser-side SP gameplay provenance.
- Current validation uses casts and `NOT BETWEEN`; missing/JSON-null numeric fields deserve an adversarial DB test because SQL three-valued logic may bypass an intended rejection.
- Unknown snapshot keys, oversized JSON/string fields, and duplicate promotion IDs require explicit product/security decisions after measured tests. Adding a stricter schemaVersion 1 rule without checking old producer payloads risks compatibility.
- Local auth-generation guards prevent stale *responses* from applying, but the SDK's token-acquisition boundary and a real account switch require separate controlled verification. Do not infer a cross-account mutation without evidence.
