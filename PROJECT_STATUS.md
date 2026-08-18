# RouletteChess - Project Status

## Current Version

v1.0.0

---

## Current Architecture

- Engine is completely independent from React.
- TurnResolver validates all legal move sequences.
- DiceEngine generates turn rights.
- currentRoll stores the original roll for the turn.
- remainingRights stores consumable move rights.
- UI never mutates engine state.

---

## Completed

### Quality
- GAME-EXIT-01 — Add safe active-match exit and abandon lifecycle
- PROFILE-IDENTITY-01B — Implement account username onboarding and profile rename UX
- PROFILE-IDENTITY-01A — Add immutable public player discriminator and account username policy foundation
- DATA-01C-HF1 — Fix canonical profile handoff after account conflict resolution
- DATA-01C — Implement Guest-to-Google identity linking and profile conflict resolution
- DATA-01B-HF1 — Decouple normal browser E2E from live Supabase Guest creation
- DATA-01B — Integrate runtime cloud Guest identity and profile synchronization
- DATA-01A — Apply Supabase player schema and validate RLS/security
- AUTH-01C — Establish cloud player identity, profile ownership and Guest-to-Account migration model
- AUTH-01B-HF1 — Correct Firefox qualification handling for benign request cancellations
- AUTH-01B — Integrate Supabase Google authentication and Guest entry flow
- AUTH-01A — Establish provider-independent account and authentication foundation
- RELEASE-1.0.0 — Promote the qualified v0.11.7 RC line to the first official RouletteChess singleplayer release
- RELEASE-01D-HF1 — Close final CI, deployment and production smoke release gates
- RELEASE-01D — Release candidate and public beta launch readiness (conditional gates documented)
- RELEASE-01C — Beta performance and production hardening
- RELEASE-01B — Cross-browser and real-device beta qualification (automation complete; physical-device gate remains)
- RELEASE-01A — Public Beta Readiness Audit and Critical Hardening
- OBS-01B — Configure and verify live production error reporting
- OBS-01A — Add privacy-safe error boundary and Sentry-ready observability foundation
- DEPLOY-01B-HF1 — Add first-game asset loading state and restore mobile Play Setup scrolling
- DEPLOY-01A — Prepare Vercel preview and staging deployment
- PERF-02 — Optimize Home image delivery and LCP without visible quality loss
- PERF-01 — Establish production performance, bundle and runtime baseline
- QA-01 — Add critical engine, gameplay and browser regression coverage
- RELEASE-QUALITY-01 — Add automated validation, production smoke checks and GitHub Actions quality gates

### Engine
- ARCH-02D — Move clock, skip and turn-transition orchestration behind MatchSession
- ARCH-02C — Move bot turn orchestration behind MatchSession
- ARCH-02B — Move manual roll lifecycle orchestration behind MatchSession
- ARCH-02A — Route Board selection and move intents through MatchSession
- ARCH-01 — Prepare local match architecture for future server-authoritative multiplayer and mobile clients
- Classical chess rules completed
- TurnResolver completed
- Simulation engine completed
- DiceEngine integrated
- Automatic pass system completed
- E-03A — Move History Data Model and Notation Generator
- AI-01A — Bot Framework
- AI-01B — Random Legal Bot
- AI-01C — Heuristic Bot v1
- AI-01D1 — Turn Sequence Generator
- AI-01D2 — Sequence Evaluation & Bot Integration
- AI-01E — Tactical Exposure Evaluation
- AI-01F — Positional Evaluation
- AI-02A — Bot Difficulty Architecture
- UX-01 — Mandatory Roll Reveal Before Auto Pass
- CLOCK-01A — Chess Clock Engine & Timeout
- CLOCK-01B — Dual Clock UI & Full Game Integration

