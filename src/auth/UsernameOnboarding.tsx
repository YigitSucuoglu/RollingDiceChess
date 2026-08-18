import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { UsernameValidationError } from "../application/players/PlayerContracts";
import playerProfileService from "../profile/PlayerProfileService";
import { useAuthentication } from "./authentication-context";
import "../styles/UsernameOnboarding.css";

type FormError = "invalid" | "reserved-guest" | "unavailable" | null;

export default function UsernameOnboarding() {
  const { t } = useTranslation();
  const { authentication } = useAuthentication();
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await playerProfileService.renameCurrentAccount(username);
    } catch (caught) {
      setError(caught instanceof UsernameValidationError ? caught.code : "unavailable");
    } finally {
      setPending(false);
    }
  };

  const signOut = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await authentication.signOut();
    } catch {
      setError("unavailable");
      setPending(false);
    }
  };

  return (
    <main className="username-gate">
      <section aria-labelledby="username-onboarding-title" className="username-card">
        <p className="username-eyebrow">RouletteChess</p>
        <h1 id="username-onboarding-title">{t("username.onboarding.title")}</h1>
        <p className="username-description">{t("username.onboarding.description")}</p>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="account-username">{t("username.label")}</label>
          <input
            aria-describedby={error ? "username-error username-helper" : "username-helper"}
            aria-invalid={Boolean(error)}
            autoComplete="nickname"
            autoFocus
            disabled={pending}
            id="account-username"
            maxLength={24}
            onChange={(event) => setUsername(event.target.value)}
            value={username}
          />
          {error && (
            <p className="username-error" id="username-error" role="alert">
              {t(`username.errors.${error}`)}
            </p>
          )}
          <p className="username-helper" id="username-helper">{t("username.onboarding.helper")}</p>
          <button aria-busy={pending} disabled={pending} type="submit">
            {pending ? t("username.saving") : t("username.continue")}
          </button>
        </form>
        <button className="username-sign-out" disabled={pending} onClick={() => void signOut()} type="button">
          {t("auth.signOut")}
        </button>
      </section>
    </main>
  );
}

export function AccountProfileUnavailable() {
  const { t } = useTranslation();
  const { authentication, session } = useAuthentication();
  const [pending, setPending] = useState(false);

  const retry = async () => {
    if (pending) return;
    setPending(true);
    await playerProfileService.handleAuthenticationSession(session);
    setPending(false);
  };

  return (
    <main className="username-gate">
      <section aria-labelledby="profile-unavailable-title" className="username-card">
        <p className="username-eyebrow">RouletteChess</p>
        <h1 id="profile-unavailable-title">{t("username.unavailable.title")}</h1>
        <p className="username-description">{t("username.unavailable.description")}</p>
        <div className="username-recovery-actions">
          <button disabled={pending} onClick={() => void retry()} type="button">{t("username.retry")}</button>
          <button disabled={pending} onClick={() => void authentication.signOut()} type="button">{t("auth.signOut")}</button>
        </div>
      </section>
    </main>
  );
}
