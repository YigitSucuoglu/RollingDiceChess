export const AUTH_SESSION_SCHEMA_VERSION = 1;

declare const accountIdBrand: unique symbol;
declare const guestSessionIdBrand: unique symbol;

export type AccountId = string & { readonly [accountIdBrand]: true };
export type GuestSessionId = string & { readonly [guestSessionIdBrand]: true };

export interface AuthenticatedAccount {
  readonly accountId: AccountId;
  readonly provider: "google";
}

export type AuthenticationFailureCode =
  | "cancelled"
  | "not-supported"
  | "temporarily-unavailable"
  | "unknown";

export type AuthenticationState =
  | { readonly status: "unselected"; readonly guestSessionId: GuestSessionId }
  | {
      readonly status: "guest";
      readonly guestSessionId: GuestSessionId;
      readonly persistence: "cloud" | "local";
    }
  | { readonly status: "authenticating"; readonly guestSessionId: GuestSessionId }
  | { readonly status: "authenticated"; readonly account: AuthenticatedAccount }
  | {
      readonly status: "failed";
      readonly failureCode: AuthenticationFailureCode;
      readonly guestSessionId: GuestSessionId;
    };

export interface AuthenticationSession {
  readonly schemaVersion: typeof AUTH_SESSION_SCHEMA_VERSION;
  readonly state: AuthenticationState;
}

export function cloneAuthenticationSession(
  session: AuthenticationSession,
): AuthenticationSession {
  return {
    schemaVersion: session.schemaVersion,
    state: session.state.status === "authenticated"
      ? { status: "authenticated", account: { ...session.state.account } }
      : { ...session.state },
  };
}

export function toAccountId(value: string): AccountId {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new Error("AccountId must contain between 1 and 128 characters.");
  }
  return normalized as AccountId;
}

export function toGuestSessionId(value: string): GuestSessionId {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new Error("GuestSessionId must contain between 1 and 128 characters.");
  }
  return normalized as GuestSessionId;
}
