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

## AUTH-01B production provider

Supabase Auth is the production authentication provider and Google is the primary authenticated sign-in method. `SupabaseAuthenticationAdapter` is the only owner of Supabase SDK auth types and maps the stable Supabase user UUID to application `AccountId`. Its public account DTO contains only `accountId` and `provider: "google"`; email, name, avatar, provider metadata, access tokens, and refresh tokens never cross the adapter.

Application composition creates exactly one auth source. With valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, it creates one Supabase client/adapter; missing or invalid public configuration deliberately falls back to `GuestAuthenticationAdapter`, so offline singleplayer remains usable. No service-role key belongs in browser configuration.

The browser OAuth redirect uses `window.location.origin`. Supabase handles URL session detection, token exchange, refresh, and persistence. No dedicated callback route or manual token parsing is used. The current origin must remain on the Supabase redirect allowlist.

Explicit guest choice is stored as the non-sensitive preference `roulettechess.auth-mode.v1`. It is not identity or authorization. With configured Supabase, the choice creates/restores Supabase Anonymous Auth; provider failure degrades to a tagged local Guest. A signed-in Supabase session takes precedence. Sign-out ends the permanent session and requests a cloud Guest without deleting profile or settings.

Storage remains separated:

```text
Supabase-managed auth session storage != RouletteChess PlayerProfile storage
                                      != guest-mode preference
```

Storage denial degrades to runtime-only state. Supabase and guest preference storage operations use guarded access; gameplay/profile repositories retain their existing fallback behavior.

Authenticated accounts are candidates for future ranked leaderboard participation. Guests remain ineligible for future ranked leaderboard participation; their cloud profile stores casual progression only. Duplicate generated Guest display names are allowed. No leaderboard or username reservation exists.

The externally configured Supabase project must keep Google enabled, the Google OAuth callback owned by Supabase, the production Site URL, and allowlisted localhost/production redirect origins. Local and deployed builds require only empty-safe public variables documented in `.env.example`; actual values stay in `.env.local` and Vercel environment configuration.

## AUTH-01C player identity target

The application defines a provider-independent `PlayerId` plus focused player repository and migration contracts. PlayerId is neither local `PlayerProfile.playerId` nor `AccountId`; display-name changes and provider linking do not replace it. Supabase row/query types remain an infrastructure concern.

Supabase Anonymous Auth is the selected secure cloud Guest primitive because RLS can recognize `auth.uid()` without trusting a client-provided UUID. Supported identity linking is the normal Guest-to-Google path. A pre-existing Google identity uses an explicit transactional replacement choice, never arithmetic merge. See `PLAYER_DATA_MODEL.md` and the versioned migration.

DATA-01A and the DATA-01B progression-operation migration are **APPLIED**. DATA-01B adds configured cloud Guest creation and a cloud-canonical/cache synchronization coordinator; catalog and two-client remote security verification passed. DATA-01C uses Supabase Manual Linking through a dedicated migration adapter on the same composed client; details are in `ACCOUNT_MIGRATION.md`.
