# RouletteChess Multiplayer Authority Foundation

## Feasibility and authority

The existing Supabase stack is sufficient for the initial authoritative multiplayer
architecture. PostgreSQL provides atomic lobby transitions, durable canonical snapshots,
monotonic revisions, RLS/grants, concurrency locks, and RATING-01 settlement. Supabase Auth
provides caller identity. Realtime and Presence are notification/connection signals only.

The full RouletteChess engine must not be duplicated in PL/pgSQL. A trusted TypeScript
runtime—initially a Supabase Edge Function or equivalent server-only worker—will reuse the
existing deterministic engine and persist transitions through service-only functions. A
dedicated WebSocket/game server is not required now, but must be reconsidered if measured
cold-start, latency, ordered-action throughput, or clock-adjudication results are inadequate.

```text
Browser intent -> trusted TypeScript authority -> existing engine
               -> PostgreSQL transaction/revision -> Realtime notification
               -> authorized canonical snapshot fetch
```

No service-role credential belongs in a browser. Client state is never authoritative for
board, roll, rights, clocks, result, or rating.

## Modes, identity, and lobby lifecycle

Cloud Guests and Google-linked accounts use canonical UUID `PlayerId` and may play Ranked or
Unranked. There is no rating-difference join restriction. Ranked sides are random only;
Unranked hosts may request White, Black, or Random.

```text
create -> waiting --opponent joins--> ready --host Start--> starting
             ^                         |
             |-- opponent leaves ------|
             |-- host kick ------------|

waiting/ready --host leaves/TTL------> closed
starting --trusted activation--------> closed lobby + active match
```

A public lobby is listed only while `waiting`. It disappears when an opponent joins and
returns after host kick/opponent leave. Private lobbies are never listed. Private codes are
server-generated strings of exactly six digits, preserve leading zeroes, and are unique
among active private lobbies through collision retry plus a partial unique index. A code is
invalid after close/expiry and is not an authentication credential. Exact code lookup has
an initial ten-attempt/minute per-auth-user database limit; future edge/network rate limits
should add abuse protection without telemetry logging the code.

Opponent join locks the lobby row and applies `waiting -> ready` atomically. A unique active
membership row enforces one waiting/ready/starting lobby or active match per PlayerId. A
third/concurrent join fails safely. Waiting/ready lobby TTL is initially 30 minutes.

Only the host may kick while ready, request Start, or close its pre-start lobby. Join never
auto-starts: the host reviews safe display name, discriminator, and rating, then chooses Kick
or Start. Opponent leave and kick return to waiting. Host leave closes the lobby. There is
no XP, rating, loss, or forfeit before ACTIVE.

## Exact ACTIVE boundary

Start creates one idempotent `initializing` match request and changes the lobby to
`starting`; this is not yet a played match. Trusted activation atomically:

1. locks the lobby and match;
2. locks participants, mode, and time control;
3. assigns sides (Ranked always random);
4. accepts the initial board/state only from trusted engine execution;
5. initializes server clock values and active-turn timestamp;
6. generates the first three-piece roulette result using server-side RNG;
7. binds both memberships to the match;
8. commits revision `1`, match `active`, and lobby `closed`.

Activation replay returns the same match. Only after ACTIVE can leave/disconnect become
forfeit-capable.

## Roulette and locked future UI

Multiplayer has no Roll button. The trusted authority automatically generates three
independent equal-probability piece types at activation and every later turn transition;
repeats and types absent from the board remain valid. Clients animate the persisted result.

MULTIPLAYER-01C must preserve existing singleplayer machine/Roll sizing. In multiplayer it
must remove the Roll button and reserved space, then use the freed width/height to make the
machine and reel contents proportionally larger on desktop/mobile without crowding board or
clocks.

## Snapshot, revision, move intent, and engine reuse

The provider-independent authoritative snapshot includes match ID, monotonic revision,
status, safe participant summaries, sides, immutable mode/time control, board, current turn,
roll, remaining rights, server clock/timestamp, connection deadlines, and terminal data. It
contains no auth ID, UUID intended for normal UI, email, provider payload, token, code, or
secret.

A move intent contains only `matchId`, `expectedRevision`, `from`, and `to`. Authority derives
caller PlayerId/side, piece, turn, roulette eligibility, rights, legal move, resulting state,
clock transition, winner, and next roll. Stale revisions are rejected. The 01A prototype
proves participant/current-turn/revision authorization; complete authoritative move
persistence is deferred.

