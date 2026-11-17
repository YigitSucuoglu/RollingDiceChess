# ACHIEVEMENTS-01 Phase 4B-2C-2C — Stage C-1 preparation

Status: preparation only. No test identity was created, no real Supabase RPC was sent, and no production SQL was run in this stage. Migration 202609010010 was previously applied by the developer; its 52-case rollback verification passed.

## Real application path

`createLocalBotMatchSession` attaches `PlayerProfileService.createGameSession` as the real `Game` event sink. Roll/move/turn events feed `SingleMatchAchievementTracker`. The terminal event creates an immutable snapshot and calls `completeMatch`. For a verified canonical cloud owner, `PlayerSyncCoordinator.recordDurableCompletedMatch` writes the completion journal, local profile, and owner-scoped pending operation before dispatch. `SupabaseCloudPlayerSync.applyOperation` calls `public.apply_player_progression_operation(requested_operation_id, operation)`. The RPC derives PlayerId via `private.current_player_id()` from `auth.uid()` and `player_auth_owners`, inserts operation/match ledgers, and the match INSERT trigger evaluates/persists eligible unlocks. `public.get_current_player_achievements()` resolves the current caller again; no achievement UI currently calls it.

With valid `VITE_SUPABASE_URL` and publishable key, Play as Guest calls Supabase `signInAnonymously()`. An anonymous Supabase session maps to Guest `persistence: "cloud"`; it has a real authenticated bearer session and can sync. If anonymous sign-in/configuration fails, Guest is `persistence: "local"`, gameplay still works but this is **not** a real RPC test. Google accounts are unnecessary for INT-01–04. The normal Playwright E2E mode uses a fixture adapter and does not prove live Supabase.

The current uncommitted journal changes are exercised by running `npm.cmd run dev` locally with the existing `.env.local`, then opening `http://localhost:5173` in a clean, dedicated browser context. Do not use the deployed production frontend unless its deployed commit is verified to contain this code. The browser context must stay open until its anonymous test account is identified and recorded.

## Identity and baseline

Create one **new** cloud-backed Guest A through the normal UI, not via SQL or a service-role browser token. Existing Guests and the developer's Google account are out of scope. A second new cloud Guest B, in a separately isolated browser profile/context, is needed only for INT-05. Two Incognito windows in the same Chrome Incognito session may share storage and are not separate identities.

Before playing, locate the new anonymous Auth row in Supabase Authentication → Users. Copy its Auth UUID only into the parameter of `achievements_01_phase_4b_2c_2c_test_guest_baseline.sql`, never into chat. Require `cloud_guest_confirmed=true`, active Guest ownership, one canonical owner row, and record canonical PlayerId plus starting XP/games/operation/match/unlock counts in a **private local** manifest. If no new anonymous Auth row exists, stop: the browser may have fallen back to local-only Guest.

The private manifest should hold the test label (A/B), Auth UUID, canonical PlayerId, creation time, before/after counts, and each observed match/operation UUID. Do not commit the manifest or share tokens, raw browser storage, or private identifiers. The browser integration verification SQL accepts only that PlayerId and returns fingerprints for operation/match cross-reference, not names/emails or other players' data.

## Planned manual scenarios — not executed

| Case | Browser action / expected RPC | Read-only evidence and PASS criterion | Cleanup scope |
|---|---|---|---|
| INT-01 SP completion | Guest A plays a genuine bot match to king capture. Network should show one successful `apply_player_progression_operation` POST after completion. | Before/after verification for A: games +1, XP increases, one new operation and one new match ledger, linked operation fingerprint, payload hash matches, termination reason `king-captured`. A transient retry may cause more HTTP requests but not more progression. | A's dedicated account and all owned rows; preview first. |
| INT-02 challenge unlock | Candidate: `untouchable`, a king-capture win with **zero own pieces captured**. Attempt only through normal gameplay; do not fabricate a match. | A's match ledger has one unlock with `achievementId=untouchable`, `sourceType=singleplayer-match`, and matching source/match fingerprint. An authenticated `get_current_player_achievements()` call from A must return the same ID. SQL Editor admin output alone is insufficient. | Same A account. |
| INT-03 replay | Prefer a natural pending-journal/reconnect retry in A's browser: temporarily go offline before terminal completion, record the journal operation/match UUID locally, reconnect, then inspect after state. Do not edit storage or resend a forged payload. | One operation ID and one match ledger row, games/XP increment only once, unlock count not duplicated. If a true duplicate request cannot be observed, mark retry behavior PARTIAL and rely on earlier rollback SQL/unit evidence separately. | Same A account. |
| INT-04 timeout | Start a genuine timed SP match as A and let the clock terminate it. | One new completion with `terminationReason=timeout`; progression +1 game. No king-capture-only unlock has this timeout match as source. Compare A's before/after verification. | Same A account. |
| INT-05 isolation | Create separate cloud Guest B only after approving the second identity. Compare authenticated read RPC responses for A and B. A pending→B auth-switch requires controlled interception and is not reliably reproducible by normal UI timing. | B's read response contains no A-only unlock. B's progression/ledgers remain unchanged by A's actions. Pending A→B dispatch is NOT EXECUTED until a controlled method is agreed. | A and B separately, after FK preview. |

The eight single-match challenges depend on dice, bot behavior, and long/rare match conditions. **No challenge is deterministic under unmodified production gameplay.** `untouchable` is a relatively understandable candidate, not a guaranteed outcome. Do not label INT-02 PASS unless a real qualifying game and both server write/read evidence exist. A deterministic seeded client or fabricated server snapshot would require a separate test boundary and approval; neither is introduced here.

## Authenticated read and failure evidence

The achievement read RPC has no current Profile UI integration. A later controlled browser probe must use A's existing Supabase session and the browser-safe publishable key; it must never print, transmit to chat, or save the access token. SQL Editor `SET ROLE authenticated` with simulated claims is useful for SQL contract checks but **not** equivalent to a real browser JWT call. Before choosing an exact read-probe command, confirm the test Guest session and available browser tools. For failures retain only HTTP status, Supabase error code, redacted timestamps/fingerprints, and before/after counts; never share bearer tokens or full localStorage.

## Read-only SQL files

- `supabase/tests/achievements_01_phase_4b_2c_2c_test_guest_baseline.sql`: exact new Auth UUID → anonymous flag, canonical PlayerId, ownership, initial progression and counts. Must be parameterized locally.
- `supabase/tests/achievements_01_phase_4b_2c_2c_browser_integration_verification.sql`: exact test PlayerId → progression, operation/match fingerprints and linkage, payload hash, unlock sources. Run before and after each approved gameplay case with the same parameter.

Both files use `BEGIN TRANSACTION READ ONLY` and `COMMIT`; neither writes. The SQL Editor has admin visibility, so its reads do not by themselves establish browser authorization or isolation.

## Cleanup gate

Do not delete anything during these tests. After all test cases, prepare a read-only preview scoped to the manifest's exact A/B Auth/Player IDs, including progression operations, match completions, achievement unlocks, statistics, rating, migration/retirement links, and other FK dependents. Deleting only a ledger row does not reverse progression. Obtain fresh explicit approval for a reviewed FK-safe cleanup of only the dedicated test identities. The developer performs cleanup manually and verifies the final state. No broad `DELETE`, `TRUNCATE`, or existing Guest cleanup is authorized.
