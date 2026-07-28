# RollingDiceChess - Project Status

## Current Version

v0.8.6

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

### Engine
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
- GOLD-02 — Prepare Production Gold Piece Assets
- PIECESET-01B — Replace Classic Unicode Symbols with revised Classic SVG design
- PIECESET-01 — Rename Piece Theme Architecture to Piece Set
- BUG-01 — Prevent Automatic Human Roll After Initial No-Move Result
- UI-01B — Collapsible Move History & Adaptive Desktop Layout with Desktop Overflow Fix
- UI-01A — Game Screen Layout & Board Priority

Next:
1. GOLD-03 — Integrate Gold Piece Set

Roadmap:
- HOME-01 — Home, Profile and Settings Redesign
- HELP-01 — How to Play
- SOUND-01B — Sound Asset Replacement and Balancing

---

## Important Notes

- currentRoll never changes during a turn.
- remainingRights changes after each move.
- Animation must never modify engine state.
- Winner state overrides the roll display.
- Piece Set controls board pieces, slot symbols, and result visuals through one central resolver; Board Theme remains independent.
- The ROLL button is the primary interaction; the lever is decorative animation only.
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
- Production Gold/Obsidian PNG assets are prepared with real alpha but are not selectable; registry and UI integration remain scoped to GOLD-03.
- Wood, Marble, and Dark Board Themes are integrated and affect only board squares, surface, frame, and coordinates.
- Piece Set and Board Theme remain independent; Wood/Marble/Dark each support both Classic and Retro pieces.
- Central SoundManager provides cached, master-mutable audio with a persistent turn-header toggle.
- Supported effects: Roll button, Lever pull, Reel spin, Reel stop, Move, Capture, Turn skipped, Victory, Defeat, and Timeout.
- Lever audio starts with the animation and follows the shared roll timing config; volume sliders and background music are not included.
- Desktop game layout prioritizes a viewport-sized board with a narrow secondary Move History panel.
- Move History starts closed, releases its layout space, and keeps the centered desktop game layout free of page-level overflow.
- At narrow breakpoints, Move History stacks below the main game column and remains internally scrollable.
- UI-01A changes layout only; gameplay, bot pacing, clock, and sound behavior remain unchanged.
- Chess clock engine, timeout result, and perspective-aware dual clock UI are complete.


## Future UI Polish

- Replace temporary blend-mode background removal with true transparent slot frame assets.
- Split lever into layered assets to achieve proper mechanical occlusion and depth.
