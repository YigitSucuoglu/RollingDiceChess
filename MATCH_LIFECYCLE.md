# RouletteChess Match Lifecycle

## Current local bot lifecycle

`MatchSession` is the canonical owner of an active match lifecycle. Presentation sends
versioned intents and renders immutable snapshots; it does not award progression or
directly mutate `Game`.

```text
active ── king capture / timeout ──> completed
active ── confirmed leave ─────────> abandoned
```

- `completed` is a normal terminal result. The existing idempotent profile completion
  pipeline may award XP and update completed-game, win, or loss statistics.
- `abandoned` is a distinct non-result for local bot games. It has no winner, awards no
  XP, does not increment games played/wins/losses, and never enters the normal match
  completion or cloud progression-operation path.
- The first terminal event wins. A king capture or timeout observed before abandon is
  confirmed remains authoritative and the abandon intent is rejected.

Opening the leave confirmation pauses the active local clock and suspends bot, skip,
and turn-transition work. Returning resumes the same session. Confirming clears roll,
bot, skip, clock-refresh and engine clock callbacks, aborts bot planning, disposes the
local engine, then publishes one `abandoned` snapshot.

## Exit policy by mode

| Mode | Current semantic outcome | XP | Statistics | Rating |
| --- | --- | --- | --- | --- |
| Singleplayer bot | Abandoned | None | No completed game/loss | No effect |
| Future unranked multiplayer | Forfeit | None | Policy deferred | No effect |
| Future ranked multiplayer | Server-authoritative forfeit | None | Counts as loss | Server-authoritative change |

The multiplayer rows are policy contracts only. There is no multiplayer session,
rating mutation, disconnect protocol, or server forfeit implementation in GAME-EXIT-01.
A future online adapter must let the server decide disconnect grace, reconnect, forfeit,
result ordering, and ranked rating effects; client navigation cannot be authoritative.

## Browser navigation boundary

While a local match is active, an in-app exit control and supported SPA Back navigation
open the same confirmation. Unknown browser and platform shutdown events are not treated
as confirmed abandon. Refresh, tab close, process termination, and mobile OS eviction
cannot be made reliable with client-only `beforeunload` handling, so no misleading custom
prompt or synchronous persistence hack is installed. Future online play must solve these
cases with server-owned presence, reconnect windows, and terminal match state.
