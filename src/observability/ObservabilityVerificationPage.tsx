import { useState } from "react";

import { captureException } from "./Observability";
import "./ObservabilityVerificationPage.css";

export const HANDLED_VERIFICATION_MESSAGE =
  "RouletteChess OBS-01B handled verification error";
export const BOUNDARY_VERIFICATION_MESSAGE =
  "RouletteChess OBS-01B boundary verification error";

interface ObservabilityVerificationPageProps {
  readonly reportException?: typeof captureException;
}

function BoundaryVerificationFailure(): never {
  throw new Error(BOUNDARY_VERIFICATION_MESSAGE);
}

export default function ObservabilityVerificationPage({
  reportException = captureException,
}: ObservabilityVerificationPageProps) {
  const [captureRequested, setCaptureRequested] = useState(false);
  const [triggerBoundary, setTriggerBoundary] = useState(false);

  if (triggerBoundary) return <BoundaryVerificationFailure />;

  const captureHandledException = (): void => {
    reportException(new Error(HANDLED_VERIFICATION_MESSAGE), {
      area: "app",
      operation: "obs-01b-handled-verification",
      route: "/__observability-test",
    });
    setCaptureRequested(true);
  };

  return (
    <main className="observability-verification-page">
      <section aria-labelledby="observability-verification-title">
        <p className="observability-verification-page__eyebrow">Developer verification tool</p>
        <h1 id="observability-verification-title">OBS-01B live verification</h1>
        <p>This temporary page sends no profile, storage, or gameplay data.</p>
        <div className="observability-verification-page__actions">
          <button onClick={captureHandledException} type="button">
            Send handled test exception
          </button>
          <button onClick={() => setTriggerBoundary(true)} type="button">
            Trigger Error Boundary
          </button>
        </div>
        {captureRequested ? (
          <p aria-live="polite" className="observability-verification-page__status">
            Test exception capture requested. Check the Sentry Issues page.
          </p>
        ) : null}
      </section>
    </main>
  );
}
