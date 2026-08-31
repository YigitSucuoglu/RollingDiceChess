# RouletteChess Rating System

## Player rules

Ranked rating starts at **1000**. Equal-rated opponents exchange **15** points. Beating a
higher-rated player earns more, while beating a lower-rated player earns less. One ranked
match has a nominal movement of at least **5** and at most **25** points.

Player-facing summary:

> Ranked rating starts at 1000. Beating a higher-rated player earns more rating, while
> beating a lower-rated player earns less. A ranked match changes rating by at most 25 points.

Turkish reference:

> Dereceli puan 1000'den başlar. Daha yüksek puanlı bir oyuncuyu yenmek daha fazla, daha
> düşük puanlı bir oyuncuyu yenmek daha az puan kazandırır. Bir dereceli maçın nominal
> değişimi en fazla 25 puandır.

There is no ten-match placement or leaderboard gate. Guest players and Google-linked
players are both eligible because rating belongs to the canonical UUID `PlayerId`, not to
an account provider, display name, discriminator, local profile, XP, or level.

## Formula version 1

Given ratings `Ra` and `Rb`:

```text
D  = abs(Ra - Rb)
Dc = min(D, 200)

higher-rated winner: round(15 - Dc / 20)
lower-rated winner:  round(15 + Dc / 20)
equal ratings:       15
```

Only positive values are rounded. TypeScript uses `Math.round`; PostgreSQL uses
`round(numeric)`. Both therefore resolve a `.5` tie toward the next positive integer.
Examples include `18.75 -> 19` and `11.25 -> 11`.

The winner gains the nominal movement and the loser loses the same amount. This is
zero-sum except at the hard rating floor. A rating cannot fall below zero; if a rating-3
player loses a nominal five-point result, the winner receives `+5` and the loser receives
`-3`. This intentional floor exception creates two points rather than persisting `-2`.

The 200-point effective-difference cap means an expected favorite win bottoms out at
`+5/-5`, while an upset tops out at `+25/-25`, even when the real difference exceeds 200.

## Eligibility and outcomes

- Bot/singleplayer: no rating change.
- Multiplayer unranked: no rating change.
- Multiplayer ranked, normal win: formula applies.
- Multiplayer ranked, authoritative forfeit: the abandoning player loses and the same
  formula applies.
- Technical abort/cancellation/invalid server result: no rating change and is not a draw.
- Draws are not supported by the current RouletteChess result model.
- Win streak, XP, level, games played, account age, and discovery method never alter the
  formula.

Future lobby cards may display public identity, rating, Ranked/Unranked, and time control.
Friends with very different ratings can choose Unranked without hidden rating effects.
Leaderboard ordering will eventually use the authoritative current rating; provisional
eligibility, tier names, and leaderboard UI are deferred.

## Authority and persistence

`src/domain/rating` contains the provider-independent formula and eligibility contract. It
has no React, browser storage, Supabase, or gameplay dependency. These types describe data
that a future trusted match finalizer owns; they are not a browser submission API.

Current rating remains in `public.player_ratings.multiplayer_rating`. The RATING-01 database
migration adds:

- a validated non-negative constraint;
- `private.rating_settlements`, an append-only two-player audit/idempotency ledger keyed by
  authoritative match UUID;
- `private.settle_ranked_match`, a `SECURITY DEFINER` transaction function executable only
  by `service_role`.

The function validates ranked mode, participant identity, winner, and `normal|forfeit`
termination. It serializes duplicate match IDs with a transaction advisory lock, returns
the original result for identical retries, rejects contradictory replay, locks both rating
rows in stable UUID order, reads current database ratings, calculates, updates both rows,
and appends the ledger entry in one transaction. Stable lock ordering prevents deadlocks;
row locks prevent concurrent settlements from using stale browser snapshots.

Normal browser roles (`anon` and `authenticated`) cannot execute settlement, mutate ratings,
or write the ledger. No browser-callable "I won" RPC exists, and no service-role credential
belongs in the frontend. Real match-result authority remains deferred to the future
multiplayer server/session foundation.

MULTIPLAYER-01A defines the handoff: only a trusted ACTIVE ranked match ending in a normal
win or authoritative forfeit may invoke `private.settle_ranked_match`. Pre-ACTIVE lobby
leave/kick, Unranked outcomes, and technical abort never create settlement intent. Browser
code can call neither trusted match activation nor rating settlement.

## Identity lifecycle and retention

Guest-to-Google conflict resolution never merges ratings: the surviving `PlayerId` keeps
its own rating. Retired/replaced PlayerIds must later be excluded from active leaderboard
identity while retained for historical references. Future Guest cleanup should prefer
inactive/retired/anonymized retention over destructive deletion when rating or match history
references exist.

## Authoritative multiplayer integration

The Vercel trusted runtime is the only caller that connects terminal match state to
`private.settle_ranked_match`. Ranked king capture, timeout, explicit forfeit and
disconnect-forfeit settle from canonical participant IDs. Unranked and technical-abort
paths never invoke settlement. The append-only match-ID ledger makes retries and concurrent
terminal attempts exactly-once.

Real two-client Ranked settlement, refresh, and replay acceptance remains pending in
MULTIPLAYER-01D and is recorded through `MULTIPLAYER_QUALIFICATION.md`.
