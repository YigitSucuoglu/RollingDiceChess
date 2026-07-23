# RollingDiceChess - Project Status

## Current Version

v0.7.5

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
- UX-01 — Mandatory Roll Reveal Before Auto Pass
- CLOCK-01A — Chess Clock Engine & Timeout
- CLOCK-01B — Dual Clock UI & Full Game Integration

### UI
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
- AI-01E — Tactical Exposure Evaluation

Next:
1. AI-01F — Positional Evaluation

---

## Important Notes

- currentRoll never changes during a turn.
- remainingRights changes after each move.
- Animation must never modify engine state.
- Winner state overrides the roll display.
- Board pieces and reel symbols will use the same selectable piece theme in a future phase.
- The ROLL button is the primary interaction; the lever is decorative animation only.
- Check and checkmate do not exist; the game ends only when a king is captured.
- Move history data infrastructure and two-column, three-slot UI are complete.
- Play Setup stores time control and player side; difficulty selection remains a future task.
- Heuristic Bot scores current TurnResolver-approved moves after the shared roll animation.
- Turn Sequence Generator enumerates maximum-right continuations without mutating live game state.
- Default bot evaluates and safely executes complete maximum-right turn sequences.
- Sequence evaluation penalizes the highest exposed non-king material on the final board.
- Chess clock engine, timeout result, and perspective-aware dual clock UI are complete.


## Future UI Polish

- Replace temporary blend-mode background removal with true transparent slot frame assets.
- Split lever into layered assets to achieve proper mechanical occlusion and depth.
