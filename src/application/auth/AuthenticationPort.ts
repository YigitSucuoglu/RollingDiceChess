import type { AuthenticationSession } from "./AuthenticationContracts";

export type AuthenticationStateListener = (
  session: AuthenticationSession,
) => void;

export interface AuthenticationPort {
  getSession(): AuthenticationSession;
  restoreSession(): Promise<AuthenticationSession>;
  subscribe(listener: AuthenticationStateListener): () => void;
  beginAuthentication(): Promise<AuthenticationSession>;
  signOut(): Promise<AuthenticationSession>;
  dispose(): void;
}
