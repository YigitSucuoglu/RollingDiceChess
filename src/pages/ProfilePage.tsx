import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import playerProfileService, {
} from "../profile/PlayerProfileService";
import type { AppLanguage } from "../settings/AppSettings";
import "../styles/ProfilePage.css";
import { useAuthentication } from "../auth/authentication-context";

const ACHIEVEMENT_PLACEHOLDERS = [
  "firstVictory", "hundredGames", "captureHundredKings", "tripleQueenRoll",
] as const;

interface RouletteStatCardProps {
  label: string;
  value: string | number;
  note?: string;
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
  const profile = playerProfileService.getViewModel(language);
  const [authPending, setAuthPending] = useState(false);
  const authenticated = session.state.status === "authenticated";

  const handleAuthentication = async () => {
    if (authPending) return;
    setAuthPending(true);
    if (authenticated) await authentication.signOut();
    else await authentication.beginAuthentication();
    setAuthPending(false);
  };

  useEffect(() => {
    const previousTitle = document.title;
    document.title = t("profile.browserTitle");
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });

    return () => {
      document.title = previousTitle;
    };
  }, [t]);

  const { progression, rouletteStats } = profile;

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
              {authenticated ? t("auth.signedInWithGoogle") : t("auth.guest")}
            </h2>
            <p>{authenticated
              ? t("auth.cloudProfile")
              : session.state.status === "guest" && session.state.persistence === "cloud"
                ? t("auth.cloudGuestWarning")
                : t("auth.localGuestWarning")}</p>
            {playerProfileService.hasProfileSyncConflict() && (
              <p role="status">{t("auth.profileSyncConflict")}</p>
            )}
          </div>
          {(authenticated || authentication.isAuthenticationAvailable()) && (
            <button
              aria-busy={authPending}
              disabled={authPending}
              onClick={() => void handleAuthentication()}
              type="button"
            >
              {authPending
                ? t("auth.connecting")
                : authenticated
                  ? t("auth.signOut")
                  : t("auth.continueWithGoogle")}
            </button>
          )}
        </section>

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
            <div className="profile-rank">
              <span>{t("common.level", { level: progression.level })}</span>
              <span aria-hidden="true">◆</span>
              <strong>{t(`titles.${progression.titleId}`)}</strong>
            </div>
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
          <header className="profile-section-heading">
            <p>{t("profile.careerOverview")}</p>
            <h2 id="general-statistics-title">{t("profile.generalStatistics")}</h2>
          </header>
          <div className="profile-general-grid">
            {profile.generalStats.map((stat) => (
              <article className="profile-stat-card" key={stat.label}>
                <strong>{stat.value}</strong>
                <p>{t(`profile.stats.${stat.id}`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="roulette-statistics-title"
          className="profile-section"
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
            />
            <RouletteStatCard
              label={t("profile.stats.mostPlayedPiece")}
              value={rouletteStats.mostPlayedPieceType ? t(`common.pieces.${rouletteStats.mostPlayedPieceType}`) : "—"}
            />
            <RouletteStatCard
              label={t("profile.stats.mostSuccessfulPiece")}
              value={rouletteStats.mostSuccessfulPieceType ? t(`common.pieces.${rouletteStats.mostSuccessfulPieceType}`) : "—"}
            />
            <RouletteStatCard
              label={t("profile.stats.threeRightsUsed")}
              value={rouletteStats.threeRightsUsedLabel}
            />
            <RouletteStatCard
              label={t("profile.stats.triplePawnRolls")}
              value={rouletteStats.triplePawnRolls}
            />
            <RouletteStatCard
              label={t("profile.stats.tripleKnightRolls")}
              value={rouletteStats.tripleKnightRolls}
            />
            <RouletteStatCard
              label={t("profile.stats.tripleQueenRolls")}
              value={rouletteStats.tripleQueenRolls}
            />
          </div>
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
          <Link to="/play">
            {t("common.actions.play")}
            <span aria-hidden="true">→</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}

export default ProfilePage;
