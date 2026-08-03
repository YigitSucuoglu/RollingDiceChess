# CLEANUP-01A — Unused Project Artifacts Audit

> CLEANUP-01B applied on 2026-08-03: Batch A completed, Batch B completed, and temporary sound asset removal completed. The preserved sound architecture now treats missing production assets as a silent no-op.

Audit date: 2026-07-31  
Application version inspected: `v0.10.1`  
Scope: read-only repository audit. No application source, asset, version, or status file was changed.

## Method and confidence

- Enumerated image, audio, and font extensions under the repository, including hidden `.artifacts` content.
- Searched TypeScript/TSX imports, CSS `url(...)`, `index.html`, `public`, configuration, asset registries, piece-set and board-theme resolvers, tests, scripts, Markdown, and localization resources.
- Compared SHA-256 hashes and byte sizes to distinguish exact duplicates from similarly named variants.
- Inspected the Vite production output. This caught legacy assets that are not selected by UI components but still enter the bundle because they remain imported by `SLOT_MACHINE_ASSETS`.
- Dynamic asset paths were not found. Piece assets are selected indirectly but safely through `PIECE_SET_CATALOG`; audio is selected through `SOUND_CATALOG`; slot assets are selected through `SLOT_MACHINE_ASSETS`.
- TypeScript `noUnusedLocals` / `noUnusedParameters` and ESLint are enabled. Exported compatibility surfaces and CSS are not fully covered by those checks, so they were reviewed separately.

## Executive summary

| Result | Amount |
|---|---:|
| SAFE TO REMOVE estimate | 54,164,143 bytes (51.65 MiB) |
| `.artifacts` portion | 40,903,035 bytes (39.01 MiB) |
| Unreferenced superseded slot variants | 13,256,053 bytes (12.64 MiB) |
| Orphan `public/icons.svg` | 5,055 bytes |
| Legacy slot assets still pulled into the build | 3,732,237 bytes (3.56 MiB), **not** included in safe estimate |
| Audio selected for future replacement | 118,117 bytes, **not** safe to delete before registry replacement |

The safest first batch is `.artifacts`, `public/icons.svg`, and the six slot variants proven to have zero references. The largest application-bundle opportunity is a second, code-coupled cleanup of unused `SLOT_MACHINE_ASSETS.generated` and `.symbols` branches.

## Asset size by folder

Sizes include non-asset README/index files where they live in the folder; the dedicated asset totals above count only relevant removal candidates.

| Folder | Files | Bytes | MiB |
|---|---:|---:|---:|
| `.artifacts` (all subfolders) | 106 | 40,903,035 | 39.01 |
| `src/design/Tasarım` | 12 | 20,059,353 | 19.13 |
| `src/assets/slot-machine/generated` | 18 | 23,203,749 | 22.13 |
| `src/assets/slot-machine/source` | 2 | 7,640,255 | 7.29 |
| `src/assets/pieces/gold` | 12 | 6,869,326 | 6.55 |
| `src/assets/pieces/classic` | 13 | 5,393 | 0.005 |
| `src/assets/pieces/retro` | 13 | 4,565 | 0.004 |
| `src/assets/sounds` | 11 | 118,117 | 0.113 |
| `src/assets/slot-machine` root | 2 | 5,110 | 0.005 |
| `public` | 2 | 14,577 | 0.014 |
| **`src/assets` total** | **71** | **37,846,515** | **36.09** |

## 1. SAFE TO REMOVE

These items have no runtime, build, test, script, CSS, HTML, localization, or Markdown reference. Risk assumes the repository does not use unrecorded external/manual workflows.

