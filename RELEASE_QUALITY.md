# RouletteChess Release Quality

This document defines the automated and manual gates required before a RouletteChess release is considered technically ready.

## Current test inventory

| Alan | Mevcut test | Çalıştırılan komut | Durum | Bilinen açık |
|---|---|---|---|---|
| Engine rules | Yok | — | Açık | ChessBoard, special moves, king capture and turn-right rules lack an automated suite. |
| TurnResolver | Yok | — | Açık | Maximum-continuation behavior has no repository test command. |
| Move generation / execution | Yok | — | Açık | Movement, capture, castling, promotion and en passant need focused regression coverage. |
| Bot / sequence evaluation | Yok | — | Açık | Easy/Medium/Hard planners, cancellation and sequence scoring are not automatically tested. |
| Chess clock | Yok | — | Açık | Countdown, increment, turn activation and timeout need automated regression coverage. |
| Profile / XP / repositories | `scripts/profile-tests.cjs` | `npm run test:profile` | Var | Formatting, UI animation and browser integration remain manual. |
| Settings | Repository/default/reset checks within profile test | `npm run test:profile` | Kısmi | React Settings UI and dialog interaction are not browser-tested. |
| i18n | EN/TR recursive key/type/empty-value parity | `npm run test:i18n` | Var | Visual overflow and route-by-route translation rendering remain manual. |
| Sound no-op | Missing-source playback, no Audio creation, toggle and persistence | `npm run test:sound` | Var | Real production sound playback awaits SOUND-01B. |
| TypeScript | Project references, `noEmit`, unused checks | `npm run typecheck` | Var | Runtime behavior is outside typechecking scope. |
| ESLint | TypeScript/React Hooks/React Refresh rules | `npm run lint` | Var | CSS and Markdown style are not linted. |
| Production build | Vite production bundle after typecheck | `npm run build` | Var | Bundle budget/performance baseline is deferred to PERF-01. |
| Release output | Dynamic dist reference, asset and leakage checks | `npm run test:release-smoke` | Var | It is a filesystem smoke test, not browser E2E. |

The missing gameplay/browser coverage is deliberate backlog for `QA-01 — Critical regression coverage`; this task does not represent those areas as tested.

## Standard commands

- `npm run typecheck`: runs `tsc -b --pretty false`. Both application and Vite config project references use `noEmit`, so it produces no production asset bundle.
- `npm run lint`: runs the existing ESLint configuration.
- `npm run test`: aggregates every current automatic test: i18n, profile/settings/progression, and sound no-op. Individual `test:*` commands remain available.
- `npm run build`: runs typecheck and then Vite. This preserves the safety of the standalone build command.
- `npm run test:release-smoke`: validates an already-generated `dist` directory.
- `npm run validate`: local mandatory gate in the order typecheck → lint → test → Vite build → release smoke. It invokes Vite directly so typecheck is not repeated through `npm run build`.
- `npm run validate:ci`: deterministic, non-watch CI entry point. It currently delegates to the same complete validation gate, keeping local and CI behavior aligned.

## Production build smoke checks

`scripts/release-smoke-tests.cjs` checks dynamically generated Vite output without hard-coding content hashes:

- `dist` and non-empty `dist/index.html` exist.
- At least one referenced JavaScript bundle exists; every referenced JS/CSS file exists.
- The referenced favicon exists.
- No `.wav`, `.artifacts`, screenshot or comparison output enters `dist`.
- Home and Game production machine/lever variants exist.
- All twelve Gold Piece Set files exist.
- The 24 Classic/Retro SVGs are present as embedded Vite data assets.
- Inspectable build files contain no absolute Windows drive path or local `C:/Users` / `D:/Users` development path.

The smoke test intentionally does not launch a browser and does not replace QA-01/E2E coverage.

## Case sensitivity

All current static asset imports were audited against on-disk casing during CLEANUP-01A. No mismatch or alternate-casing duplicate was found. The quality workflow runs checkout, typecheck and Vite build on `ubuntu-latest`; Linux filesystem semantics make incorrect import/asset casing fail the CI gate naturally. No additional case-analysis dependency is warranted today.

## GitHub Actions

`.github/workflows/quality.yml` runs on pushes and pull requests targeting `main`, plus manual `workflow_dispatch`.

The single read-only job:

1. checks out the repository;
2. installs Node 24 with npm cache support;
3. runs `npm ci` from the committed lock file;
4. runs `npm run validate:ci`;
5. fails immediately if any gate fails.

Node 24 is selected because the local project runs Node 24, `@types/node` is version 24, and Node 24 is the matching LTS line. `package.json` and the lock-file root declare `>=24 <25` to keep local/CI expectations explicit. The workflow has only `contents: read`, uses no secrets, writes nothing to the repository, and performs no deployment.

An isolated temporary-copy `npm ci` verification passed on 2026-08-03 (161 packages installed from the lock file). npm reported four existing high-severity audit findings. No dependency was added, upgraded, downgraded, or automatically fixed in this task; dependency remediation requires a separately reviewed change because `npm audit fix --force` may be breaking.

## Release checklist

### Automated gates

- [ ] `npm ci` succeeds from the committed lock file.
- [ ] `npm run validate` succeeds locally.
- [ ] GitHub Actions `Quality` workflow succeeds for the release commit/PR.
- [ ] `git diff --check` succeeds.

### Manual critical smoke

- [ ] Home and Play Setup open; a game can be started.
- [ ] Human ROLL, bot turn and synchronized lever/reel flow work.
- [ ] Profile and Settings open; English/Türkçe switching works.
- [ ] Sound toggle produces no error while production assets are absent.
- [ ] Result modal and Play Again/Main Menu flows work.

## Release-ready definition

A release is technically ready only when all of the following are true:

1. A fresh `npm ci` succeeds.
2. TypeScript, ESLint, all current tests, production build and release smoke pass.
3. The GitHub Actions Quality workflow is green.
4. The manual critical smoke checklist is complete.
5. The working tree is clean and `git diff --check` passes.
6. The application version and `PROJECT_STATUS.md` agree.

Failure of any mandatory gate means the release is not ready. The current green gates do not imply full chess/gameplay regression coverage; QA-01 owns that expansion.

## Future extension

The general `validate` / `validate:ci` names are intentionally workspace-neutral. If the repository later adopts `apps/web`, `apps/server`, `apps/mobile`, or `packages/game-core`, their focused gates can be composed beneath the same top-level contract without changing release automation semantics.
