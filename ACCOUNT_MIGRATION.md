# Guest-to-Google Account Migration

## Identity rule

RouletteChess identity is the UUID `PlayerId`. Google authenticates an account; it is not the player identity. Display names remain mutable and non-unique.

Each PlayerId owns one immutable public discriminator. No-conflict linking and Keep Guest preserve the Guest discriminator; Keep Google preserves the Google discriminator. Retired losing PlayerIds retain their historical discriminator. A surviving system-named Guest enters username-onboarding-required state when it becomes account-owned.

## Runtime flow

1. A cloud Guest flushes every acknowledged/pending DATA-01B progression operation.
2. `create_guest_upgrade_intent` creates an expiring, one-time handoff whose plaintext token is returned only to the current Guest. The database stores only its SHA-256 digest.
3. The browser stores the token and a two-value continuation phase in session storage, then calls Supabase `linkIdentity({ provider: "google" })`.
4. If Google has no prior Supabase identity, the Supabase Auth user remains the same. `complete_linked_guest_upgrade` changes only ownership kind; the Guest PlayerId, progression, display name, and rating survive unchanged.
5. If Google already belongs to another Supabase account, the app signs into that existing account and calls `inspect_profile_conflict`. The server returns only the two minimal profile summaries.
6. The user explicitly selects Guest or Google progression. `resolve_profile_conflict` transactionally keeps the selected PlayerId active and marks the other retired/replaced. Statistics, XP, and rating are never added or averaged.
7. After server confirmation, `PlayerSyncCoordinator` fetches the current cloud profile, verifies its PlayerId against the returned survivor, and explicitly adopts that snapshot in both sync state and the local cache before progression recording resumes.
8. If that survivor's canonical `username_onboarding_required` is true, the application immediately replaces normal routing with mandatory username onboarding. Keep Guest/no-conflict linking therefore preserves the Guest UUID, discriminator, XP/statistics and rating while requiring a non-Guest account name. Keep Google skips the form only when the surviving Google profile's canonical flag is already false.

The DATA-01B local/cloud conflict must be resolved before account migration starts. Local-only fallback Guests cannot migrate until a cloud Guest identity is established. Linking requires connectivity; offline gameplay and pending progression remain available. Progression-producing profile updates are suspended from OAuth handoff until canonical adoption completes, preventing an ambiguous or retired PlayerId from receiving new local operations.

Local storage never authorizes this transfer. A PlayerId mismatch during ordinary authenticated initialization cannot bootstrap one profile into another, even when the target cloud profile is empty. Only the migration intent/handoff and its server-validated resolution can authorize a Guest-to-Google PlayerId transition.

## Retry and security

Migration intents are expiry-aware, ownership-bound, and additionally bound to the permanent account on first inspection. Same-decision replay returns the same survivor; contradictory replay and another account's token are rejected. Browser roles cannot update ownership, intents, profiles, or ratings directly.

The continuation contains no OAuth token or Supabase session. Supabase owns OAuth callback/session persistence. No email, Google profile metadata, AccountId, PlayerId, migration token, or progression payload is sent to observability.

An unresolved conflict is not presented as a completed account connection. Normal Sign Out and Play actions are withheld on the Profile page until the user chooses. Leaving the page does not choose, merge, retire, unlink, or clear the continuation; returning to Profile resumes the same conflict. There is intentionally no destructive Cancel action.

## Recovery semantics

After linking, sign-out does not delete either cloud data or the canonical PlayerId. Signing in with the same Google account on another browser resolves to that canonical profile. Clearing browser data therefore no longer orphans the linked profile.

PROFILE-IDENTITY-01B-HF1 makes interrupted conflicts convergent. The 15-minute handoff expiry still rejects an unbound token, but it no longer makes a conflict permanently unrecoverable after the server has bound it to the authenticated account (or verified the exact linked Guest auth owner). Startup and Retry restore the Supabase session, inspect the server migration, and then restore the unresolved choice UI, adopt an already-resolved survivor, discard continuation metadata proven to belong to another account, or report a genuine infrastructure failure.

The continuation records its source and target auth-user binding plus the first requested resolution. A different auth user cannot inherit it and a contradictory retry is rejected. Sign Out clears only browser continuation/migration state; it does not modify the server intent or either profile. PlayerSync detaches pending operations from the signed-out PlayerId instead of applying them to a new session.

## Required remote configuration

Supabase Dashboard → Authentication → Providers → Manual Linking must be enabled. Redirect URLs remain governed by the existing localhost, production, and approved preview allowlist.

Apply `supabase/migrations/202608170001_data_01c_account_migration.sql`, then run `supabase/tests/data_01c_schema_verification.sql` in SQL Editor before considering DATA-01C complete.

PROFILE-IDENTITY-01B-HF1 migration `202608180002_profile_identity_01b_hf1_migration_recovery.sql` is **APPLIED**. Its schema verification completed with all three privilege/recovery assertions returning `true`.

Real Google OAuth and destructive conflict choices must be verified manually with disposable profiles. Automated normal E2E uses deterministic adapters and never contacts Supabase.
