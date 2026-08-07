# RouletteChess Architecture

## ARCH-01 audit

Before ARCH-01, rule classes were React-independent, but the boundaries around them were implicit. `engine/GameManager` was simultaneously a singleton game owner, session factory, profile-session connector, and browser-storage entry point. `Board.tsx` renders the board while also coordinating roll reveal timing, bot turns, clock start, skip feedback, sounds, and direct `Game` mutations. `Game` constructed Dice, bot, board IDs, and Clock defaults itself. `ChessBoard` used `crypto.randomUUID`; Clock scheduled global timers; Dice and bot factories defaulted directly to JavaScript randomness. Profile and Settings storage were already behind repositories, while navigation, document titles, image loading, sound, Sentry, and animation timers were correctly presentation/infrastructure concerns.

Mutable engine class instances (`ChessBoard`, `TurnRights`, `MoveHistory`, `ChessClock`) are not network payloads. Existing simulation cloning is suitable for rule evaluation, not reconnect serialization.

## Dependency direction

```text
Presentation (React pages/components)
        ↓ intents / snapshots
Application (MatchSession, local orchestration)
        ↓
Domain contracts + existing rule engine
        ↑
Infrastructure (random/time/scheduler/ID, profile persistence, future transport)

Bootstrap is the composition root and may see application + infrastructure.
```

- **Domain/contracts:** stable game mode, configuration, snapshot, action, connection, platform-port, and turn-policy types. No React, DOM, storage, assets, or Sentry.
- **Application:** session lifecycle and action delegation. It accepts constructed dependencies and does not select browser adapters.
- **Infrastructure:** local JavaScript randomness, system time/scheduler, browser UUIDs, profile-backed session creation. A future online adapter belongs here and must implement `MatchSession` without constructing authoritative `Game` state on the client.
- **Presentation:** rendering, selection affordances, responsive layout, navigation, sound, reel/lever animation, and transient roll phase.
- **Bootstrap:** the compatibility `GameManager` singleton now owns only the active session lifecycle and delegates construction to the local composition factory.

## Implemented contracts

`GameMode` is descriptive (`bot | online`), never a multiplayer boolean. `LocalBotMatchConfiguration` is a discriminated, versioned, JSON-safe DTO containing stable IDs and numeric milliseconds; it contains no labels, functions, assets, or browser objects. `OnlineMatchConfiguration` requires an authoritative match ID but has no implementation.

`MatchSession` exposes `getSnapshot`, `subscribe`, `requestAction`, and `dispose`. `LocalBotMatchSession` wraps the existing `Game`, owns listener cleanup, publishes immutable DTO snapshots for accepted actions/timeouts, and preserves profile completion lookup. `MatchAction` currently covers selection, move, unplayable-turn skip, and clock start. Unsupported online commands are intentionally absent.

Snapshots are schema-versioned and JSON-safe. Board pieces, moves, selection, rights, history, and clock values are copied; mutable engine objects are never returned. Clock values are milliseconds. Transient reel/lever animation phase remains presentation-owned because it is not durable authoritative state. A reconnecting client should render an authoritative snapshot and choose whether a presentation animation is appropriate rather than replaying historical animations.

## Platform ports and composition

- `RandomSource` formalizes the injection already supported by Dice/bots. Distribution remains six equal piece types.
- `TimeSource` and `Scheduler` are injected into `ChessClock`; disposal clears the scheduled timeout.
- `IdGenerator` is injected into `ChessBoard`; local production uses browser UUIDs and tests can use deterministic IDs.
- `createLocalBotMatchSession` is the production local composition point for Game, profile event sink, random, time, scheduler, and IDs.

Compatibility defaults remain on constructors so existing engine tests and incremental consumers are not broken. Production construction uses explicit adapters.

## Authority and future online adapter

Local bot sessions are authoritative for board, rolls, accepted moves, clocks, and result. Future online sessions must treat the server as authoritative for match lifecycle, roll result, legal actions, board, clocks, winner, and room readiness. The client may render, maintain local selection UX, animate server results, send requests, estimate clock display between server timestamps, and reconcile snapshots. It must not instantiate `LocalBotMatchSession` for `mode: online`.

The recorded online policy is: automatic roll approximately 750 ms after transition, server-owned result, reel animation before the clock begins, and no client-controlled delay/regeneration. Current bot policy remains manual human ROLL, existing automatic bot reveal delay, locally generated equal-probability roll, and clock start after resolved reveal.

## Events

Existing `GameEventSink` events are domain/application facts: roll generated, move committed, turn completed, and match completed. Profile tracking consumes them idempotently. Spinner visibility, lever movement, sounds, toast visibility, and reel frames remain UI effects. Future transport may version and serialize durable facts, but ARCH-01 does not turn events into analytics or networking messages.

## Rooms and connection model

`ConnectionState` reserves local/connecting/connected/reconnecting/disconnected without surfacing unused UI. Room code, host/guest, membership, ready state, lobby status, rematch, leave, and spectator DTOs should be introduced with the room protocol—not guessed now. Expected MVP flow remains Create Room → code → join → waiting lobby → both ready → match.

## Mobile reuse

A React Native client can potentially reuse TypeScript domain/application contracts and rule code while reimplementing navigation, storage, sound, assets, and presentation adapters. Flutter cannot import this TypeScript directly; it can reuse the versioned contracts/protocol as a specification while the server-authoritative game core remains canonical. No mobile framework decision is made here.

## Incremental migration and remaining debt

ARCH-01 deliberately migrated session creation and Board subscription first. ARCH-02A routes player selection and moves through `MatchSession.requestAction`. ARCH-02B moves the local manual-roll lifecycle from Board into `LocalBotMatchSession`: Board sends `START_MANUAL_ROLL`, while the session owns ready/spinning/resolved state, duplicate rejection, the 1000 ms resolution timer, visible roll identity, cleanup, and the compatibility clock handoff.

The DiceEngine-generated `Game.currentRoll` remains the authoritative turn result and is not regenerated by the reveal action. CSS reel/lever animation and browser sound remain presentation effects driven once by snapshot phase and sequence. The session publishes only lifecycle transitions, not animation frames. Clock ownership remains in Game, but the session invokes the existing clock-start compatibility path only after resolved visibility. A future online adapter can publish the same roll snapshot from a server result without reusing local randomness or exposing a manual-roll capability.

Board still obtains the compatibility `Game` instance for the bot's 500 ms reveal scheduling, skip/review timing, bot execution, clock display polling, result/profile integration, and other coordination outside this slice. The bot timer calls a temporary session reveal hook so there is still only one roll state machine. `GameManager.getSession()` remains canonical, while `getGame()` is retained for incremental consumers.

Other follow-ups:

1. **ARCH-02C — Move bot orchestration behind MatchSession.** Preserve current bot selection and pacing.
2. **ARCH-02D — Move clock, skip, and turn-transition orchestration behind MatchSession.** Define authoritative timestamps before online transport.
3. Add snapshot restoration/validation, action reconciliation, and monotonic snapshot revision before online transport.
4. Move profile match-ID/time generation behind injected ports; it is infrastructure and not part of game authority.
5. Add room/lobby DTOs only alongside an agreed protocol.

No WebSocket, polling, room, authentication, server mock, networking dependency, multiplayer UI, or mobile UI is included.

## Architecture guard

`npm run test:architecture` scans domain, application, and engine sources for React/presentation/style imports and direct DOM/storage usage. Targeted Board rules reject direct selection/move mutation, DiceEngine access, canonical roll state/timing, and resolved-phase clock starts. This does not claim that presentation is fully detached from the compatibility engine.
