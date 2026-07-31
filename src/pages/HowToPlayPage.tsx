import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { GuideSection, PieceMovementCard, QuickRuleCard, RouletteResultExample, RuleHighlight } from "../components/HowToPlay/GuideComponents";
import "../styles/HowToPlayPage.css";

const QUICK_KEYS = ["roll", "rights", "order", "capture"] as const;
const PIECES = ["pawn", "knight", "bishop", "rook", "queen", "king"] as const;
const SIMPLE_SECTIONS = ["objective", "starting", "rights", "order", "duplicates", "noMoves", "victory", "clock"] as const;

function HowToPlayPage() {
  const { t } = useTranslation();
  useEffect(() => {
    const previousTitle = document.title;
    document.title = t("guide.browserTitle");
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    return () => { document.title = previousTitle; };
  }, [t]);

  const translatedPieces = (pieces: readonly (typeof PIECES[number])[]) =>
    pieces.map((piece) => t(`common.pieces.${piece}`));

  return (
    <main className="how-to-play-page">
      <div aria-hidden="true" className="guide-ambient guide-ambient-left" />
      <div aria-hidden="true" className="guide-ambient guide-ambient-right" />
      <div className="guide-shell">
        <nav aria-label={t("common.navigation.howToPlay")} className="guide-nav">
          <Link className="guide-brand" to="/">RouletteChess</Link>
          <Link className="guide-back-link" to="/"><span aria-hidden="true">←</span>{t("common.actions.backToHome")}</Link>
        </nav>
        <header className="guide-hero">
          <p className="guide-eyebrow"><span aria-hidden="true" />{t("guide.eyebrow")}</p>
          <h1>{t("guide.title")}</h1><p>{t("guide.intro")}</p>
        </header>
        <section aria-labelledby="quick-rules-title" className="quick-rules">
          <header className="guide-section-header"><p>{t("guide.startHere")}</p><h2 id="quick-rules-title">{t("guide.fourRules")}</h2></header>
          <div className="quick-rules-grid">{QUICK_KEYS.map((key, index) => <QuickRuleCard description={t(`guide.quick.${key}.description`)} index={index + 1} key={key} title={t(`guide.quick.${key}.title`)} />)}</div>
        </section>
        <div className="guide-sections-grid">
          {SIMPLE_SECTIONS.slice(0, 5).map((key) => (
            <GuideSection eyebrow={t(`guide.sections.${key}.eyebrow`)} id={key} key={key} title={t(`guide.sections.${key}.title`)}>
              <p>{t(`guide.sections.${key}.p1`)}</p>
              {key === "starting" && <RouletteResultExample caption={t("guide.sections.starting.caption")} pieces={translatedPieces(["knight", "bishop", "pawn"])} />}
              {key === "rights" && <RouletteResultExample caption={t("guide.sections.rights.caption")} pieces={translatedPieces(["rook", "pawn", "bishop"])} />}
              {key === "duplicates" && <RouletteResultExample caption={t("guide.sections.duplicates.caption")} pieces={translatedPieces(["knight", "knight", "pawn"])} />}
              <p>{t(`guide.sections.${key}.p2`)}</p>
              {key === "objective" && <RuleHighlight>{t("guide.sections.objective.highlight")}</RuleHighlight>}
            </GuideSection>
          ))}
          <GuideSection eyebrow={t("guide.sections.maximum.eyebrow")} id="maximum" title={t("guide.sections.maximum.title")}>
            <p>{t("guide.sections.maximum.p1")}</p><ul>{(t("guide.sections.maximum.items", { returnObjects: true }) as string[]).map((item) => <li key={item}>{item}</li>)}</ul>
          </GuideSection>
          <GuideSection eyebrow={t("guide.sections.noMoves.eyebrow")} id="noMoves" title={t("guide.sections.noMoves.title")}>
            <p>{t("guide.sections.noMoves.p1")}</p><p>{t("guide.sections.noMoves.p2")}</p><RuleHighlight>{t("guide.sections.noMoves.highlight")}</RuleHighlight>
          </GuideSection>
          <GuideSection eyebrow={t("guide.sections.movement.eyebrow")} id="movement" title={t("guide.sections.movement.title")}>
            <p>{t("guide.sections.movement.intro")}</p><div className="piece-movement-grid">{PIECES.map((piece) => <PieceMovementCard description={t(`guide.sections.movement.${piece}`)} key={piece} name={t(`common.pieces.${piece}`)} />)}</div>
          </GuideSection>
          <GuideSection eyebrow={t("guide.sections.special.eyebrow")} id="special" title={t("guide.sections.special.title")}>
            <div className="special-moves-list">{(["castling", "enPassant", "promotion"] as const).map((move) => <article key={move}><h3>{t(`guide.sections.special.${move}`)}</h3><p>{t(`guide.sections.special.${move}Text`)}</p></article>)}</div>
          </GuideSection>
          {SIMPLE_SECTIONS.slice(6).map((key) => <GuideSection eyebrow={t(`guide.sections.${key}.eyebrow`)} id={key} key={key} title={t(`guide.sections.${key}.title`)}><p>{t(`guide.sections.${key}.p1`)}</p>{key === "clock" && <><p>{t("guide.sections.clock.p2")}</p><p>{t("guide.sections.clock.p3")}</p></>}{key === "victory" && <RuleHighlight>{t("guide.sections.victory.highlight")}</RuleHighlight>}</GuideSection>)}
          <GuideSection eyebrow={t("guide.sections.customization.eyebrow")} id="customization" title={t("guide.sections.customization.title")}>
            <div className="customization-grid"><article><h3>{t("guide.sections.customization.pieceSet")}</h3><p>{t("guide.sections.customization.pieceText")}</p></article><article><h3>{t("guide.sections.customization.boardTheme")}</h3><p>{t("guide.sections.customization.boardText")}</p></article></div><RuleHighlight>{t("guide.sections.customization.highlight")}</RuleHighlight>
          </GuideSection>
        </div>
        <GuideSection eyebrow={t("guide.sections.example.eyebrow")} id="example" title={t("guide.sections.example.title")}>
          <RouletteResultExample pieces={translatedPieces(["rook", "pawn", "pawn"])} /><ol className="turn-example-list">{(t("guide.sections.example.steps", { returnObjects: true }) as string[]).map((step) => <li key={step}>{step}</li>)}</ol><p>{t("guide.sections.example.p")}</p>
        </GuideSection>
        <section aria-labelledby="remember-title" className="remember-section"><header className="guide-section-header"><p>{t("guide.rememberEyebrow")}</p><h2 id="remember-title">{t("guide.remember")}</h2></header><ul>{(t("guide.reminders", { returnObjects: true }) as string[]).map((reminder) => <li key={reminder}><span aria-hidden="true">◆</span>{reminder}</li>)}</ul></section>
        <footer className="guide-footer"><div><p>{t("guide.ready")}</p><h2>{t("guide.footer")}</h2></div><nav aria-label={t("common.navigation.howToPlay")}><Link className="guide-action guide-action-primary" to="/play">{t("common.actions.play")}<span aria-hidden="true">→</span></Link><Link className="guide-action guide-action-secondary" to="/">{t("common.actions.backToHome")}</Link></nav></footer>
      </div>
    </main>
  );
}

export default HowToPlayPage;
