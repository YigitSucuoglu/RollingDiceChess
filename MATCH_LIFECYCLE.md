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

MULTIPLAYER-01A defines that future boundary: waiting/ready/starting lobby activity is
penalty-free, and only trusted atomic activation creates an ACTIVE match. Active explicit
Leave becomes a forfeit intent. Disconnect starts an independent 30-second grace deadline
without pausing the authoritative clock; timely reconnect restores the canonical snapshot.
One expired player is forfeit-eligible, while an unresolvable dual/infrastructure failure is
a technical abort rather than a draw. Final production adjudication remains deferred.

## Browser navigation boundary

While a local match is active, an in-app exit control and supported SPA Back navigation
open the same confirmation. Unknown browser and platform shutdown events are not treated
as confirmed abandon. Refresh, tab close, process termination, and mobile OS eviction
cannot be made reliable with client-only `beforeunload` handling, so no misleading custom
prompt or synchronous persistence hack is installed. Future online play must solve these
cases with server-owned presence, reconnect windows, and terminal match state.

## Online lifecycle implementation

Active multiplayer Leave is an authenticated forfeit intent. Ranked forfeits use the normal
RATING-01 formula; Unranked forfeits never change rating. Heartbeats extend server-owned
30-second deadlines without pausing the active clock. One expired participant becomes
`disconnect-forfeit`; dual expiry becomes `technical-abort` with no winner or rating effect.
The first locked terminal transition wins and match-ID settlement remains idempotent.
