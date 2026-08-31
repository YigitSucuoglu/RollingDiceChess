# Multiplayer Production Qualification

## Current status

MULTIPLAYER-01D local, deterministic, and real production qualification is **COMPLETE**.
Sessions A-E passed with independent authenticated players across a PC and a physical mobile
device against the deployed production build on 2026-08-31.

The deterministic suite uses application-owned fixtures and must not contact Supabase or
create Auth users. Realtime timing, Vercel cold starts, physical-device behavior, and actual
cross-client convergence require the manual production sessions.

For localhost testing, start with `npm.cmd run dev`. This command enables Node's system CA
store for corporate TLS compatibility. The Vite development server proxies
same-origin `/api/multiplayer` requests to the trusted Vercel authority; restart Vite after
changing `.env.local` or proxy configuration. Do not place a Supabase secret in any `VITE_`
variable. The default proxy uses production authority and therefore changes production
multiplayer state during real manual tests.

The additive MULTIPLAYER-01D host-lease migration was applied before validating ghost-lobby
acceptance. After application, an existing abandoned waiting/ready lobby receives
one three-minute transition lease. Without a live host heartbeat it must disappear from
discovery naturally, release its memberships during opportunistic reconciliation, and allow
the former host to create a new lobby without manual deletion. Record this production ghost
fixture result; do not close it manually before the test.

Production migration/catalog verification passed on 2026-08-31: all eight lease/security
assertions were true and no lease exceeded the hard TTL. The preserved abandoned public
lobby disappeared from Open Lobbies naturally without manual close/delete. Final read-only
verification returned zero open/expired/lease-bound anomalies and zero orphan/stale
pre-match memberships. The ghost-lobby lifecycle acceptance is complete.

## Automated baseline

- The Multiplayer page owns vertical scrolling inside the fixed application root.
- The lower Create Lobby action is reachable at 390x844 and in Android Chromium/iPhone
  WebKit emulation without document-level or horizontal scrolling.
- Public/private lobby lifecycle, host authorization, activation idempotency, automatic
  authoritative rolls, revision rejection, move synchronization, reconnect restoration,
  disconnect adjudication, technical abort, terminal king capture, and rating settlement
  idempotency have deterministic unit or browser coverage.
- Multiplayer retains the existing larger slot-machine modifier; Singleplayer sizing is
  unchanged.

## Safe latency recording

For each operation record browser-visible elapsed time or DevTools request duration. Record
only a short locally generated correlation label, warm/cold observation, viewport/device,
and approximate milliseconds. Do not record access tokens, auth IDs, PlayerIds, private
lobby codes, emails, or raw provider/server payloads.

| Operation | Client/device | Cold/warm | Approx. ms | Result/notes |
| --- | --- | --- | ---: | --- |
| Public lobby create | Production PC/mobile | Warm | Accepted | Public discovery and join passed |
| Public lobby join | Production PC/mobile | Warm | Accepted | Independent account saw and joined the host lobby |
| Start Match | Production PC/mobile | Warm | Accepted | Both clients entered one canonical match |
| Move intent -> response | Production PC/mobile | Warm | ~250-400 | Accepted after Vercel authority alignment to `fra1` |
| Move -> opponent visible | Production PC/mobile | Warm | Accepted | Realtime notification and canonical reconciliation converged correctly |
| Reconnect restore | Production PC/mobile | Warm | Accepted | Disconnect/reconnect and canonical clock restoration passed |

## Session A - Lobby

Use two independent authenticated browser contexts; a third independent context is useful
for visibility/race checks.

1. A creates a Public lobby and confirms it is waiting; B sees and joins it.
2. Confirm the lobby disappears from an unrelated client's Open Lobbies, both identities and
   ratings appear, only A sees Kick/Start, and activation does not happen automatically.
3. Exercise B Leave, A Kick, and A Close as separate fresh lobbies. Confirm no rating change,
   no stale restoration, and immediate ability to create/join again.
4. Create a Private lobby. Confirm it is absent from public browse, the six-digit code keeps
   leading zeroes, a wrong code fails safely, B can join the exact code, and a third client
   cannot take the final slot.
5. Double-activate Start once. Confirm one authoritative match and identical side/turn
   assignment. Ranked must be Random; Unranked must honor White/Black/Random authoritatively.

