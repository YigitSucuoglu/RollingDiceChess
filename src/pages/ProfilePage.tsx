import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import playerProfileService, { formatPlayTime } from "../profile/PlayerProfileService";
import type { AppLanguage } from "../settings/AppSettings";
import "../styles/ProfilePage.css";
import { useAuthentication } from "../auth/authentication-context";
import accountMigrationService from "../application/accounts/AccountMigrationService";
import type { AccountMigrationState, ProfileConflictResolution } from "../application/accounts/AccountMigration";
import GoogleMark from "../components/GoogleMark/GoogleMark";
import { UsernameValidationError } from "../application/players/PlayerContracts";

const ACHIEVEMENT_PLACEHOLDERS = [
  "firstVictory", "hundredGames", "captureHundredKings", "tripleQueenRoll",
] as const;

type StatisticsView = "singleplayer" | "multiplayer";

interface RouletteStatCardProps {
  label: string;
  value: string | number;
  note?: string;
}

interface ModeStatCardProps {
  label: string;
  value: string;
}

function ModeStatCard({ label, value }: ModeStatCardProps) {
  return (
    <article className="profile-stat-card">
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}

function RouletteStatCard({
  label,
  value,
  note,
}: RouletteStatCardProps) {
  return (
    <article className="profile-stat-card profile-roulette-stat">
      <p>{label}</p>
      <strong>{value}</strong>
      {note && <span>{note}</span>}
    </article>
  );
}

function ProfilePage() {
  const { t, i18n } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage === "tr" ? "tr" : "en";
  const { authentication, session } = useAuthentication();
  const [, setProfileRevision] = useState(0);
  const profile = playerProfileService.getViewModel(language);
  const [authPending, setAuthPending] = useState(false);
  const [statisticsView, setStatisticsView] = useState<StatisticsView>("singleplayer");
  const [renaming, setRenaming] = useState(false);
  const [renamePending, setRenamePending] = useState(false);
  const [renameValue, setRenameValue] = useState(profile.displayName);
  const [renameError, setRenameError] = useState<"invalid" | "reserved-guest" | "unavailable" | null>(null);
  const [migration, setMigration] = useState<AccountMigrationState>(
    accountMigrationService.getState(),
  );
  const authenticated = session.state.status === "authenticated";
  const migrationUnresolved = migration.status === "profile-conflict"
    || (migration.status === "pending" && authenticated);

  const handleAuthentication = async () => {
    if (authPending) return;
    setAuthPending(true);
    if (authenticated) await authentication.signOut();
    else if (session.state.status === "guest" && session.state.persistence === "cloud") {
      await accountMigrationService.startGuestUpgrade();
    } else await authentication.beginAuthentication();
    setAuthPending(false);
  };

  const resolveConflict = async (resolution: ProfileConflictResolution) => {
    if (authPending) return;
    setAuthPending(true);
    await accountMigrationService.resolveConflict(resolution);
    setAuthPending(false);
  };

  const submitRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (renamePending) return;
    setRenamePending(true);
    setRenameError(null);
    try {
      await playerProfileService.renameCurrentAccount(renameValue);
      setRenaming(false);
    } catch (caught) {
      setRenameError(caught instanceof UsernameValidationError ? caught.code : "unavailable");
    } finally {
      setRenamePending(false);
    }
  };

  useEffect(() => accountMigrationService.subscribe(setMigration), []);

  useEffect(() => {
    const unsubscribe = playerProfileService.subscribe(() => setProfileRevision((value) => value + 1));
    void playerProfileService.reconnectCloudSync().catch(() => undefined);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t("profile.browserTitle");
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });

    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  const { progression, rouletteStats } = profile;
  const multiplayerStats = profile.multiplayerStatistics;
  const locale = language === "tr" ? "tr-TR" : "en-US";
  const formatInteger = (value: number) => new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
  const formatCanonicalRate = (value: number) => new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);

  return (
    <main className="profile-page">
      <div aria-hidden="true" className="profile-ambient profile-ambient-left" />
      <div aria-hidden="true" className="profile-ambient profile-ambient-right" />

      <div className="profile-shell">
        <nav aria-label={t("common.navigation.profile")} className="profile-nav">
          <Link className="profile-brand" to="/">RouletteChess</Link>
          <Link className="profile-back-link" to="/">
            <span aria-hidden="true">←</span>
            {t("common.actions.backToHome")}
          </Link>
        </nav>

        <header className="profile-heading">
          <p>{t("profile.eyebrow")}</p>
          <h1>{t("profile.title")}</h1>
        </header>

        <section aria-labelledby="profile-account-title" className="profile-account">
          <div>
            <p className="profile-overline">{t("auth.account")}</p>
            <h2 id="profile-account-title">
              {migrationUnresolved
                ? t("auth.googleSignInSuccessful")
                : authenticated ? t("auth.signedInWithGoogle") : t("auth.guest")}
            </h2>
            <p>{migrationUnresolved
              ? t("auth.migrationPendingDescription")
              : authenticated ? t("auth.cloudProfile")
              : session.state.status === "guest" && session.state.persistence === "cloud"
                ? t("auth.cloudGuestWarning")
                : t("auth.localGuestWarning")}</p>
            {playerProfileService.hasProfileSyncConflict() && (
              <p role="status">{t("auth.profileSyncConflict")}</p>
            )}
          </div>
          {!migrationUnresolved && (authenticated || authentication.isAuthenticationAvailable()) && (
            <button
              aria-busy={authPending}
              disabled={authPending}
              onClick={() => void handleAuthentication()}
              type="button"
            >
              {!authenticated && <GoogleMark />}
              <span>{authPending
                ? t("auth.connecting")
                : authenticated
                  ? t("auth.signOut")
                  : session.state.status === "guest" && session.state.persistence === "cloud"
                    ? t("auth.connectGoogle")
                    : t("auth.continueWithGoogle")}</span>
            </button>
          )}
        </section>

        {migration.status === "profile-conflict" && (
          <section aria-labelledby="profile-conflict-title" className="profile-conflict">
            <header>
              <p className="profile-overline">{t("auth.migrationEyebrow")}</p>
              <h2 id="profile-conflict-title">{t("auth.chooseProgress")}</h2>
              <p>{t("auth.noMergeWarning")}</p>
            </header>
            <div className="profile-conflict-grid">
              {([
                ["guest", migration.guest, "USE_GUEST_PROFILE"],
                ["google", migration.google, "USE_GOOGLE_PROFILE"],
              ] as const).map(([kind, summary, resolution]) => (
                <article key={kind}>
                  <h3>{t(`auth.${kind}Progress`)}</h3>
                  <strong>{summary.displayName}</strong>
                  <dl>
                    <div><dt>{t("auth.level")}</dt><dd>{summary.level}</dd></div>
                    <div><dt>{t("auth.games")}</dt><dd>{summary.gamesPlayed}</dd></div>
                    <div><dt>XP</dt><dd>{summary.totalXp}</dd></div>
                    <div><dt>{t("auth.rating")}</dt><dd>{summary.multiplayerRating}</dd></div>
                  </dl>
                  <button disabled={authPending} onClick={() => void resolveConflict(resolution)} type="button">
                    {kind === "google" && <GoogleMark />}
                    <span>{t(`auth.use${kind === "guest" ? "Guest" : "Google"}Progress`)}</span>
                  </button>
                </article>
              ))}
            </div>
            {migration.failureCode && <p className="profile-migration-message" role="alert">{t(`auth.migrationErrors.${migration.failureCode}`)}</p>}
          </section>
        )}
        {migration.status === "failed" && <p className="profile-migration-message" role="alert">{t(`auth.migrationErrors.${migration.failureCode}`)}</p>}
        {migration.status === "completed" && <p className="profile-migration-message" role="status">{t("auth.migrationComplete")}</p>}

        <section
          aria-labelledby="player-identity-title"
          className="profile-identity"
        >
          <div aria-hidden="true" className="profile-monogram">
            <span>{profile.monogram}</span>
          </div>

          <div className="profile-identity-copy">
            <p className="profile-overline">{t("profile.player")}</p>
            <h2 id="player-identity-title">{profile.displayName}</h2>
            {profile.publicDiscriminator && (
              <p className="profile-public-discriminator">#{profile.publicDiscriminator}</p>
            )}
            {authenticated && !migrationUnresolved && (renaming ? (
              <form className="profile-rename-form" onSubmit={(event) => void submitRename(event)}>
                <label htmlFor="profile-username">{t("username.label")}</label>
                <input
                  aria-describedby={renameError ? "profile-rename-error" : undefined}
                  aria-invalid={Boolean(renameError)}
                  autoComplete="nickname"
                  disabled={renamePending}
                  id="profile-username"
                  maxLength={24}
                  onChange={(event) => setRenameValue(event.target.value)}
                  value={renameValue}
                />
                {renameError && <p id="profile-rename-error" role="alert">{t(`username.errors.${renameError}`)}</p>}
                <div>
                  <button disabled={renamePending} type="submit">{renamePending ? t("username.saving") : t("username.save")}</button>
                  <button disabled={renamePending} onClick={() => {
                    setRenaming(false);
                    setRenameError(null);
                    setRenameValue(profile.displayName);
                  }} type="button">{t("username.cancel")}</button>
                </div>
              </form>
            ) : (
              <button className="profile-rename-trigger" onClick={() => {
                setRenameValue(profile.displayName);
                setRenaming(true);
              }} type="button">{t("username.change")}</button>
            ))}
            {!authenticated && (
              <p className="profile-rename-hint">{t("username.guestHint")}</p>
            )}
            <div className="profile-rank">
              <span>{t("common.level", { level: progression.level })}</span>
              <span aria-hidden="true">◆</span>
              <strong>{t(`titles.${progression.titleId}`)}</strong>
            </div>
            {profile.multiplayerRating !== null && (
              <div className="profile-rating" aria-label={t("profile.multiplayerRatingValue", { rating: profile.multiplayerRating })}>
                <span aria-hidden="true">◆</span>
                <div>
                  <small>{t("profile.multiplayerRating")}</small>
                  <strong>{profile.multiplayerRating}</strong>
                </div>
              </div>
            )}
            <p className="profile-joined">{t("profile.joined", { date: profile.joinedLabel })}</p>
          </div>

          <div className="profile-progression">
            <div className="profile-progress-header">
              <span>{t("profile.levelProgress")}</span>
              <strong>{t("common.level", { level: progression.level + 1 })}</strong>
            </div>
            <div
              aria-label={t("profile.progressLabel", { level: progression.level })}
              aria-valuemax={progression.requiredXp}
              aria-valuemin={0}
              aria-valuenow={progression.currentLevelXp}
              className="profile-progress-track"
              role="progressbar"
            >
              <span
                style={{
                  "--profile-progress":
                    `${progression.progressPercent}%`,
                } as CSSProperties}
              />
            </div>
            <p>
              {t("common.xpValue", { current: progression.currentLevelXp, required: progression.requiredXp })}
            </p>
          </div>
        </section>

        <section
          aria-labelledby="general-statistics-title"
          className="profile-section"
        >
          <div className="profile-statistics-header">
            <header className="profile-section-heading">
              <p>{t("profile.careerOverview")}</p>
              <h2 id="general-statistics-title">{t("profile.generalStatistics")}</h2>
            </header>
            <div aria-label={t("profile.statisticsViewLabel")} className="profile-statistics-switch">
              {(["singleplayer", "multiplayer"] as const).map((view) => (
                <button aria-pressed={statisticsView === view} key={view} onClick={() => setStatisticsView(view)} type="button">
                  <span aria-hidden="true">{statisticsView === view ? "◆" : "◇"}</span>
                  {t(`profile.statisticsViews.${view}`)}
                </button>
              ))}
            </div>
          </div>
          {statisticsView === "singleplayer" ? (
            <div className="profile-statistics-view" data-statistics-view="singleplayer">
              <p className="profile-statistics-scope">{t("profile.singleplayerScope")}</p>
              <div className="profile-general-grid">
                {profile.generalStats.map((stat) => (
                  <article className="profile-stat-card" key={stat.label}>
                    <strong>{stat.value}</strong>
                    <p>{t(`profile.stats.${stat.id}`)}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="profile-statistics-view profile-multiplayer-statistics" data-statistics-view="multiplayer">
              <p className="profile-statistics-scope">{t("profile.multiplayerScope")}</p>
              {multiplayerStats ? (
                <>
                  <section aria-labelledby="ranked-statistics-title" className="profile-multiplayer-group">
                    <h3 id="ranked-statistics-title">{t("profile.rankedStatistics")}</h3>
                    <div className="profile-multiplayer-ranked-grid">
                      {([
                        ["rating", formatInteger(multiplayerStats.rating)],
                        ["rankedGames", formatInteger(multiplayerStats.rankedGames)],
                        ["rankedWins", formatInteger(multiplayerStats.rankedWins)],
                        ["rankedLosses", formatInteger(multiplayerStats.rankedLosses)],
                        ["rankedWinRate", formatCanonicalRate(multiplayerStats.rankedWinRate)],
                        ["currentRankedWinStreak", formatInteger(multiplayerStats.currentRankedWinStreak)],
                        ["bestRankedWinStreak", formatInteger(multiplayerStats.bestRankedWinStreak)],
                      ] as const).map(([id, value]) => (
                        <ModeStatCard key={id} label={t(`profile.multiplayerStats.${id}`)} value={value} />
                      ))}
                    </div>
                  </section>
                  <section aria-labelledby="multiplayer-activity-title" className="profile-multiplayer-group profile-multiplayer-activity">
                    <h3 id="multiplayer-activity-title">{t("profile.multiplayerActivity")}</h3>
                    <div className="profile-multiplayer-activity-grid">
                      <ModeStatCard label={t("profile.multiplayerStats.unrankedGames")} value={formatInteger(multiplayerStats.unrankedGames)} />
                      <ModeStatCard label={t("profile.multiplayerStats.totalPlayTime")} value={formatPlayTime(Math.floor(multiplayerStats.totalMultiplayerPlayTimeMs / 1000), language)} />
                      <ModeStatCard label={t("profile.multiplayerStats.kingsCaptured")} value={formatInteger(multiplayerStats.multiplayerKingsCaptured)} />
                      <ModeStatCard label={t("profile.multiplayerStats.rouletteRolls")} value={formatInteger(multiplayerStats.multiplayerRouletteRolls)} />
                    </div>
                  </section>
                </>
              ) : (
                <p className="profile-statistics-unavailable" role="status">{t("profile.multiplayerUnavailable")}</p>
              )}
            </div>
          )}
        </section>

        <section
          aria-labelledby="roulette-statistics-title"
          className="profile-section profile-roulette-section"
          data-global-statistics="true"
        >
          <header className="profile-section-heading">
            <p>{t("profile.rouletteSignature")}</p>
            <h2 id="roulette-statistics-title">
              {t("profile.rouletteStatistics")}
            </h2>
          </header>
          <div className="profile-roulette-grid">
            <RouletteStatCard
              label={t("profile.stats.mostRolledPiece")}
              value={rouletteStats.mostRolledPieceType ? t(`common.pieces.${rouletteStats.mostRolledPieceType}`) : "—"}
              note={t("profile.rollCount", { count: formatInteger(rouletteStats.mostRolledPieceCount) })}
            />
            <RouletteStatCard
              label={t("profile.stats.mostPlayedPiece")}
              value={rouletteStats.mostPlayedPieceType ? t(`common.pieces.${rouletteStats.mostPlayedPieceType}`) : "—"}
              note={t("profile.moveCount", { count: formatInteger(rouletteStats.mostPlayedPieceCount) })}
            />
            <RouletteStatCard
              label={t("profile.stats.threeRightsUsed")}
              value={rouletteStats.threeRightsUsedLabel}
              note={t("profile.turnCount", {
                current: formatInteger(rouletteStats.threeRightsTurns),
                total: formatInteger(rouletteStats.playerTurnsCompleted),
              })}
            />
          </div>
          <article aria-labelledby="triple-rolls-title" className="profile-triple-rolls-card">
            <h3 id="triple-rolls-title">{t("profile.tripleRolls")}</h3>
            <ol className="profile-triple-rolls-list">
              {rouletteStats.tripleRolls.map((entry, index) => (
                <li data-column={index < 3 ? "left" : "right"} data-rank={index + 1} key={entry.pieceType}>
                  <span aria-hidden="true" className="profile-triple-rank">{index + 1}</span>
                  <span className="profile-triple-piece">{t(`common.pieces.${entry.pieceType}`)}</span>
                  <strong>{formatInteger(entry.count)}</strong>
                </li>
              ))}
            </ol>
          </article>
        </section>

        <section
          aria-labelledby="achievements-title"
          className="profile-section"
        >
          <header className="profile-section-heading">
            <p>{t("profile.futureMilestones")}</p>
            <h2 id="achievements-title">{t("profile.achievements")}</h2>
          </header>
          <div className="profile-achievements-grid">
            {ACHIEVEMENT_PLACEHOLDERS.map((achievement) => (
              <article className="profile-achievement" key={achievement}>
                <span aria-hidden="true" className="profile-lock">◇</span>
                <h3>{t(`profile.achievementNames.${achievement}`)}</h3>
                <p>{t("common.status.comingSoon")}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="profile-footer">
          <p>{t("profile.localDataNote")}</p>
          {!migrationUnresolved && <Link to="/play">
            {t("common.actions.play")}
            <span aria-hidden="true">→</span>
          </Link>}
        </footer>
      </div>
    </main>
  );
}

export default ProfilePage;
