# RouletteChess Authentication Architecture

## Current ownership audit

- `PlayerProfile` owns browser-local progression: its local `playerId`, display name, XP, statistics, creation time, and processed match IDs.
- `LocalStoragePlayerProfileRepository` owns versioned profile persistence and safe storage fallback. `PlayerProfileService` consumes match events and updates that repository.
- App settings use a separate local repository. Neither settings nor profile persistence represents an authenticated account.
- `LocalBotMatchSession` receives profile-event behavior during local match composition; it does not authenticate users and its snapshots contain no account or credential data.
- UI pages render profile/settings view models but do not decide authentication identity.
- Observability removes Sentry user/extra data and accepts only allow-listed contexts and tags. Authentication DTOs must never be passed as observability context.

The legacy name `PlayerProfile.playerId` can look like a permanent user identity. It is only a local profile-record identifier. Treating it as an account ID would couple one browser's storage to future remote identity and must be avoided.

## AUTH-01A boundary

`AuthenticationPort` is the application-facing boundary for current state, restoration, subscription, future interactive authentication, sign-out, and disposal. Its DTOs are tagged, JSON-safe data with application-owned `AccountId`; they contain no provider object, email, name, photo, credential, token, cookie, or browser API.

The current composition creates `GuestAuthenticationAdapter`. It establishes one stable guest session per application runtime, performs no network request, persists no credential, and leaves existing offline singleplayer/profile behavior unchanged. A future production adapter belongs under `src/infrastructure/auth` and replaces the guest adapter at composition without changing Game, engine, MatchSession, profile, or presentation contracts.

```text
AuthenticationPort -> infrastructure auth adapter -> application composition
                                                    -> match creation -> MatchSession -> Game
Local profile repository --------------------------> progression/statistics
```

Authentication identifies who holds an account. Player Profile stores RouletteChess progression and statistics. They remain separate models and may later be associated through `AccountProfileAssociation`.

## Guest-to-account migration boundary

`GuestProfileMigrationPort` and `GuestProfileMigrationCandidate` describe discovery of an existing local profile after an account becomes authenticated. AUTH-01A deliberately does not select or implement an adopt, merge, remote-wins, or conflict-rejection policy. No existing local profile is mutated or deleted. A later persistence task must add explicit version/conflict metadata before choosing a policy.

## Privacy, security, mobile, and multiplayer constraints

- Provider identifiers must be mapped to application-owned `AccountId`; provider payloads must not cross the adapter boundary.
- OAuth/access/refresh tokens, passwords, cookies, and credentials are never auth DTO fields, MatchSnapshot fields, generic LocalStorage records, logs, or Sentry context.
- Contracts contain no React, DOM, browser storage, or provider SDK types and are suitable for deterministic fake adapters and future mobile clients.
- Authentication is established before match creation. It never becomes match authority or game-rule logic.
- A future server-authoritative multiplayer adapter may receive an application account identity during secure session creation, but MatchSession/gameplay snapshots must remain credential-free.