| Exact path | Evidence | Replacement | Risk | Recommended action |
|---|---|---|---|---|
| `.artifacts/` (all 20 task subfolders and their screenshots/reports) | No repository reference; ignored QA outputs, comparison images, contact sheets, and measurement reports. Not consumed by Vite or tests. | None required; retain externally only if historical visual evidence is desired. | Low | Delete as one generated-artifact batch. |
| `public/icons.svg` | No `/icons.svg`, symbol fragment, import, CSS URL, HTML, test, or documentation reference. | Inline SVG icons already used by React components. | Low | Delete. |
| `src/assets/slot-machine/generated/new-lever.png` | Zero references; absent from slot registry and build output. | `update-lever-transparent.png` (Home) and `update-lever-game-trimmed.png` (Game). | Low | Delete. |
| `src/assets/slot-machine/generated/new-machine.png` | Zero references; absent from registry/build. | `update-machine-transparent.png` / `update-machine-game-trimmed.png`. | Low | Delete. |
| `src/assets/slot-machine/generated/new-machine-transparent.png` | Zero references; superseded transparent intermediate. | `update-machine-transparent.png`. | Low | Delete. |
| `src/assets/slot-machine/generated/slot-machine-frame-transparent.png` | Zero references; not the imported legacy `slot-machine-frame.png`. | Active Home/Game update-machine derivatives. | Low | Delete. |
| `src/assets/slot-machine/generated/update-lever.png` | Zero references; raw background-bearing source is not documented as a required source asset. | Transparent and game-trimmed derivatives. | Low | Delete or archive outside the runtime repository. |
| `src/assets/slot-machine/generated/update-machine.png` | Zero references; raw background-bearing source is not documented as a required source asset. | Transparent and game-trimmed derivatives. | Low | Delete or archive outside the runtime repository. |

`.artifacts/` exact subfolder inventory: `.artifacts/gold-02`, `gold-03`, `gold-03-hotfix`, `help-01`, `home-01`, `home-01-hotfix`, `home-01-hotfix-2`, `lever-01`, `lever-01b`, `lever-01c`, `lever-01d`, `lever-01e`, `lever-01f`, `pieceset-01b`, `profile-01`, `settings-01`, `ui-01a`, `ui-01b`, `ui-01b-hotfix`, and `ui-01b-hotfix-revision`.

## 2. PROBABLY UNUSED — MANUAL REVIEW

| Exact path | Evidence / uncertainty | Replacement | Risk | Recommended action |
|---|---|---|---|---|
| `src/design/Tasarım/gold-{bishop,king,knight,pawn,queen,rook}.png` | No code, CSS, test, build, or documentation references. These are large design originals and previous tasks explicitly treated `src/design` as a protected source area. | Production white assets in `src/assets/pieces/gold/`. | High | Do not delete automatically. Archive externally after visual/source-ownership review. |
| `src/design/Tasarım/obsidian-{bishop,king,knight,pawn,queen,rook}.png` | Same as above; likely source masters for black production assets. | Production black assets in `src/assets/pieces/gold/`. | High | Manual archive decision only. |
| `src/assets/pieces/classic/README.md` | Not runtime-used; documents generation/style constraints for an active set. | None. | Medium | Keep with active assets unless documentation is consolidated. |
| `src/assets/pieces/retro/README.md` | Not runtime-used; documents provenance of an active set. | None. | Medium | Keep with active assets unless documentation is consolidated. |

No local font files (`woff`, `woff2`, `ttf`, `otf`) exist. CSS uses system fonts only: Arial/Helvetica, Georgia/Times, and Roboto Mono/SFMono/Consolas fallbacks.

## 3. DUPLICATE / SUPERSEDED

### Exact duplicates

The following twelve files under `.artifacts/gold-02/candidates/` are byte-for-byte SHA-256 matches of the same basename under `src/assets/pieces/gold/`:

- `white-{king,queen,rook,bishop,knight,pawn}.png`
- `black-{king,queen,rook,bishop,knight,pawn}.png`

Category: duplicate/superseded; replacement: `src/assets/pieces/gold/<same-name>`; risk: low; action: remove with `.artifacts`.

Two screenshot pairs are exact same-size/name-purpose duplicates within QA artifacts and should not both be retained:

- `.artifacts/home-01-hotfix-2/home-caption-cleaned-1920x1080.png` and `home-lever-repositioned-1920x1080.png` (both 1,025,714 bytes; identical SHA-256 `1A5097E1…523C`).
- `.artifacts/ui-01b-hotfix/history-open-1600x900.png` and `.artifacts/ui-01b-hotfix-revision/revert-history-open-1600x900.png` (both 277,950 bytes; identical SHA-256 `67FA9A58…3BA`).

Both groups are already covered by the safe `.artifacts` batch.

### Legacy assets still imported by obsolete registry branches

