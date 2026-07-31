import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import playerProfileService, {
  type PlayerProfileViewModel,
} from "../profile/PlayerProfileService";
import "../styles/ProfilePage.css";

const ACHIEVEMENT_PLACEHOLDERS = [
  "First Victory",
  "100 Games",
  "Capture 100 Kings",
  "Triple Queen Roll",
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
  const [profile] = useState<PlayerProfileViewModel>(() =>
    playerProfileService.getViewModel()
  );

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Profile | RouletteChess";
    window.scrollTo({ left: 0, top: 0, behavior: "auto" });

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const { progression, rouletteStats } = profile;

  return (
    <main className="profile-page">
      <div aria-hidden="true" className="profile-ambient profile-ambient-left" />
      <div aria-hidden="true" className="profile-ambient profile-ambient-right" />

      <div className="profile-shell">
        <nav aria-label="Profile navigation" className="profile-nav">
          <Link className="profile-brand" to="/">RouletteChess</Link>
          <Link className="profile-back-link" to="/">
            <span aria-hidden="true">←</span>
            Back to Home
          </Link>
        </nav>

        <header className="profile-heading">
          <p>Offline player hub</p>
          <h1>Profile</h1>
        </header>

        <section
          aria-labelledby="player-identity-title"
          className="profile-identity"
        >
          <div aria-hidden="true" className="profile-monogram">
            <span>{profile.monogram}</span>
          </div>

          <div className="profile-identity-copy">
            <p className="profile-overline">Player</p>
            <h2 id="player-identity-title">{profile.displayName}</h2>
            <div className="profile-rank">
              <span>Level {progression.level}</span>
              <span aria-hidden="true">◆</span>
              <strong>{progression.title}</strong>
            </div>
            <p className="profile-joined">Joined {profile.joinedLabel}</p>
          </div>

          <div className="profile-progression">
            <div className="profile-progress-header">
              <span>Level progress</span>
              <strong>Level {progression.level + 1}</strong>
            </div>
            <div
              aria-label={`Level ${progression.level} experience progress`}
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
              {progression.currentLevelXp} / {progression.requiredXp} XP
            </p>
          </div>
        </section>

        <section
          aria-labelledby="general-statistics-title"
          className="profile-section"
        >
          <header className="profile-section-heading">
            <p>Career overview</p>
            <h2 id="general-statistics-title">General Statistics</h2>
          </header>
          <div className="profile-general-grid">
            {profile.generalStats.map((stat) => (
              <article className="profile-stat-card" key={stat.label}>
                <strong>{stat.value}</strong>
                <p>{stat.label}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="roulette-statistics-title"
          className="profile-section"
        >
          <header className="profile-section-heading">
            <p>Your roulette signature</p>
            <h2 id="roulette-statistics-title">
              RouletteChess Statistics
            </h2>
          </header>
          <div className="profile-roulette-grid">
            <RouletteStatCard
              label="Most Rolled Piece"
              value={rouletteStats.mostRolledPiece}
            />
            <RouletteStatCard
              label="Most Played Piece"
              value={rouletteStats.mostPlayedPiece}
            />
            <RouletteStatCard
              label="Most Successful Piece"
              value={rouletteStats.mostSuccessfulPiece}
            />
            <RouletteStatCard
              label="Three Rights Used"
              value={rouletteStats.threeRightsUsedLabel}
            />
            <RouletteStatCard
              label="Triple Pawn Rolls"
              value={rouletteStats.triplePawnRolls}
            />
            <RouletteStatCard
              label="Triple Knight Rolls"
              value={rouletteStats.tripleKnightRolls}
            />
            <RouletteStatCard
              label="Triple Queen Rolls"
              value={rouletteStats.tripleQueenRolls}
            />
          </div>
        </section>

        <section
          aria-labelledby="achievements-title"
          className="profile-section"
        >
          <header className="profile-section-heading">
            <p>Future milestones</p>
            <h2 id="achievements-title">Achievements</h2>
          </header>
          <div className="profile-achievements-grid">
            {ACHIEVEMENT_PLACEHOLDERS.map((achievement) => (
              <article className="profile-achievement" key={achievement}>
                <span aria-hidden="true" className="profile-lock">◇</span>
                <h3>{achievement}</h3>
                <p>Coming soon</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="profile-footer">
          <p>Offline profile data stays on this device.</p>
          <Link to="/play">
            Play
            <span aria-hidden="true">→</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}

export default ProfilePage;