### UI
- PROFILE-01 — Add offline player profile, statistics, XP progression and profile page
- SETTINGS-01 — Add premium settings page
- I18N-01 — Add English and Turkish localization support
- LEVER-02 — Add synchronized mechanical lever animation
- GAME-UX-01 — Center turn-skipped feedback and add animated result XP progression
- HELP-01 — Add comprehensive How to Play guide
- LEVER-01 — Integrate new slot machine and static lever assets
- HOME-01 — Redesign Home Screen and rebrand product as RouletteChess, including hero asset cleanup, caption cleanup, lever positioning, and profile hierarchy polish
- GOLD-03 — Integrate Gold Piece Set with board optical alignment and reel clipping
- GOLD-02 — Prepare Production Gold Piece Assets
- PIECESET-01B — Replace Classic Unicode Symbols with revised Classic SVG design
- PIECESET-01 — Rename Piece Theme Architecture to Piece Set
- BUG-01 — Prevent Automatic Human Roll After Initial No-Move Result
- UI-01B — Collapsible Move History & Adaptive Desktop Layout with Desktop Overflow Fix
- UI-01A — Game Screen Layout & Board Priority
- SOUND-01A — Core Sound Effects Foundation
- THEME-02A — Board Theme Integration
- THEME-01B — Classic Piece Assets
- THEME-01A — Piece Set Foundation
- AI-02B — Difficulty Selection UI
- UI-04A — Full Play Setup Screen with time control and side selection
- UI-04C — Board Coordinates & Player Perspective
- Current Roll panel (3 fixed slots)
- Roll animation state and move lock
- Roulette slot animation
- Slot machine asset pipeline
- Slot machine frame integration with calibrated reel windows
- Gold chess symbol assets and roulette integration
- Independent reel component foundation
- Real vertical reel animation with verified sequential symbol travel
- Reel landing polish with easing, subtle overshoot, and reduced-motion support
- Manual ROLL button and explicit ready, spinning, and resolved UI phases
- Decorative lever asset with ROLL-synchronized animation
- Premium compact top Game HUD with integrated slot presentation
- UI-03B — Two-Column Move History Panel
- King-capture result dialog with Play Again and Main Menu flows
- Winner screen

---

## Current Sprint

Completed:
- GAME-EXIT-01 — Add safe active-match exit and abandon lifecycle
- PROFILE-IDENTITY-01B — Implement account username onboarding and profile rename UX
- PROFILE-IDENTITY-01A — Add immutable public player discriminator and account username policy foundation
- DATA-01C-HF1 — Fix canonical profile handoff after account conflict resolution
- DATA-01C — Implement Guest-to-Google identity linking and profile conflict resolution
- DATA-01B-HF1 — Decouple normal browser E2E from live Supabase Guest creation
- DATA-01B — Integrate runtime cloud Guest identity and profile synchronization
- DATA-01A — Apply Supabase player schema and validate RLS/security
- AUTH-01C — Establish cloud player identity, profile ownership and Guest-to-Account migration model
- AUTH-01B-HF1 — Correct Firefox qualification handling for benign request cancellations
- AUTH-01B — Integrate Supabase Google authentication and Guest entry flow
- AUTH-01A — Establish provider-independent account and authentication foundation
- RELEASE-1.0.0 — Finalize the first official RouletteChess singleplayer release
- RELEASE-01D-HF1 — Close final CI, deployment and production smoke release gates
- RELEASE-01D — Release candidate and public beta launch readiness (conditional gates documented)
- RELEASE-01C — Beta performance and production hardening
- RELEASE-01B — Cross-browser and real-device beta qualification (automation complete; physical-device gate remains)
- RELEASE-01A — Public Beta Readiness Audit and Critical Hardening
- ARCH-02D — Move clock, skip and turn-transition orchestration behind MatchSession
- ARCH-02C — Move bot turn orchestration behind MatchSession
- ARCH-02B — Move manual roll lifecycle orchestration behind MatchSession
- ARCH-02A — Route Board selection and move intents through MatchSession
- ARCH-01 — Prepare local match architecture for future server-authoritative multiplayer and mobile clients
- OBS-01B — Configure and verify live production error reporting
- OBS-01A — Add privacy-safe error boundary and Sentry-ready observability foundation
- DEPLOY-01B-HF1 — Add first-game asset loading state and restore mobile Play Setup scrolling
- DEPLOY-01A — Prepare Vercel preview and staging deployment
- PERF-02 — Optimize Home image delivery and LCP without visible quality loss
- PERF-01 — Establish production performance, bundle and runtime baseline
- QA-01 — Add critical engine, gameplay and browser regression coverage
- RELEASE-QUALITY-01 — Add automated validation, production smoke checks and GitHub Actions quality gates
- PROFILE-01 — Add offline player profile, statistics, XP progression and profile page
- SETTINGS-01 — Add premium settings page
- I18N-01 — Add English and Turkish localization support
- LEVER-02 — Add synchronized mechanical lever animation
- GAME-UX-01 — Center turn-skipped feedback and add animated result XP progression
- HELP-01 — Add comprehensive How to Play guide
- LEVER-01 — Integrate new slot machine and static lever assets
- HOME-01 — Redesign Home Screen and rebrand product as RouletteChess, including hero asset cleanup, caption cleanup, lever positioning, and profile hierarchy polish
- GOLD-03 — Integrate Gold Piece Set with board optical alignment and reel clipping
- GOLD-02 — Prepare Production Gold Piece Assets
- PIECESET-01B — Replace Classic Unicode Symbols with revised Classic SVG design
- PIECESET-01 — Rename Piece Theme Architecture to Piece Set
- BUG-01 — Prevent Automatic Human Roll After Initial No-Move Result
- UI-01B — Collapsible Move History & Adaptive Desktop Layout with Desktop Overflow Fix
- UI-01A — Game Screen Layout & Board Priority