These are visually superseded, but **not safe to delete alone** because `src/assets/slot-machine/index.ts` imports them. Vite build evidence confirms all appear in `dist/assets`.

| Exact path(s) | Current obsolete reference | Active replacement | Risk | Recommended action |
|---|---|---|---|---|
| `src/assets/slot-machine/generated/{pawn,knight,bishop,rook,queen,king}.png` | `SLOT_MACHINE_ASSETS.symbols`; no consumer reads `.symbols`, but imports pull 1,342,551 bytes into the build. | Piece-set registry assets resolved by `resolvePieceVisual()` and rendered by `SlotReel`. | Medium | Remove `.symbols` imports/property and README claims in one code change, build-test, then delete six PNGs. |
| `src/assets/slot-machine/generated/slot-machine-frame.png` | `SLOT_MACHINE_ASSETS.generated.frame`; no consumer reads it, but it enters the build. | `assembly.machine` and `gameAssembly.machine`. | Medium | Remove obsolete registry property/import, update README, then delete. |
| `src/assets/slot-machine/generated/slot-machine-lever.png` | `SLOT_MACHINE_ASSETS.generated.lever`; no consumer reads it, but it enters the build. | `assembly.lever` and `gameAssembly.lever`. | Medium | Remove obsolete registry property/import, update README, then delete. |

Total for this code-coupled superseded group: 3,732,237 bytes (3.56 MiB source and approximately the same uncompressed build payload).

### Audio — selected as “not used” for planned replacement

Per audit instruction, every current audio asset is selected for replacement/removal:

- `src/assets/sounds/roll-button.wav`
- `src/assets/sounds/lever-pull.wav`
- `src/assets/sounds/reel-spin.wav`
- `src/assets/sounds/reel-stop.wav`
- `src/assets/sounds/move.wav`
- `src/assets/sounds/capture.wav`
- `src/assets/sounds/turn-skipped.wav`
- `src/assets/sounds/victory.wav`
- `src/assets/sounds/defeat.wav`
- `src/assets/sounds/timeout.wav`

Important evidence: these files are **currently active**, statically imported by `src/config/sounds.ts`, selected through `SOUND_CATALOG`, and used by `SoundManager`. Deleting them now would break the build. Category: superseded/pending replacement; deletion risk: high until replacements exist; recommended action: replace filenames/imports atomically with the future production sound batch, then delete old WAVs. Current total: 118,117 bytes.

## 4. UNUSED CODE ARTIFACT

| Exact symbol | Evidence | Risk | Recommended action |
|---|---|---|---|
| `SLOT_MACHINE_ASSETS.generated` in `src/assets/slot-machine/index.ts` | No `.generated` consumer; its two imports still force legacy frame/lever into the build. | Medium | Remove property and imports together with the two assets and stale README paragraphs. |
| `SLOT_MACHINE_ASSETS.symbols` in `src/assets/slot-machine/index.ts` | No `.symbols` consumer; `SlotReel` now uses `resolvePieceVisual`. | Medium | Remove property/imports with six generated symbol PNGs and update README. |
| `ROLL_TIMING.leverDownDurationMs` in `src/config/rollTiming.ts` | Declaration only; LEVER-02 uses `leverAnimationDurationMs`, and CSS keyframe percentages define the down phase. | Low | Remove constant or wire it into a deliberate timing model. |
| `GameSoundDefinition.durationMs` and the `lever-pull` value in `src/config/sounds.ts` | Metadata is declared/set but never read by `SoundManager` or UI. | Low | Remove optional field and value unless future sound sequencing will consume it. |
| `APP_LOCALES` in `src/i18n/index.ts` | Exported but no code/test consumer. | Low | Remove, or use it as the single locale mapping when locale-aware formatting is consolidated. |
| `PIECE_LABELS`, `PieceVisual.label`, and `TextPieceVisual` compatibility branch in `src/config/pieceSets.ts` | Current resolver always returns `kind: "image"`; UI labels use i18n and no consumer reads `visual.label`. Text branches remain in Piece/Slot/Result renderers but no selectable set produces them. | Medium | Manual design decision: remove label now; remove text compatibility only if Unicode/fallback set support is definitively abandoned. |
| `--machine-natural-ratio` in `src/components/Board/Board.css` | Defined once, no `var(--machine-natural-ratio)` use. | Low | Remove. |
| `--machine-scale-x` in `src/components/Board/Board.css` | Defined/overridden at three breakpoints, never consumed. | Low | Remove all definitions. |
| `--machine-scale-y` in `src/components/Board/Board.css` | Defined/overridden at three breakpoints, never consumed. | Low | Remove all definitions. |
| `--settings-brass` in `src/styles/SettingsPage.css` | Defined once, never consumed. | Low | Remove. |
| `game.clockPlayer` / `game.clockBot` in both i18n JSON files | No `t()` lookup; `ChessClockPanel` composes color/role from other keys. | Low | Remove both keys from EN/TR together and rerun parity. |

