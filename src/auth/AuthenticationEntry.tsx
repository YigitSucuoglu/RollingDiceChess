import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuthentication } from "./authentication-context";
import "../styles/AuthenticationEntry.css";

export default function AuthenticationEntry() {
  const { t } = useTranslation();
  const { authentication, session } = useAuthentication();
  const [pending, setPending] = useState(false);
  const failed = session.state.status === "failed";

  const signIn = async () => {
    if (pending) return;
    setPending(true);
    await authentication.beginAuthentication();
    setPending(false);
  };

  return (
    <main className="auth-entry">
      <section aria-labelledby="auth-entry-title" className="auth-entry-card">
        <p className="auth-entry-eyebrow">RouletteChess</p>
        <h1 id="auth-entry-title">{t("auth.title")}</h1>
        <p>{t("auth.description")}</p>
        {failed && <p aria-live="polite" className="auth-entry-error">{t("auth.failure")}</p>}
        <div className="auth-entry-actions">
          <button
            aria-busy={pending}
            className="auth-entry-google"
            disabled={pending}
            onClick={() => void signIn()}
            type="button"
          >
            {pending ? t("auth.connecting") : t("auth.continueWithGoogle")}
          </button>
          <button
            className="auth-entry-guest"
            onClick={() => authentication.chooseGuest()}
            type="button"
          >
            {t("auth.playAsGuest")}
          </button>
        </div>
        <p className="auth-entry-note">{t("auth.guestNote")}</p>
      </section>
    </main>
  );
}