Next:
1. RATING-01 — Design and implement authoritative multiplayer rating model

Roadmap:
- DATA-01A — Apply Supabase player schema and validate RLS/security
- DATA-01B — Integrate runtime cloud Guest identity and profile synchronization
- DATA-01C — Implement Guest-to-Google identity linking and profile conflict resolution
- PROFILE-IDENTITY-01 — Add a public 5-character player discriminator
- RATING-01 — Design authoritative multiplayer rating
- LEADERBOARD-01 — Add PlayerId-based multiplayer leaderboard

Backlog:
- SOUND-01B — Add production sound assets to the preserved sound architecture
- FINAL-POLISH — Revisit Game slot machine sizing and reel readability after core features are complete.

Performance Backlog:
- AI-PERF-01 — Profile Hard bot sequence evaluation latency
- RENDER-PERF-01 — Profile clock-driven Board renders

---

## Important Notes

- currentRoll never changes during a turn.
- remainingRights changes after each move.
- Animation must never modify engine state.
- Winner state overrides the roll display.
- Piece Set controls board pieces, slot symbols, and result visuals through one central resolver; Board Theme remains independent.
- The ROLL button is the primary human interaction; the lever remains a separate presentation layer and animates from the shared roll phase without modifying engine state.
- Check and checkmate do not exist; the game ends only when a king is captured.
- Move history data infrastructure and two-column, three-slot UI are complete.
- Play Setup stores time control, player side, and Easy/Medium/Hard bot difficulty; Medium is the default and legacy fallback.
- Heuristic Bot scores current TurnResolver-approved moves after the shared roll animation.
- Turn Sequence Generator enumerates maximum-right continuations without mutating live game state.
- Default bot evaluates and safely executes complete maximum-right turn sequences.
- Sequence evaluation penalizes the highest exposed non-king material on the final board.
- Positional evaluation adds low-weight center, development, and mobility signals.
- Difficulty mapping: Easy uses random single moves, Medium uses heuristic single moves, and Hard uses full sequence evaluation.
- Difficulty UI descriptions: Easy — Random legal moves; Medium — Tactical move choices; Hard — Plans the full turn.
- Classic uses revised, Unicode-diagram-inspired local SVGs across the Board, Slot, and Result Modal.
- Retro uses the original local, contrast-outlined SVGs across the Board, Slot, and Result Modal.
- Gold, Classic, and Retro Piece Sets are selectable; Gold uses production Gold/Obsidian PNGs and registry-owned render scales.
- Wood, Marble, and Dark Board Themes are integrated and affect only board squares, surface, frame, and coordinates.
- Piece Set and Board Theme remain independent; Wood/Marble/Dark each support both Classic and Retro pieces.
- Central SoundManager provides cached, master-mutable audio with a persistent turn-header toggle.
- Supported effects: Roll button, Lever pull, Reel spin, Reel stop, Move, Capture, Turn skipped, Victory, Defeat, and Timeout.
- Lever audio and the pivot-based mechanical lever animation are synchronized through the shared roll flow; volume sliders and background music are not included.
- Desktop game layout prioritizes a viewport-sized board with a narrow secondary Move History panel.
- Move History starts closed, releases its layout space, and keeps the centered desktop game layout free of page-level overflow.
- At narrow breakpoints, Move History stacks below the main game column and remains internally scrollable.
- UI-01A changes layout only; gameplay, bot pacing, clock, and sound behavior remain unchanged.
- Chess clock engine, timeout result, and perspective-aware dual clock UI are complete.
- Offline profile data is versioned behind a repository/service boundary; gameplay emits domain events and Profile UI renders a prepared view model.
- Result UI receives idempotent pre/post-match XP snapshots and service-generated animation segments; turn-skipped feedback is anchored to the board center.
- Settings exposes only working Sound Effects, language preference, and repository-backed offline profile reset controls.
- English is the source and fallback locale; Turkish can be selected instantly and persists through the existing settings repository.
- Production observability is centralized, privacy-scrubbed, and a complete no-op without a production DSN; the React error boundary remains functional independently of remote reporting.
- OBS-01B live verification confirmed handled and Error Boundary events in production, matching environment/release metadata, and original-source resolution through uploaded source maps; the temporary Production test flag was removed and the application was redeployed.
- Local bot matches are assembled through a versioned MatchSession boundary and explicit platform adapters; future online sessions must use a separate server-authoritative adapter rather than local client authority.
- Board selection, legal-target hints, and player move submission now flow through MatchSession actions and immutable snapshots; roll, bot, and clock orchestration remain intentionally incremental.
- Manual roll ready/spinning/resolved lifecycle, duplicate protection, and resolved-phase clock handoff are session-owned; reel, lever, and sound effects remain presentation-owned.
- Bot detection, 500 ms start pacing, automatic reveal, planner execution, move publication, and cancellation are session-owned; Board only renders their snapshot effects.
- Clock snapshot refresh, no-playable-turn review/message/transition timing, timeout cleanup, controller identity, and interaction capabilities are session-owned; Board renders immutable lifecycle facts and presentation effects only.
- RELEASE-01A found no P0 blocker; profile persistence now survives unavailable browser storage, board squares have baseline keyboard access, and remaining beta risks are tracked in RELEASE_READINESS.md.
- RELEASE-01B adds a release-critical Chrome/Edge/Firefox/WebKit and mobile-profile matrix plus CI coverage; installed Chrome, installed Edge, and Android Chromium emulation passed locally, while Firefox/WebKit and all physical-device targets remain explicitly unqualified.
- RELEASE-01C replaces oversized runtime Gold and Game slot PNG delivery with deterministic alpha-preserving WebP derivatives, keeps master PNGs as sources, adds measured route-level splitting and cold-load tooling, closes the React Router advisory with 7.18.2, and adds a `100dvh` result-dialog fallback. Physical iPhone/Safari qualification remains open.
- RELEASE-01D treats v0.11.7 as feature-frozen and records a CONDITIONAL GO: local validation, Chromium, Edge, and Android-emulated gates pass; actual GitHub Firefox/WebKit results plus Vercel production smoke remain mandatory before public exposure. Physical iPhone/Safari and Android are accepted but explicitly NOT TESTED gaps.
- RELEASE-01D-HF1 records the final GO for a limited single-player beta after developer-confirmed GitHub workflows, successful Vercel production deployment, and manual production smoke with no observed issue. Physical iPhone/Safari and Android remain explicitly NOT TESTED accepted gaps; Public Beta is not marked launched until PUBLIC-BETA-01.
- RELEASE-1.0.0 promotes the qualified v0.11.7 release-candidate line to the first official RouletteChess singleplayer release. No gameplay or runtime behavior changed for this promotion.
- AUTH-01A separates application account identity from the browser-local Player Profile behind a provider-independent AuthenticationPort. The current runtime uses an offline GuestAuthenticationAdapter; provider selection, login UI, remote persistence, and guest-profile merge policy are deferred.
- AUTH-01B selects Supabase Auth with Google OAuth behind the existing AuthenticationPort, adds an explicit persistent local Guest choice, and keeps PlayerProfile data local and untouched. Authenticated accounts are future leaderboard candidates; guest migration, database profile persistence, and display-name UX remain deferred.
- AUTH-01B-HF1 distinguishes Firefox navigation-superseded image cancellations from real request failures in QA fixtures while adding explicit fatal handling for HTTP 4xx/5xx responses.
- AUTH-01C defines stable PlayerId ownership, normalized progression/rating storage, anonymous-Guest target architecture and transactional replacement-based conflict resolution. DATA-01A applied the schema, passed catalog assertions and proved own/cross RLS isolation plus player, progression, rating and ownership mutation denial through two real publishable-key anonymous sessions. Anonymous Sign-Ins are enabled; the formerly deferred runtime cloud and identity-linking work is completed by DATA-01B/DATA-01C.
- DATA-01B creates/restores cloud-backed Guests when configured, retains local Guest fallback, treats cloud as canonical after safe bootstrap, queues idempotent offline match operations, and blocks unsafe cloud-profile reset. Its separate migration, catalog verification, two-client RLS/replay/rating harness, and Chromium runtime suite passed. Manual Linking is now enabled and DATA-01C owns the completed Guest-to-Google conflict flow.
- DATA-01B-HF1 keeps normal Chromium E2E self-contained through compile-time E2E cloud/local fixtures and a strict Supabase request guard. Live Supabase validation remains opt-in through `test:data:remote`; production and Vercel retain the real DATA-01B adapters.
- DATA-01C connects a cloud Guest to Google through Supabase Manual Linking while preserving the Guest PlayerId when no conflict exists. Existing Google progression triggers an explicit Keep Guest/Keep Google choice; profiles are never arithmetically merged, the losing PlayerId is retired/replaced, and the surviving rating remains unchanged. Migration intents are expiry-aware, hash-backed, bound to Guest ownership and the permanent account, and same-decision replay is idempotent while contradictory replay is rejected. The migration and catalog verification were applied successfully; the publishable-key remote harness passed its safe automated gates. Real Google OAuth and destructive conflict choices remain explicitly manual verification.
- DATA-01C-HF1 replaces the stale post-conflict reinitialization path with an explicit server-confirmed canonical profile adoption. The survivor PlayerId and cloud snapshot now replace sync state and local cache before progression resumes; unresolved conflicts show a migration-pending account state without normal Sign Out/Play actions and remain safely resumable without choosing or retiring either profile.
- PROFILE-IDENTITY-01A adds a server-generated, immutable, globally unique five-character public discriminator without exposing or replacing PlayerId. Existing rows were backfilled in place; account names remain non-unique but cannot enter the reserved `Guest####` namespace, Guest names remain system-owned, and durable username onboarding state is carried with the canonical profile. The remote migration, 51-row schema verification, deterministic collision check, and publishable-key security harness passed.
- PROFILE-IDENTITY-01B gates all normal routes behind canonical account username onboarding when required, provides Sign Out without a Skip path, and adds account-only Profile rename through the existing caller-authorized atomic RPC. Refresh/direct routes cannot bypass the server-owned flag; Guest rename remains blocked in application and database boundaries, while UUID PlayerId, discriminator, progression, statistics and rating remain unchanged.
- GAME-EXIT-01 routes exit confirmation and abandonment through MatchSession. Local bot abandonment is distinct from a completed loss, grants no XP or completed-game statistics, and cancels local roll, bot, skip, and clock work. Future ranked forfeit and rating effects remain server-authoritative; refresh/tab-close reliability is intentionally deferred to online presence and reconnect semantics.

### Versioning Policy

- v1.0.0 is the first official singleplayer release.
- v1.0.x is reserved for real bugfix and hotfix releases.
- v1.x.0 is reserved for meaningful backward-compatible product or architecture milestones.
- v2.0.0 is the intended major milestone for publicly available multiplayer.
- Task identifiers such as AUTH-01, DATA-01, and MULTI-01 are independent from semantic version numbers.


## Future UI Polish

- Replace temporary blend-mode background removal with true transparent slot frame assets.
- Split lever into layered assets to achieve proper mechanical occlusion and depth.