No unused animation names were found. All eight keyframe names have at least one animation reference, including LEVER-02 normal and reduced-motion keyframes.

No compiler-detectable unused local imports, constants, variables, parameters, functions, or React components remain: TypeScript `noUnusedLocals`/`noUnusedParameters`, ESLint, and build all pass. Export-only compatibility surfaces listed above require human API decisions.

## 5. KEEP

| Exact path | Evidence | Risk if deleted | Recommended action |
|---|---|---|---|
| `public/favicon.svg` | Referenced by `/favicon.svg` in `index.html`. | High | Keep. |
| `src/assets/pieces/classic/*.svg` | All 12 statically imported into `PIECE_SET_CATALOG`; selectable set used by board, roulette, and result. | High | Keep. |
| `src/assets/pieces/retro/*.svg` | Same indirect registry use. | High | Keep. |
| `src/assets/pieces/gold/*.png` | All 12 active through `PIECE_SET_CATALOG`; three are also directly used by Home hero. | High | Keep. |
| `src/assets/slot-machine/generated/update-machine-transparent.png` | Active `SLOT_MACHINE_ASSETS.assembly.machine` for Home. | High | Keep. |
| `src/assets/slot-machine/generated/update-lever-transparent.png` | Active `assembly.lever` for Home. | High | Keep. |
| `src/assets/slot-machine/generated/update-machine-game-trimmed.png` | Active `gameAssembly.machine` for Game HUD. | High | Keep. |
| `src/assets/slot-machine/generated/update-lever-game-trimmed.png` | Active `gameAssembly.lever`, including LEVER-02 animation. | High | Keep. |
| `src/assets/slot-machine/source/chess-piece-sheet.png` | No runtime import, but explicitly documented as the non-destructive source sheet in `src/assets/slot-machine/README.md`. | Medium | Keep or move to a formally designated source/archive repository in a separate task. |
| `src/assets/slot-machine/source/slot-machine-sheet.png` | Same documented source/provenance role. | Medium | Keep unless source assets are deliberately externalized. |
| `src/assets/slot-machine/README.md` | Contains provenance and asset pipeline documentation. Some legacy paragraphs are stale, but deleting it would lose source context. | Medium | Keep and revise during registry cleanup. |
| `src/assets/sounds/*.wav` | Despite the planned replacement designation, all are currently imported by `SOUND_CATALOG`. | High | Keep until atomic replacement. |

## Largest unreferenced files

“Unreferenced” here means no code/build/test reference; manual source/archive value may remain.

| Path | Bytes | Classification |
|---|---:|---|
| `src/assets/slot-machine/source/chess-piece-sheet.png` | 4,376,202 | KEEP — documented source |
| `src/assets/slot-machine/source/slot-machine-sheet.png` | 3,264,053 | KEEP — documented source |
| `src/assets/slot-machine/generated/slot-machine-frame-transparent.png` | 2,372,300 | SAFE TO REMOVE |
| `src/assets/slot-machine/generated/new-machine-transparent.png` | 2,341,319 | SAFE TO REMOVE |
| `src/assets/slot-machine/generated/new-machine.png` | 2,285,317 | SAFE TO REMOVE |
| `src/design/Tasarım/obsidian-knight.png` | 2,287,314 | MANUAL REVIEW — design source |
| `src/design/Tasarım/obsidian-queen.png` | 2,249,352 | MANUAL REVIEW — design source |
| `src/design/Tasarım/gold-king.png` | 2,203,513 | MANUAL REVIEW — design source |
| `src/assets/slot-machine/generated/update-machine.png` | 2,117,175 | SAFE TO REMOVE |
| `src/assets/slot-machine/generated/update-lever.png` | 2,070,216 | SAFE TO REMOVE |
| `src/assets/slot-machine/generated/new-lever.png` | 2,069,726 | SAFE TO REMOVE |

