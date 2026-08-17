# Guest-to-Google Account Migration

## Identity rule

RouletteChess identity is the UUID `PlayerId`. Google authenticates an account; it is not the player identity. Display names remain mutable and non-unique.

## Runtime flow

1. A cloud Guest flushes every acknowledged/pending DATA-01B progression operation.
2. `create_guest_upgrade_intent` creates an expiring, one-time handoff whose plaintext token is returned only to the current Guest. The database stores only its SHA-256 digest.
3. The browser stores the token and a two-value continuation phase in session storage, then calls Supabase `linkIdentity({ provider: "google" })`.
4. If Google has no prior Supabase identity, the Supabase Auth user remains the same. `complete_linked_guest_upgrade` changes only ownership kind; the Guest PlayerId, progression, display name, and rating survive unchanged.
5. If Google already belongs to another Supabase account, the app signs into that existing account and calls `inspect_profile_conflict`. The server returns only the two minimal profile summaries.
6. The user explicitly selects Guest or Google progression. `resolve_profile_conflict` transactionally keeps the selected PlayerId active and marks the other retired/replaced. Statistics, XP, and rating are never added or averaged.
7. After server confirmation, `PlayerSyncCoordinator` fetches the current cloud profile, verifies its PlayerId against the returned survivor, and explicitly adopts that snapshot in both sync state and the local cache before progression recording resumes.

The DATA-01B local/cloud conflict must be resolved before account migration starts. Local-only fallback Guests cannot migrate until a cloud Guest identity is established. Linking requires connectivity; offline gameplay and pending progression remain available. Progression-producing profile updates are suspended from OAuth handoff until canonical adoption completes, preventing an ambiguous or retired PlayerId from receiving new local operations.

## Retry and security

Migration intents are expiry-aware, ownership-bound, and additionally bound to the permanent account on first inspection. Same-decision replay returns the same survivor; contradictory replay and another account's token are rejected. Browser roles cannot update ownership, intents, profiles, or ratings directly.

The continuation contains no OAuth token or Supabase session. Supabase owns OAuth callback/session persistence. No email, Google profile metadata, AccountId, PlayerId, migration token, or progression payload is sent to observability.

An unresolved conflict is not presented as a completed account connection. Normal Sign Out and Play actions are withheld on the Profile page until the user chooses. Leaving the page does not choose, merge, retire, unlink, or clear the continuation; returning to Profile resumes the same conflict. There is intentionally no destructive Cancel action.

## Recovery semantics

After linking, sign-out does not delete either cloud data or the canonical PlayerId. Signing in with the same Google account on another browser resolves to that canonical profile. Clearing browser data therefore no longer orphans the linked profile.

## Required remote configuration

Supabase Dashboard → Authentication → Providers → Manual Linking must be enabled. Redirect URLs remain governed by the existing localhost, production, and approved preview allowlist.

Apply `supabase/migrations/202608170001_data_01c_account_migration.sql`, then run `supabase/tests/data_01c_schema_verification.sql` in SQL Editor before considering DATA-01C complete.

Real Google OAuth and destructive conflict choices must be verified manually with disposable profiles. Automated normal E2E uses deterministic adapters and never contacts Supabase.
