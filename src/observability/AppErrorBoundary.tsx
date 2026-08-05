import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

import i18n from "../i18n";
import { captureException, flushObservability } from "./Observability";
import "./AppErrorBoundary.css";

interface AppErrorBoundaryProps {
  readonly children: ReactNode;
  readonly navigateHome?: () => void;
  readonly reportException?: typeof captureException;
}

interface AppErrorBoundaryState {
  readonly error: Error | null;
  readonly retryKey: number;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = { error: null, retryKey: 0 };

  private reported = false;

  public static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.reported) return;
    this.reported = true;
    (this.props.reportException ?? captureException)(error, {
      area: "app",
      componentStack: info.componentStack ?? undefined,
      operation: "react-error-boundary",
      route: typeof window === "undefined" ? "/" : window.location.pathname,
    });
  }

  public render(): ReactNode {
    if (!this.state.error) {
      return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
    }

    return (
      <main className="fatal-error-page">
        <section aria-labelledby="fatal-error-title" className="fatal-error-panel" role="alert">
          <p className="fatal-error-brand">RouletteChess</p>
          <h1 id="fatal-error-title">{i18n.t("errors.fatal.title")}</h1>
          <p>{i18n.t("errors.fatal.message")}</p>
          <div className="fatal-error-actions">
            <button onClick={this.retry} type="button">{i18n.t("errors.fatal.tryAgain")}</button>
            <button onClick={() => void this.backHome()} type="button">{i18n.t("errors.fatal.backHome")}</button>
          </div>
        </section>
      </main>
    );
  }

  private readonly retry = (): void => {
    this.reported = false;
    this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  private readonly backHome = async (): Promise<void> => {
    await flushObservability(250);
    (this.props.navigateHome ?? (() => window.location.assign("/")))();
  };
}
