import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { getAchievementPresentation } from "../../domain/achievements/AchievementCatalog";
import type { AchievementDefinition, AchievementId } from "../../domain/achievements/AchievementContracts";
import type { AchievementReadService, AchievementReadState } from "../../application/achievements/AchievementRead";
import type { AppLanguage } from "../../settings/AppSettings";
import { COLLECTION_FILTERS, collectionItems, type CollectionFilter } from "../../application/achievements/AchievementCollectionFilter";
import { selectAchievementProgress, type AchievementProgress } from "../../application/achievements/AchievementProgress";
import type { CloudProfileSnapshot } from "../../profile/PlayerSync";

function visibleCount(width: number): number {
  if (width <= 560) return 1;
  if (width <= 900) return 2;
  if (width <= 1100) return 3;
  return 4;
}

function AchievementCard({ achievement, language, unlockedAt, progress }: {
  readonly achievement: AchievementDefinition;
  readonly language: AppLanguage;
  readonly unlockedAt?: string;
  readonly progress: AchievementProgress | null;
}) {
  const { t } = useTranslation();
  const unlocked = unlockedAt !== undefined;
  const presentation = getAchievementPresentation(achievement, unlocked);
  const secret = presentation.locked && achievement.category === "single-match";
  const date = unlockedAt ? new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).format(new Date(unlockedAt)) : null;
  return <li className={`achievement-collection-card${unlocked ? " is-unlocked" : ""}`} data-achievement-id={achievement.id} data-unlocked={unlocked}>
    <span className="achievement-collection-category">{t(`profile.collection.category.${achievement.category}`)}</span>
    <span aria-hidden="true" className="achievement-collection-mark">{unlocked ? "✦" : "◇"}</span>
    <h3>{secret ? t("profile.collection.secretChallenge") : presentation.title[language]}</h3>
    <p className="achievement-collection-description">{secret ? presentation.hint?.[language] : presentation.description?.[language]}</p>
    <p className="achievement-collection-state">{unlocked ? t("profile.collection.unlocked") : t("profile.collection.locked")}</p>
    {date && <time dateTime={unlockedAt}>{t("profile.collection.unlockedOn", { date })}</time>}
    {progress && <div className="achievement-collection-progress">
      <div className="achievement-collection-progress-line"><span>{t("profile.collection.progress")}</span>
        <strong>{progress.current}/{progress.target}</strong></div>
      <div aria-hidden="true" className="achievement-collection-progress-track"><span style={{ width: `${progress.percent}%` }} /></div>
      {progress.recordedOnly && <small>{t("profile.collection.recordedProgress")}</small>}
    </div>}
  </li>;
}

