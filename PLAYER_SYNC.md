# RouletteChess Player Synchronization

## Runtime authority

Configured `Play as Guest` uses Supabase Anonymous Auth. Supabase restores its managed session after reload, so the same Auth user resolves through `player_auth_owners` to the same UUID PlayerId. When configuration or network access is unavailable, the product remains usable through a clearly tagged local Guest fallback.

After a cloud profile is established, cloud progression is canonical. `LocalStoragePlayerProfileRepository` remains a responsive cache, offline fallback, and legacy bootstrap source; it is not a second cloud-authoritative profile. Supabase session storage, profile cache, Guest preference, and the versioned pending-operation queue are separate stores.

## Bootstrap and conflict rule

A profile is meaningful when bootstrap metadata exists or XP, game/roll totals, or piece counters are non-zero. An empty cloud profile plus meaningful local profile calls `bootstrap_local_profile` once. The server ledger makes retries idempotent and rating is untouched.

If both an unknown cloud identity and the local cache contain meaningful progression, synchronization enters an explicit conflict state. Neither side is overwritten or arithmetically merged. DATA-01C owns Guest-to-Google linking and conflict resolution.

## Casual progression operations

Completed local matches continue using the existing `PlayerProfileService` XP/stat calculation. The before/after difference is recorded under `roulettechess.player-sync.v1` with a UUID operation ID. `apply_player_progression_operation` derives the target from the caller, validates bounded non-negative deltas, rejects unsupported fields, and records a payload hash under `(player_id, operation_id)`.

Replaying the same ID and payload returns current canonical state without reapplying it. Reusing an ID with another payload fails. This protects refresh and multi-tab replay; simultaneous tabs can still temporarily display stale cache until their next auth/reconnect/profile event. There is no constant polling.

Failed writes stay pending. An online event or later profile event retries them. Successful acknowledgement removes the operation and refreshes the local cache from the canonical response. Offline gameplay remains available and no profile payload is sent to observability.

Multiplayer rating is returned read-only for future consumers but never appears in a progression operation and the RPC never updates `player_ratings`. Bot games affect only the existing casual XP/statistics.

## Recovery and retention

Clearing browser/site auth data can make an unlinked anonymous Guest identity inaccessible even though its cloud rows remain. The UI warns about this without claiming that Google migration is already complete. Automatic orphan deletion is intentionally deferred to `GUEST-RETENTION-01`.

Cloud profile reset is deferred: the current local reset action is disabled once cloud authority is established so it cannot delete identity, ownership, or rating.

## DATA-01B deployment

The migration `supabase/migrations/202608140001_data_01b_progression_sync.sql` must be applied once after DATA-01A. In Supabase SQL Editor, confirm project ref `kbtnnknsgobfvyydxbex`, execute the complete migration, then execute `supabase/tests/data_01b_schema_verification.sql`. Only after both succeed run `npm.cmd run test:data:remote`; that harness creates disposable anonymous users and tests own-only sync, replay, malformed payload rejection, direct-write denial, and rating isolation.
