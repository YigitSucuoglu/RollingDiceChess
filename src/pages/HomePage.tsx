import { useNavigate } from "react-router-dom";
import blackKnightUrl from "../assets/pieces/gold/black-knight.png";
import whiteKingUrl from "../assets/pieces/gold/white-king.png";
import whiteQueenUrl from "../assets/pieces/gold/white-queen.png";
import { SLOT_MACHINE_ASSETS } from "../assets/slot-machine";
import "../styles/HomePage.css";

function HomePage() {
  const navigate = useNavigate();

  return (
    <main className="home">
      <div aria-hidden="true" className="home-ambient home-ambient-left" />
      <div aria-hidden="true" className="home-ambient home-ambient-right" />

      <div className="home-shell">
        <section aria-labelledby="home-title" className="home-brand">
          <p className="home-eyebrow">
            <span aria-hidden="true" />
            Strategy meets chance
          </p>
          <h1 id="home-title">
            <span>Roulette</span>
            <strong>Chess</strong>
          </h1>
          <p className="home-tagline">Spin the pieces. Rewrite the board.</p>
          <p className="home-summary">
            Every turn deals three pieces. Read the position, play your rights,
            and capture the king.
          </p>

          <nav aria-label="Main menu" className="home-actions">
            <button
              className="home-action home-action-primary"
              onClick={() => navigate("/play")}
              type="button"
            >
              <span>Play</span>
              <span aria-hidden="true" className="home-action-arrow">→</span>
            </button>
            <button
              className="home-action home-action-secondary"
              onClick={() => navigate("/settings")}
              type="button"
            >
              Settings
            </button>
            <button
              className="home-profile-link"
              onClick={() => navigate("/profile")}
              type="button"
            >
              <svg
                aria-hidden="true"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle cx="12" cy="8" r="3.25" />
                <path d="M5.75 19c.6-3.45 2.68-5.25 6.25-5.25s5.65 1.8 6.25 5.25" />
              </svg>
              Profile
            </button>
          </nav>
        </section>

        <section
          aria-label="Roulette machine with Gold and Obsidian chess pieces"
          className="home-hero"
        >
          <div aria-hidden="true" className="home-hero-halo" />
          <div className="home-machine">
            <img
              alt=""
              aria-hidden="true"
              className="home-machine-frame"
              src={SLOT_MACHINE_ASSETS.assembly.machine}
            />
            <div aria-hidden="true" className="home-reel-overlay">
              <span className="home-reel-window home-reel-window-queen">
                <span className="home-reel-visual">
                  <img alt="" src={whiteQueenUrl} />
                </span>
              </span>
              <span className="home-reel-window home-reel-window-knight">
                <span className="home-reel-visual">
                  <img alt="" src={blackKnightUrl} />
                </span>
              </span>
              <span className="home-reel-window home-reel-window-king">
                <span className="home-reel-visual">
                  <img alt="" src={whiteKingUrl} />
                </span>
              </span>
            </div>
            <span aria-hidden="true" className="home-machine-lever-layer">
              <img
                alt=""
                className="home-machine-lever"
                src={SLOT_MACHINE_ASSETS.assembly.lever}
              />
            </span>
          </div>

          <p className="home-hero-caption">
            <span aria-hidden="true">◆</span>
            Three pieces. One turn. Every move matters.
          </p>
        </section>
      </div>

      <footer className="home-footer">
        <span>RouletteChess</span>
        <span aria-hidden="true">•</span>
        <span>v0.8.8</span>
      </footer>
    </main>
  );
}

export default HomePage;
