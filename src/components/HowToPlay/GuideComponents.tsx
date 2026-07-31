import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface GuideSectionProps {
  children: ReactNode;
  eyebrow?: string;
  id: string;
  title: string;
}

interface QuickRuleCardProps {
  description: string;
  index: number;
  title: string;
}

interface RouletteResultExampleProps {
  caption?: string;
  pieces: readonly string[];
}

interface PieceMovementCardProps {
  description: string;
  name: string;
}

interface RuleHighlightProps {
  children: ReactNode;
}

export function GuideSection({
  children,
  eyebrow,
  id,
  title,
}: GuideSectionProps) {
  return (
    <section aria-labelledby={id} className="guide-section">
      <header className="guide-section-header">
        {eyebrow && <p>{eyebrow}</p>}
        <h2 id={id}>{title}</h2>
      </header>
      <div className="guide-section-content">{children}</div>
    </section>
  );
}

export function QuickRuleCard({
  description,
  index,
  title,
}: QuickRuleCardProps) {
  return (
    <article className="quick-rule-card">
      <span aria-hidden="true">{String(index).padStart(2, "0")}</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

export function RouletteResultExample({
  caption,
  pieces,
}: RouletteResultExampleProps) {
  const { t } = useTranslation();
  return (
    <figure className="roulette-result-example">
      <div aria-label={t("guide.rouletteResult", { pieces: pieces.join(", ") })}>
        {pieces.map((piece, index) => (
          <span key={`${piece}-${index}`}>{piece}</span>
        ))}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function PieceMovementCard({
  description,
  name,
}: PieceMovementCardProps) {
  return (
    <article className="piece-movement-card">
      <h3>{name}</h3>
      <p>{description}</p>
    </article>
  );
}

export function RuleHighlight({ children }: RuleHighlightProps) {
  return (
    <p className="rule-highlight">
      <span aria-hidden="true">◆</span>
      {children}
    </p>
  );
}
