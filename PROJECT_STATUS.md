# RollingDiceChess - Project Status

## Current Version

v0.6.0

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

### UI
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
- Winner screen

---

## Current Sprint

Completed:
- UI-01 — Redesign Top Game HUD

Next:
- To be defined by the project owner

---

## Important Notes

- currentRoll never changes during a turn.
- remainingRights changes after each move.
- Animation must never modify engine state.
- Winner state overrides the roll display.
- Board pieces and reel symbols will use the same selectable piece theme in a future phase.
- The ROLL button is the primary interaction; the lever is decorative animation only.