ChessBoard, DiceEngine, TurnRights, MoveGenerator, TurnResolver, Game, and clock semantics
remain the single rule implementation. The prototype already reuses board, dice, and rights
for activation. Future trusted composition will use the complete engine; the online browser
adapter only sends intents and renders snapshots.

## Clock, reconnect, forfeit, and technical abort

Server clock state owns remaining milliseconds, active color, increment, and trusted turn
start. Client interpolation is display-only. Disconnect starts an independent 30-second
deadline and never pauses the clock. Timely reconnect fetches the current canonical snapshot,
not stale local state.

One expired disconnect while authority/opponent is healthy is a forfeit. Ranked terminal
win/forfeit later invokes RATING-01; Unranked has zero rating effect. Explicit active Leave is
also a server-adjudicated forfeit intent. If both players expire and fair responsibility
cannot be established, the conservative 01A state is technical abort—not a draw—and rating
remains unchanged. Production dual-disconnect adjudication belongs to MULTIPLAYER-01D.

## Realtime, Presence, persistence, and security

- PostgreSQL/trusted execution owns transactions, membership, revision, clocks/timestamps,
  roulette result, terminal state, and rating handoff.
- Realtime Broadcast/database notifications may announce lobby/match revision changes,
  joined/left/kicked, or readiness. Messages may be missed and are never canonical.
- Presence provides connection hints only. It never owns board, roll, rights, clocks, or
  result.
- Every reconnect/desync fetches an authorized durable snapshot.

The migration creates private lobby, match, active-membership, and code-attempt tables with
RLS enabled and no browser table grants. Authenticated roles receive narrow caller-bound RPCs
for public summaries, create, join, kick, leave, Start intent, and participant snapshot.
They cannot choose opponent, sides, RNG, clocks, ACTIVE state, winner, canonical state, or
rating. `private.activate_multiplayer_match` and `private.settle_ranked_match` are
service-only. UUID PlayerIds, auth IDs, private codes, tokens, and raw snapshots must not be
sent to Sentry; coarse phase/failure categories are sufficient.

## MULTIPLAYER-01B lobby experience

The provider-independent `MultiplayerLobbyPort` now separates presentation from the
Supabase adapter. The adapter owns safe RPC normalization, error categories, canonical
current-membership restoration, and one privacy-filtered Realtime invalidation channel.
React renders browse/create/private-code/waiting/ready/Start states but never imports the
Supabase SDK or treats an event as canonical state. Focus, online recovery, and a conservative
30-second reconciliation pass repair missed events and multi-tab changes.

`multiplayer_lobby_events` exposes only global public-list invalidations or caller-bound
participant invalidations. RLS maps the authenticated owner without granting browser access
to the private identity helper; browser roles have SELECT only and cannot forge events.
The public listing and UI expose no UUID PlayerId, auth ID, email, provider payload, or private
code. Full product flow details are in `MULTIPLAYER_LOBBY.md`.

Normal E2E uses a deterministic adapter and makes no live Supabase request. The remote
three-client harness proves canonical restore, private-event isolation, direct event/table
write denial, visibility, atomic join, host authorization, and idempotent Start.

## Deferred work

01B does not implement two-player board rendering, complete move persistence, production
reconnect UI, rating settlement execution, matchmaking, friends, leaderboard, or multiplayer
machine resizing. MULTIPLAYER-01C consumes the trusted activation boundary and connects the
safe Start result to the authoritative online Game UI.

## MULTIPLAYER-01C runtime

The selected worker is a Vercel TypeScript Serverless Function using server-only
`SUPABASE_URL` and `SUPABASE_SECRET_KEY`. It verifies each Supabase access token and resolves
PlayerId through ownership data; client-submitted PlayerId is rejected. Shared ChessBoard,
DiceEngine, TurnRights, TurnResolver, Simulation and notation code validate and apply
minimal from/to intents. PostgreSQL owns revision locking, clocks, reconnect deadlines,
first-terminal-wins behavior, and the idempotent RATING-01 handoff.

Participant-scoped Realtime rows announce activation, revision and termination only. The
browser always refetches canonical state and retains polling recovery. Multiplayer uses the
shared Board presentation with automatic roll visualization, no Roll button, and a larger
machine modifier; Singleplayer remains unchanged.
