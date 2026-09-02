# LEADERBOARD-01 Qualification

## Product contract

- Ranked players qualify after at least one completed ranked match.
- The public result contains the Top 100 plus the qualified caller's own rank when outside the Top 100.
- Canonical ordering is rating DESC, ranked wins DESC, ranked win rate DESC, ranked games DESC, then internal PlayerId UUID ASC.
- PlayerId is an internal tie-break only and is not part of the browser DTO.
- Cloud Guests and persistent accounts use the same current-player-authorized read contract.
- Unranked games and technical aborts do not affect ranked ordering.

## Read path and request counts

`LeaderboardPage` creates one page-scoped `LeaderboardService`. Initial load starts the Top 100 and My Rank RPCs in parallel. A successful navigation therefore makes exactly two authenticated Supabase RPC calls:

1. `public.get_ranked_leaderboard_top_100()`
2. `public.get_current_player_ranked_rank()`

Duplicate initial loads are coalesced. Explicit Refresh starts one new two-RPC canonical generation and rapid duplicate Refresh calls share that generation. Request-version protection prevents an older response from overwriting a newer Refresh result. Navigating away and back creates a fresh service and performs two new canonical reads.

## Freshness and cache policy

LEADERBOARD-01 intentionally uses Level 0 freshness: no shared client cache. The early-production read volume is two bounded RPCs per navigation or explicit Refresh, and no measured production problem justifies introducing auth-scoped cache invalidation complexity.

- Initial navigation: canonical read.
- Explicit Refresh: canonical read; no stale cache exists to reuse.
- Navigation/remount: canonical read.
- Post-ranked-match navigation: canonical read after authoritative settlement.
- Focus: no automatic read.
- No polling and no Realtime subscription.

This policy is stricter than the accepted 15–30 second stale tolerance and has no cross-user cache-contamination surface. A future TTL cache requires measured request pressure and must remain canonical-identity scoped.

## Consistency and partial failure

Top 100 and My Rank remain separate RPCs so either result can remain usable when the other fails. They may observe a short transient snapshot skew during concurrent settlements. No production UX defect has been observed, Refresh repairs transient skew, and replacing them with a combined RPC would require a migration while removing the current partial-success property. Server-provided rank, order and `isCurrentPlayer` remain authoritative; the client does not sort or predict rank.

## Security boundary

- Both public read RPCs resolve the current caller through the private canonical-player boundary.
- Execution is granted to `authenticated`, denied to `anon`, and the functions use a fixed safe `search_path`.
- Browser code cannot provide an arbitrary PlayerId.
- Public DTOs contain username, discriminator, rank, rating and ranked aggregates only.
- Direct rating mutation, private settlement-ledger access and direct authority-table reads remain denied.

## Performance evidence

The existing transactional 100,000-row harness is `supabase/tests/leaderboard_01_ranked_projection_performance.sql`. It rolls back all synthetic data. Phase 2 evidence confirmed the partial composite leaderboard index and recorded an approximately 176 ms worst-ish current-player rank query at that scale. Phase 6 reuses the existing verification and performance harness; no schema migration is required.

## Qualification state

- Local application/unit/security guards: PASS. `validate`, 235 unit tests, 39 focused Chromium E2E tests and the 12 applicable cross-browser qualification cases passed.
- Remote schema/security verification: PASS from Phase 2 (all 14 assertions true, aggregate mismatch count 0).
- Transactional performance harness: PASS from Phase 2 at 100,000 synthetic rows; all temporary data was rolled back.
- Production manual acceptance: pending.

LEADERBOARD-01 is not marked complete until those remaining gates are recorded.

## Future scope

Public profiles, clickable users, social/friends, seasons, rating history, matchmaking, pagination, live leaderboards, Redis/shared distributed cache and materialized leaderboard views are intentionally outside LEADERBOARD-01.
