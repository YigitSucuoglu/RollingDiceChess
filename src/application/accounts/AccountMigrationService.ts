import type {
  AccountMigrationListener,
  AccountMigrationPort,
  AccountMigrationState,
  ProfileConflictResolution,
} from "./AccountMigration";

class AccountMigrationService implements AccountMigrationPort {
  private delegate?: AccountMigrationPort;
  private delegateUnsubscribe?: () => void;
  private readonly listeners = new Set<AccountMigrationListener>();
  private state: AccountMigrationState = { status: "idle" };

  public configure(delegate: AccountMigrationPort): void {
    this.delegateUnsubscribe?.();
    this.delegate?.dispose();
    this.delegate = delegate;
    this.state = delegate.getState();
    this.delegateUnsubscribe = delegate.subscribe((state) => {
      this.state = state;
      for (const listener of this.listeners) listener(state);
    });
  }

  public getState(): AccountMigrationState { return this.state; }

  public subscribe(listener: AccountMigrationListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public async startGuestUpgrade(): Promise<void> {
    if (!this.delegate) {
      this.publish({ status: "failed", failureCode: "temporarily-unavailable" });
      return;
    }
    await this.delegate.startGuestUpgrade();
  }

  public async restoreContinuation(): Promise<boolean> {
    return this.delegate?.restoreContinuation() ?? false;
  }

  public async resolveConflict(resolution: ProfileConflictResolution): Promise<void> {
    await this.delegate?.resolveConflict(resolution);
  }

  public cancelConflict(): void { this.delegate?.cancelConflict(); }

  public dispose(): void {
    this.delegateUnsubscribe?.();
    this.delegate?.dispose();
    this.delegate = undefined;
    this.listeners.clear();
    this.state = { status: "idle" };
  }

  private publish(state: AccountMigrationState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

const accountMigrationService = new AccountMigrationService();

export default accountMigrationService;
