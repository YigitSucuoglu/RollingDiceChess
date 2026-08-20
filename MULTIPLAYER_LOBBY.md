# RouletteChess Multiplayer Lobby Experience

## Information architecture

`/multiplayer` is a first-class Home destination alongside local Play. Cloud Guests and
Google-linked accounts can create, browse, and join real Supabase lobbies. A local-only
Guest receives an online-profile requirement with Retry and Singleplayer actions; the UI
never pretends that a local lobby exists.

The browse state presents Create Lobby, Join Private Lobby, and Open Lobbies without nested
navigation. Public cards contain only display name, public discriminator, rating, mode,
time control, side policy, and a Join action. UUIDs, auth IDs, email, provider metadata, and
private codes are absent.

## Create and join

- Public is the default visibility; Private creates a server-owned six-digit string code.
- Ranked is the default mode and locks side to Random.
- Unranked permits White, Black, or Random host preference.
- The initial lobby controls are 3+0, 5+1, and 10+0.
- Private input accepts exactly six digits, preserves leading zeroes, supports numeric mobile
  keyboards and Enter submission, and never logs the code.
- Every mutation has a single in-flight UI lock. Server membership uniqueness and row locks
  remain the final duplicate/race protection.

## Waiting and ready rooms

The server snapshot is the only lobby truth. Waiting rooms show the host, visibility,
mode/time/side, and private code where applicable. Ready rooms show both public identities
and ratings. Only the host sees Kick and Start; only the opponent sees Leave. Host close,
opponent leave, and kick are pre-match operations with no XP, rating, loss, or forfeit.

Start invokes the real idempotent server request and returns a safe match identifier plus
initializing/active transition metadata. MULTIPLAYER-01B renders a production-safe preparing
state and does not fake a playable board. Trusted activation and the actual online Game UI
are consumed by MULTIPLAYER-01C.

## Realtime and reconciliation

The infrastructure adapter owns Supabase RPCs, normalization, safe error mapping, and one
Realtime subscription. React imports no Supabase SDK. The public event stream contains only
global invalidations; participant events contain a lobby ID visible solely through
caller-bound RLS. Events never contain private codes or profiles.

Realtime is an invalidation hint, not canonical state. Every relevant event refetches the
authoritative list/context/snapshot. Focus, browser-online recovery, and a conservative
30-second reconciliation interval repair missed events and expire stale cards without
aggressive polling. Route cleanup removes the listener/channel and recovery handlers.
Canonical membership restoration prevents a second tab or refresh from creating a second
lobby.

## Future multiplayer Game requirement

MULTIPLAYER-01C must render the authoritative two-player Game state. Multiplayer has no Roll
button: the server generates the roulette result automatically. The freed button area must
make the machine/reels and symbols proportionally larger on desktop and mobile without
shrinking or crowding the board and clocks.

## Verification split

Normal Chromium E2E uses a deterministic application-port adapter and the global request
guard, producing zero Supabase requests and zero anonymous users. Live schema/RLS/RPC checks
remain explicit through `npm run test:multiplayer:remote`. Two real browser contexts are
still required for final human acceptance of Realtime timing and clipboard behavior.

## ACTIVE game handoff

Host Start now calls the trusted Vercel authority and routes to `/game/:matchId`. Opponents
observe the membership transition and reconcile the same route. Reopening Multiplayer or
refreshing restores the durable active match rather than the former preparation placeholder.
Pre-ACTIVE Leave remains penalty-free; after ACTIVE the same control becomes authoritative
forfeit.
