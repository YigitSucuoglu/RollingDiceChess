import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { HOME_ASSETS } from "../assets/home";
import "../styles/HomePage.css";

function HomePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => { document.title = t("home.browserTitle"); }, [t]);

  return (
    <main className="home">
      <div aria-hidden="true" className="home-ambient home-ambient-left" />
      <div aria-hidden="true" className="home-ambient home-ambient-right" />

      <div className="home-shell">
        <section aria-labelledby="home-title" className="home-brand">
          <p className="home-eyebrow">
            <span aria-hidden="true" />
            {t("home.eyebrow")}
          </p>
          <h1 id="home-title">
            <span>Roulette</span>
            <strong>Chess</strong>
          </h1>
          <p className="home-tagline">{t("home.tagline")}</p>
          <p className="home-summary">{t("home.summary")}</p>

          <nav aria-label={t("common.navigation.mainMenu")} className="home-actions">
            <div className="home-primary-actions">
              <button className="home-action home-action-game-mode" onClick={() => navigate("/play")} type="button">
                {t("home.singleplayer")}
              </button>
              <button className="home-action home-action-game-mode" onClick={() => navigate("/multiplayer")} type="button">
                {t("home.multiplayer")}
              </button>
            </div>
            <div className="home-secondary-actions">
              <button
              className="home-action home-action-secondary"
              onClick={() => navigate("/profile")}
              type="button"
            >
              {t("home.profile")}
            </button>
            <button
              className="home-action home-action-secondary"
              onClick={() => navigate("/leaderboard")}
              type="button"
            >
              {t("home.leaderboard")}
            </button>
            <button
              className="home-action home-action-secondary"
              onClick={() => navigate("/settings")}
              type="button"
            >
              {t("home.settings")}
            </button>
            <button
              className="home-action home-action-secondary"
              onClick={() => navigate("/how-to-play")}
              type="button"
            >
              {t("home.howToPlay")}
            </button>
            </div>
          </nav>
        </section>

        <section
          aria-label={t("home.heroLabel")}
          className="home-hero"
        >
          <div aria-hidden="true" className="home-hero-halo" />
          <div className="home-machine">
            <picture>
              <source media="(max-width: 520px)" srcSet={HOME_ASSETS.machine.mobile} type="image/webp" />
              <source
                sizes="(max-height: 800px) and (min-width: 901px) 528px, 624px"
                srcSet={`${HOME_ASSETS.machine.oneX} 624w, ${HOME_ASSETS.machine.twoX} 1248w`}
                type="image/webp"
              />
              <img
                alt=""
                aria-hidden="true"
                className="home-machine-frame"
                decoding="sync"
                fetchPriority="high"
                height={HOME_ASSETS.machine.height}
                loading="eager"
                src={HOME_ASSETS.machine.fallback}
                width={HOME_ASSETS.machine.width}
              />
            </picture>
            <div aria-hidden="true" className="home-reel-overlay">
              <span className="home-reel-window home-reel-window-queen">
                <span className="home-reel-visual">
                  <picture>
                    <source srcSet={`${HOME_ASSETS.pieces.whiteQueen.oneX} 1x, ${HOME_ASSETS.pieces.whiteQueen.twoX} 2x`} type="image/webp" />
                    <img alt="" decoding="async" height={HOME_ASSETS.pieces.whiteQueen.height} src={HOME_ASSETS.pieces.whiteQueen.fallback} width={HOME_ASSETS.pieces.whiteQueen.width} />
                  </picture>
                </span>
              </span>
              <span className="home-reel-window home-reel-window-knight">
                <span className="home-reel-visual">
                  <picture>
                    <source srcSet={`${HOME_ASSETS.pieces.blackKnight.oneX} 1x, ${HOME_ASSETS.pieces.blackKnight.twoX} 2x`} type="image/webp" />
                    <img alt="" decoding="async" height={HOME_ASSETS.pieces.blackKnight.height} src={HOME_ASSETS.pieces.blackKnight.fallback} width={HOME_ASSETS.pieces.blackKnight.width} />
                  </picture>
                </span>
              </span>
              <span className="home-reel-window home-reel-window-king">
                <span className="home-reel-visual">
                  <picture>
                    <source srcSet={`${HOME_ASSETS.pieces.whiteKing.oneX} 1x, ${HOME_ASSETS.pieces.whiteKing.twoX} 2x`} type="image/webp" />
                    <img alt="" decoding="async" height={HOME_ASSETS.pieces.whiteKing.height} src={HOME_ASSETS.pieces.whiteKing.fallback} width={HOME_ASSETS.pieces.whiteKing.width} />
                  </picture>
                </span>
              </span>
            </div>
            <span aria-hidden="true" className="home-machine-lever-layer">
              <picture>
                <source srcSet={`${HOME_ASSETS.lever.oneX} 1x, ${HOME_ASSETS.lever.twoX} 2x`} type="image/webp" />
                <img alt="" className="home-machine-lever" decoding="async" height={HOME_ASSETS.lever.height} src={HOME_ASSETS.lever.fallback} width={HOME_ASSETS.lever.width} />
              </picture>
            </span>
          </div>

          <p className="home-hero-caption">
            <span aria-hidden="true">◆</span>
            {t("home.caption")}
          </p>
        </section>
      </div>

      <footer className="home-footer">
        <span>RouletteChess</span>
        <span aria-hidden="true">•</span>
        <span>v{__APP_VERSION__}</span>
      </footer>
    </main>
  );
}

export default HomePage;
