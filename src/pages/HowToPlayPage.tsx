import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  GuideSection,
  PieceMovementCard,
  QuickRuleCard,
  RouletteResultExample,
  RuleHighlight,
} from "../components/HowToPlay/GuideComponents";
import "../styles/HowToPlayPage.css";

const QUICK_RULES = [
  {
    title: "Roll Three Pieces",
    description:
      "Every turn begins with a roulette roll that selects three piece types.",
  },
  {
    title: "Use Your Rights",
    description:
      "Each result gives you one movement right for that piece type.",
  },
  {
    title: "Choose the Order",
    description:
      "The roulette order does not determine the order of your moves.",
  },
  {
    title: "Capture the King",
    description:
      "There is no check or checkmate. Capture the opposing King to win.",
  },
] as const;

const PIECE_MOVEMENTS = [
  {
    name: "Pawn",
    description:
      "Moves forward and captures diagonally. It may move two squares from its starting position.",
  },
  {
    name: "Knight",
    description:
      "Moves in an L shape and may jump over other pieces.",
  },
  {
    name: "Bishop",
    description:
      "Moves diagonally across any number of open squares.",
  },
  {
    name: "Rook",
    description:
      "Moves horizontally or vertically across any number of open squares.",
  },
  {
    name: "Queen",
    description:
      "Moves horizontally, vertically, or diagonally across open squares.",
  },
  {
    name: "King",
    description:
      "Moves one square in any direction. Attacked-square restrictions do not apply.",
  },
] as const;

const REMINDERS = [
  "Roll three piece types at the start of your turn.",
  "Each result gives one movement right.",
  "Move order is your choice.",
  "Duplicate results give duplicate rights.",
  "Use as many legal rights as possible.",
  "A turn may contain fewer than three moves.",
  "No legal move means the turn is skipped.",
  "There is no check or checkmate.",
  "Capture the King to win.",
  "Running out of time loses the game.",
] as const;

function HowToPlayPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "How to Play | RouletteChess";
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });

    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <main className="how-to-play-page">
      <div aria-hidden="true" className="guide-ambient guide-ambient-left" />
      <div aria-hidden="true" className="guide-ambient guide-ambient-right" />

      <div className="guide-shell">
        <nav aria-label="How to Play navigation" className="guide-nav">
          <Link className="guide-brand" to="/">RouletteChess</Link>
          <Link className="guide-back-link" to="/">
            <span aria-hidden="true">←</span>
            Back to Home
          </Link>
        </nav>

        <header className="guide-hero">
          <p className="guide-eyebrow">
            <span aria-hidden="true" />
            Rules and strategy
          </p>
          <h1>How to Play</h1>
          <p>
            Learn the rules of RouletteChess, understand your movement rights,
            and capture the enemy king.
          </p>
        </header>

        <section aria-labelledby="quick-rules-title" className="quick-rules">
          <header className="guide-section-header">
            <p>Start here</p>
            <h2 id="quick-rules-title">The Game in Four Rules</h2>
          </header>
          <div className="quick-rules-grid">
            {QUICK_RULES.map((rule, index) => (
              <QuickRuleCard
                description={rule.description}
                index={index + 1}
                key={rule.title}
                title={rule.title}
              />
            ))}
          </div>
        </section>

        <div className="guide-sections-grid">
          <GuideSection eyebrow="Winning" id="objective" title="Objective">
            <p>
              Capture the opponent&apos;s King before your own King is
              captured. The game ends immediately when a player captures the
              opposing King.
            </p>
            <p>
              A King may remain in an attacked square or move into one.
              RouletteChess does not use check, checkmate, or self-check
              restrictions.
            </p>
            <RuleHighlight>
              No check. No checkmate. Capture the King.
            </RuleHighlight>
          </GuideSection>

          <GuideSection
            eyebrow="The roll"
            id="starting-a-turn"
            title="Starting a Turn"
          >
            <p>
              At the beginning of a human turn, press <strong>ROLL</strong>.
              Human turns are never rolled automatically.
            </p>
            <p>
              The roulette reveals three piece types. Each result grants one
              matching movement right for that turn.
            </p>
            <RouletteResultExample
              caption="One Knight move, one Bishop move, and one Pawn move."
              pieces={["Knight", "Bishop", "Pawn"]}
            />
          </GuideSection>

          <GuideSection
            eyebrow="Your options"
            id="movement-rights"
            title="Movement Rights"
          >
            <p>
              You may make up to three moves during one turn. Spend a right by
              making a legal move with a piece of the matching type.
            </p>
            <RouletteResultExample
              caption="You may make one legal Rook move, one Pawn move, and one Bishop move."
              pieces={["Rook", "Pawn", "Bishop"]}
            />
            <p>
              Rights belong to piece types, not physical pieces. You do not
              need to move three different pieces.
            </p>
          </GuideSection>

          <GuideSection
            eyebrow="Sequence"
            id="move-order"
            title="Choose Your Move Order"
          >
            <p>
              The left-to-right roulette order does not control your move
              order. Choose any legal sequence that preserves the greatest
              number of usable rights.
            </p>
            <div className="sequence-examples">
              <span>Pawn → Knight → Bishop</span>
              <span>Bishop → Pawn → Knight</span>
            </div>
            <p>
              Opening a path first can make a later Rook, Bishop, or Queen
              right usable.
            </p>
          </GuideSection>

          <GuideSection
            eyebrow="Repeated rights"
            id="duplicates"
            title="Duplicate Piece Types"
          >
            <RouletteResultExample
              caption="Two Knight rights and one Pawn right."
              pieces={["Knight", "Knight", "Pawn"]}
            />
            <p>
              Duplicate rights may be used on different pieces or on the same
              physical piece if it can legally move again after its first
              move.
            </p>
            <p>
              A Pawn — Pawn — Pawn result may therefore permit three Pawn
              moves, using one or several Pawns, when the full sequence is
              legal.
            </p>
          </GuideSection>

          <GuideSection
            eyebrow="Continuation"
            id="maximum-rights"
            title="Use as Many Rights as Possible"
          >
            <p>
              RouletteChess evaluates legal continuations and only permits
              choices that preserve the maximum number of rights available
              from the current position.
            </p>
            <ul>
              <li>If three rights can be used, the turn contains three moves.</li>
              <li>If only two can be used, the turn ends after two moves.</li>
              <li>If only one can be used, the turn ends after that move.</li>
              <li>If none can be used, the turn is skipped.</li>
            </ul>
          </GuideSection>

          <GuideSection
            eyebrow="Automatic pass"
            id="no-legal-moves"
            title="When No Legal Move Exists"
          >
            <p>
              If none of the rolled piece types has a legal move, the result
              is still revealed before the turn is skipped automatically.
            </p>
            <p>
              If one or two rights can be used, play those available moves.
              The turn ends when no remaining rolled right can legally be
              spent.
            </p>
            <RuleHighlight>
              An unusable right is simply skipped; it does not lose the game.
            </RuleHighlight>
          </GuideSection>

          <GuideSection
            eyebrow="The board"
            id="piece-movement"
            title="Chess Piece Movement"
          >
            <p>
              Pieces use their familiar movement patterns, without check-based
              restrictions.
            </p>
            <div className="piece-movement-grid">
              {PIECE_MOVEMENTS.map((piece) => (
                <PieceMovementCard
                  description={piece.description}
                  key={piece.name}
                  name={piece.name}
                />
              ))}
            </div>
          </GuideSection>

          <GuideSection
            eyebrow="Advanced rules"
            id="special-moves"
            title="Special Moves"
          >
            <div className="special-moves-list">
              <article>
                <h3>Castling</h3>
                <p>
                  Castling requires an unmoved King, an unmoved same-color
                  Rook, an empty path between them, and an available King
                  right. Attacked-square and check restrictions do not apply.
                  Castling consumes the King right only.
                </p>
              </article>
              <article>
                <h3>En Passant</h3>
                <p>
                  A Pawn may capture en passant immediately after the opposing
                  Pawn&apos;s qualifying two-square move. The opportunity
                  expires after the next individual move, even within the same
                  RouletteChess turn.
                </p>
              </article>
              <article>
                <h3>Promotion</h3>
                <p>
                  A Pawn reaching the final rank is promoted automatically to
                  a Queen. The promotion move spends a Pawn right; the new
                  Queen may only spend a later Queen right.
                </p>
              </article>
            </div>
          </GuideSection>

          <GuideSection
            eyebrow="Victory"
            id="king-capture"
            title="King Capture and Victory"
          >
            <p>
              There are no check warnings, checkmate positions, or self-check
              restrictions. A King may move into danger, remain under attack,
              or capture a protected piece when the move is otherwise legal.
            </p>
            <RuleHighlight>
              Capturing the opposing King ends the game immediately.
            </RuleHighlight>
          </GuideSection>

          <GuideSection
            eyebrow="Time control"
            id="chess-clock"
            title="Chess Clock"
          >
            <p>
              The clock starts after the roulette result is revealed when the
              turn has at least one playable move. The roll animation itself
              is not counted.
            </p>
            <p>
              Your clock then runs while you consider the rights, choose their
              order, and complete the available moves. When the turn ends, the
              configured increment is added and the opponent&apos;s clock can
              begin after their roll is resolved.
            </p>
            <p>
              A turn with no legal move is skipped without starting its clock.
              If a running clock reaches zero, that player loses.
            </p>
          </GuideSection>

          <GuideSection
            eyebrow="Appearance"
            id="customization"
            title="Customization"
          >
            <div className="customization-grid">
              <article>
                <h3>Piece Set</h3>
                <p>
                  Changes board pieces, roulette symbols, and result-screen
                  pieces. Available sets are Gold, Classic, and Retro.
                </p>
              </article>
              <article>
                <h3>Board Theme</h3>
                <p>
                  Changes board squares, coordinates, frame, and surface
                  styling. Available themes are Wood, Marble, and Dark.
                </p>
              </article>
            </div>
            <RuleHighlight>
              Customization never changes gameplay rules.
            </RuleHighlight>
          </GuideSection>
        </div>

        <GuideSection
          eyebrow="Putting it together"
          id="full-turn-example"
          title="Full Turn Example"
        >
          <RouletteResultExample
            pieces={["Rook", "Pawn", "Pawn"]}
          />
          <ol className="turn-example-list">
            <li>Move a Pawn to open a file.</li>
            <li>Move the Rook through the newly opened file.</li>
            <li>Move a Pawn using the remaining Pawn right.</li>
          </ol>
          <p>
            If the second Pawn move is no longer legal after the first two
            moves, the turn may end after the Rook and Pawn rights are used.
            The exact sequence always depends on the board.
          </p>
        </GuideSection>

        <section aria-labelledby="remember-title" className="remember-section">
          <header className="guide-section-header">
            <p>Quick reference</p>
            <h2 id="remember-title">Remember</h2>
          </header>
          <ul>
            {REMINDERS.map((reminder) => (
              <li key={reminder}>
                <span aria-hidden="true">◆</span>
                {reminder}
              </li>
            ))}
          </ul>
        </section>

        <footer className="guide-footer">
          <div>
            <p>Ready to rewrite the board?</p>
            <h2>Spin your pieces. Plan the sequence.</h2>
          </div>
          <nav aria-label="How to Play actions">
            <Link className="guide-action guide-action-primary" to="/play">
              Play
              <span aria-hidden="true">→</span>
            </Link>
            <Link className="guide-action guide-action-secondary" to="/">
              Back to Home
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}

export default HowToPlayPage;