export default function AchievementCollection({ reader, state, owner, language, progressSnapshot }: {
  readonly reader: AchievementReadService;
  readonly state: AchievementReadState;
  readonly owner: string | null;
  readonly language: AppLanguage;
  readonly progressSnapshot: CloudProfileSnapshot | null;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<CollectionFilter>("all");
  const [count, setCount] = useState(() => visibleCount(window.innerWidth));
  const [firstIndex, setFirstIndex] = useState(0);
  const viewport = useRef<HTMLDivElement>(null);
  const programmaticTarget = useRef<number | null>(null);
  const items = useMemo(() => collectionItems(filter), [filter]);
  const safeState = useMemo<AchievementReadState>(() => reader.getOwner() === owner ? state : { status: "loading" }, [reader, owner, state]);
  const authoritative = safeState.status === "success" || safeState.status === "empty";
  const unlocked = useMemo(() => new Map<AchievementId, string>(
    safeState.status === "success" ? safeState.collection.unlocks.map((item) => [item.achievementId, item.unlockedAt]) : [],
  ), [safeState]);
  const pageCount = Math.ceil(items.length / count);
  const currentPage = Math.min(Math.floor(firstIndex / count), pageCount - 1);

  useEffect(() => {
    const update = () => setCount(visibleCount(window.innerWidth));
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    programmaticTarget.current = 0;
    element.scrollTo({ left: 0, behavior: "instant" });
  }, [filter, count]);

  const selectFilter = (next: CollectionFilter) => {
    programmaticTarget.current = 0;
    setFilter(next);
    setFirstIndex(0);
  };

  const moveTo = (next: number) => {
    const element = viewport.current;
    if (!element) return;
    const target = Math.max(0, Math.min(pageCount - 1, next));
    setFirstIndex(target * count);
    const card = element.querySelector<HTMLElement>(`.achievement-collection-card:nth-child(${target * count + 1})`);
    if (card) {
      const left = card.offsetLeft;
      programmaticTarget.current = left;
      element.scrollTo({ left, behavior: "instant" });
    }
  };

  const syncScroll = () => {
    const element = viewport.current;
    if (!element || element.scrollWidth <= element.clientWidth) { setFirstIndex(0); return; }
    if (programmaticTarget.current !== null) {
      if (Math.abs(element.scrollLeft - programmaticTarget.current) <= 2) programmaticTarget.current = null;
      return;
    }
    const card = element.querySelector<HTMLElement>(".achievement-collection-card");
    if (!card) return;
    const gap = Number.parseFloat(window.getComputedStyle(card.parentElement!).columnGap) || 0;
    setFirstIndex(Math.min(items.length - 1, Math.round(element.scrollLeft / (card.offsetWidth + gap))));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") { event.preventDefault(); moveTo(currentPage + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); moveTo(currentPage - 1); }
  };

  const start = Math.min(items.length, firstIndex + 1);
  const end = Math.min(items.length, start + count - 1);

  return <div className="achievement-collection" data-filter={filter}>
    <div aria-label={t("profile.collection.filtersLabel")} className="achievement-collection-filters" role="group">
      {COLLECTION_FILTERS.map((item) => <button aria-pressed={filter === item} key={item} onClick={() => selectFilter(item)} type="button">
        {t(`profile.collection.filters.${item}`)} <span>{collectionItems(item).length}</span>
      </button>)}
    </div>
    {(safeState.status === "loading" || safeState.status === "idle") && <p className="achievement-collection-notice" role="status">{t("profile.collection.loading")}</p>}
    {safeState.status === "error" && <div className="achievement-collection-notice" role="alert">
      <p>{t(safeState.reason === "catalog-mismatch" ? "profile.collection.catalogMismatch" : "profile.collection.error")}</p>
      <button onClick={() => void reader.retry()} type="button">{t("profile.collection.retry")}</button>
    </div>}
    {safeState.status === "local-only" && <p className="achievement-collection-notice" role="status">{t("profile.collection.localOnly")}</p>}
    {authoritative && <>
      <div aria-label={t("profile.collection.carouselLabel")} className="achievement-collection-viewport"
        onKeyDown={handleKeyDown} onPointerDown={() => { programmaticTarget.current = null; }}
        onScroll={syncScroll} onWheel={() => { programmaticTarget.current = null; }} ref={viewport} role="region" tabIndex={0}>
        <ol className="achievement-collection-track">{items.map((achievement) => <AchievementCard
          achievement={achievement} key={achievement.id} language={language} unlockedAt={unlocked.get(achievement.id)}
          progress={selectAchievementProgress(achievement.id, authoritative ? progressSnapshot : null)}
        />)}{Array.from({ length: pageCount * count - items.length }, (_, index) =>
          <li aria-hidden="true" className="achievement-collection-placeholder" key={`blank-${index}`} />)}</ol>
      </div>
      <div className="achievement-collection-controls">
        <button aria-label={t("profile.collection.previous")} disabled={firstIndex === 0} onClick={() => moveTo(currentPage - 1)} type="button">←</button>
        <span aria-live="polite">{t("profile.collection.position", { start, end, total: items.length })}</span>
        <button aria-label={t("profile.collection.next")} disabled={firstIndex >= (pageCount - 1) * count} onClick={() => moveTo(currentPage + 1)} type="button">→</button>
      </div>
    </>}
  </div>;
}