The largest `.artifacts` files are `gold-02/source-contact-sheet.png` (1,492,828), `lever-01b/lever-01b-home-review.png` (1,029,198), and `lever-01c/lever-01c-home-final-1920x1080.png` (1,028,659); all are included in the safe generated-artifact batch.

## Naming collisions and near-duplicates

- Three machine generations coexist: `new-machine*`, `update-machine*`, and `slot-machine-frame*`. Only `update-machine-transparent.png` and `update-machine-game-trimmed.png` are active.
- Three lever generations coexist: `new-lever.png`, `update-lever*`, and `slot-machine-lever.png`. Only the two transparent/game-trimmed `update-lever` derivatives are active; `slot-machine-lever.png` is still imported by an obsolete registry branch.
- `src/assets/pieces/classic` and `retro` use identical basenames. Imports are explicit and correctly scoped; this is intentional, not a collision.
- `.artifacts/gold-02/candidates` duplicates production Gold filenames and hashes exactly.
- Turkish directory name `src/design/Tasarım` is valid but makes automation and cross-platform shell scripting less predictable; if retained, document it as an intentional source-only directory.

## Case-sensitivity and orphan checks

- No incorrect-case TypeScript/TSX asset import was found. Imported basenames and directory segments match on-disk casing.
- `index.html` references lowercase `public/favicon.svg` correctly.
- No CSS local `url(...)` asset reference exists, so no CSS case mismatch was found.
- `public/icons.svg` is the only confirmed `public` orphan.
- Confirmed `src/assets` zero-reference orphans are the six SAFE slot variants listed above.
- The eight legacy generated frame/lever/symbol files are **not filesystem orphans** because the slot registry imports them, even though their registry branches have no consumer.
- No empty directory was found under `src/assets` or `public`.

## Proposed deletion batches, lowest to highest risk

1. **Batch A — generated QA artifacts (lowest risk, 40,903,035 bytes)**  
   Delete `.artifacts/` in full. Optionally archive externally first.

2. **Batch B — true orphan public/slot files (low risk, 13,261,108 bytes)**  
   Delete `public/icons.svg` plus the six zero-reference slot variants: `new-lever.png`, `new-machine.png`, `new-machine-transparent.png`, `slot-machine-frame-transparent.png`, `update-lever.png`, and `update-machine.png`.

3. **Batch C — dead CSS/timing/i18n metadata (low code risk)**  
   Remove four unused CSS custom properties, `leverDownDurationMs`, unused sound duration metadata, `APP_LOCALES` if not adopted, and EN/TR `clockPlayer`/`clockBot`. Run parity, tests, lint, build, and diff check.

4. **Batch D — obsolete slot registry branches (medium risk, 3,732,237 bytes)**  
   Remove `SLOT_MACHINE_ASSETS.generated` and `.symbols`, their eight imports/assets, and revise stale README statements. Validate Home, Game reels, all three Piece Sets, LEVER-02, and production build asset output.

5. **Batch E — audio replacement (high until replacements exist, 118,117 bytes)**  
   Add new production audio, update every `SOUND_CATALOG` import atomically, verify all ten sound IDs, then remove current WAVs.

6. **Batch F — design-source externalization (highest/manual risk, 20,059,353 bytes)**  
   Decide whether `src/design/Tasarım` and the two slot source sheets belong in Git, Git LFS, or an external design archive. Never delete without source-owner confirmation.

## Validation results

Executed before inventory analysis:

- `npm.cmd run test:i18n` — PASS; 254 translation leaves across EN/TR.
- `npm.cmd run test:profile` — PASS; progression, rewards, repositories, reset, statistics, and idempotency.
- `npm.cmd run lint` — PASS.
- `npm.cmd run build` — PASS; TypeScript project build and Vite production build, 180 modules transformed.
- `git diff --check` — PASS.

No dependency was installed for this audit. Final repository-state verification should show only this audit file as a task-created change; application sources and assets remain untouched.