## Session B - Gameplay

1. Start an Unranked 3+0 match and play multiple complete turns from both clients.
2. Confirm there is no Multiplayer ROLL button; both clients show the same automatic roll,
   remaining rights, board, turn, revision trend, clocks, and move history.
3. Confirm duplicate input cannot apply two moves and an older client view reconciles rather
   than overwriting newer state.
4. Refresh each client on own and opponent turns. Confirm side, board, roll, rights, clock,
   and match identity remain canonical and no reroll occurs.
5. Repeat clock sampling for 5+1 and 10+0. Confirm increment, inactive clock,
   background-tab display recovery, and authoritative timeout behavior.
6. Complete a match by king capture. Confirm clocks stop, both clients show the same result,
   no further move is accepted, and refresh restores the terminal result.

## Session C - Reconnect

1. Interrupt one client's network briefly, then restore it within 30 seconds. Confirm
   Reconnecting feedback, continuing authoritative clock, and exact canonical restoration.
2. Repeat with a page refresh; confirm refresh is not an immediate forfeit.
3. In a disposable match, exceed the reconnect contract. Confirm one-player expiry becomes
   disconnect-forfeit; genuine dual expiry becomes technical abort with no rating effect.

## Session D - Rating

1. Record both canonical ratings before a Ranked match.
2. Complete one Ranked match by king capture or controlled active-match forfeit. Confirm the
   winner/loser and both rating changes follow RATING-01.
3. Refresh both terminal clients repeatedly. Confirm settlement applies exactly once.
4. Complete an Unranked match and confirm neither rating changes.

## Session E - Cross-device/mobile

1. Use desktop for A and a physical mobile browser for B without shared browser storage.
2. At approximately 390px width, open Create, Join, waiting, and ready states; vertically
   scroll through every control and confirm no horizontal overflow.
3. Play multiple turns. Confirm the larger Multiplayer machine does not clip the board,
   clocks, result, or critical controls.
4. Background and foreground mobile within the reconnect window. Confirm reconciliation
   without an immediate forfeit.

## Post-session lifecycle verification

After each disposable flow, inspect only aggregate/caller-safe lifecycle diagnostics. Normal
close, leave, kick, completion, forfeit, and reconnect flows must leave no unintended
starting lobby, initializing match, active membership, expired reconnect deadline, orphan
event, or stale snapshot. Do not manually delete rows to make acceptance pass.

## Completion record

Production acceptance completed on 2026-08-31 with a PC and physical mobile browser using
independent authenticated accounts. Sessions A-E passed: lobby lifecycle and discovery,
authoritative cross-device gameplay, clocks, reconnect/disconnect behavior, ranked settlement,
canonical Profile and board ratings, responsive rating UI, and ranked Game Over rating
animation. The preserved ghost lobby expired naturally under the verified host lease policy,
with no manual deletion.

Aligning the Vercel trusted authority with Supabase through the `fra1` production region
reduced the previously severe latency. Warm caller move responses were accepted at roughly
250-400 ms; opponent Realtime observation followed by canonical reconciliation was also
accepted in real two-client use. No deeper authority-path optimization was required for
MULTIPLAYER-01D.

Potential post-v1 optimizations remain backlog-only: evaluating `getClaims`, consolidating
safe RPC round trips, revision-aware Realtime deduplication, and separating presence from
canonical reconciliation. These must not weaken authenticated PlayerId resolution, revision
protection, clocks, RNG, settlement idempotency, or server authority.
# Multiplayer latency diagnostics

The browser console emits privacy-safe `multiplayer-latency` records for T0, T1, T4-T8. The trusted function logs T2/T3 with a short random correlation ID and returns an `authority` duration through `Server-Timing`. These records contain no token, PlayerId, lobby code, or profile data. Local measurements include the Vite proxy hop; production uses the shorter same-origin path.

For a two-client check, record the caller's `T0-move-confirmed` → `T5-caller-board-rendered` duration and the opponent's `T6-opponent-realtime-observed` → `T8-opponent-board-rendered` duration. Compare the request duration at T4/T7 with the `authority` duration to separate network/proxy time from trusted runtime/database time.
