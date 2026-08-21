# Development Data Cleanup

This runbook describes the one-time, pre-production DEV-DATA-CLEANUP-01 reset. It is not a production Guest-retention policy and must never run from CI, Vercel, application startup, or the migration chain.

## Reviewed baseline

- Auth users: 97 total; 96 Anonymous Guests and one Google account.
- Players: 97 total; 83 active, 14 retired/replaced, 96 Guest-owned and one account-owned.
- Player data: 97 progression, 582 piece-statistic, 97 rating, 11 progression-operation, 28 bootstrap and 29 migration-intent rows.
- Multiplayer data: 14 lobbies, five matches, 12 active memberships, six private-join attempts, 68 lobby events and one match event. Four matches were stale-starting.
- Rating settlements: zero.

The 96 Guests were automation/development identities. The Yigit Google account and all retired migration-history PlayerIds are also intentionally disposable for this reset.

## Preserved architecture

Schemas, tables, columns, sequences, enums, indexes, constraints, FK definitions, triggers, RLS policies, grants, RPCs, trusted functions, migration history, Realtime and Supabase Auth/provider configuration remain unchanged.

## Manual execution order

1. Review `supabase/tests/dev_data_cleanup_01_inventory.sql` output.
2. Run `supabase/admin/development_data_reset.sql` once in the Supabase SQL Editor. Its exact reviewed-count assertions abort and roll back if the database changed.
3. In a trusted local shell, provide `SUPABASE_URL` and `SUPABASE_SECRET_KEY` without writing either value to the repository.
4. Delete Auth users with the supported Admin API:

   ```powershell
   node scripts/admin/delete-development-auth-users.mjs --confirm=DELETE-ALL-ROULETTECHESS-DEVELOPMENT-AUTH-USERS --expected-count=97
   ```

5. Run `supabase/tests/dev_data_cleanup_01_post_reset_verification.sql`. Every data count and orphan count must be zero; every schema/security preservation flag must be true.

Application data must be removed before Auth users because migration-intent Auth foreign keys use `RESTRICT`. The SQL deletion order is events/memberships, rating settlements, matches, lobbies, progression/migration history, player dependents, ownership, self-reference cleanup, and players. Auth deletion is intentionally separate because Supabase Admin API is safer than direct Auth-schema deletion.

## Fresh-account acceptance

Use a clean browser context for the primary Google test: sign in, verify a new PlayerId and five-character discriminator, complete mandatory username onboarding, confirm rating 1000 and XP 0, refresh, and confirm the same new profile restores. In a separate clean/incognito context choose Guest and verify a new Anonymous Auth user, Guest#### name, PlayerId/discriminator, rating 1000, XP 0, and disabled Guest rename.

Also open one old browser context once: stale local state must not restore the deleted PlayerId or assume the old HMORC discriminator. Before MULTIPLAYER-01D, verify zero stale matches/memberships/lobbies, then create and normally close one lobby and verify the baseline returns to zero.

## Results

The staged reset completed successfully:

- Application reset transaction: successful.
- Supabase Admin Auth cleanup: 97 deleted, zero failed, zero remaining.
- Post-reset data counts: all zero, including Auth users/identities, players, progression, ratings, migration history, multiplayer runtime/events and stale matches.
- Post-reset orphan inventory: all zero.
- Schema/security preservation: player schema, discriminator allocator, Auth bootstrap trigger, rating default, trusted player resolver, stale reconciliation and browser mutation denials all verified.

The stale-browser Google recreation acceptance passed after PROFILE-IDENTITY-01B-HF2: a new canonical PlayerId/discriminator was created, onboarding completed, UI and remote XP/games/statistics remained zero, no cross-PlayerId bootstrap occurred, rating remained 1000, and the multiplayer baseline remained fully zero. The developer accepted the previously successful clean-context Google/Guest behavior without repeating those checks after this reset. That specific post-reset repetition is therefore **NOT RETESTED**, not an independently observed new PASS. DEV-DATA-CLEANUP-01 is accepted complete on that explicit basis.

## PROFILE-IDENTITY-01B-HF2 targeted stale-browser reset

After the isolation bug contaminated the newly recreated Google account, use the targeted cleanup instead of repeating the global reset. It is pinned to the reviewed account fingerprint `0e392ad07ae9`, discriminator `9Z7VG`, username `Yigit`, XP `208`, three games and a cross-PlayerId bootstrap record. Any mismatch rolls the SQL transaction back.

1. Run `supabase/admin/reset_contaminated_profile_identity_01b_hf2_account.sql` in Supabase SQL Editor. The final row must report fingerprint `0e392ad07ae9` and `application_rows_remaining = 0`.
2. In a trusted local `cmd.exe`, provide the already configured server-only environment variables without saving them to the repository, then run:

   ```bat
   node scripts\admin\delete-contaminated-auth-user.mjs --confirm=DELETE-CONTAMINATED-ROULETTECHESS-AUTH-USER --expected-user-fingerprint=0e392ad07ae9
   ```

   Expected final output: `{"deleted":1,"targetRemaining":0}`. The command validates the RouletteChess project ref and requires exactly one matching permanent Google Auth user.
3. Run `supabase/tests/dev_data_cleanup_01_post_reset_verification.sql`. With the previously verified clean baseline, all data/orphan counts must remain zero and all schema/security preservation flags must remain true.
4. Keep the existing browser context and all local/session/site storage untouched. Sign in with the same Google account and complete stale-browser acceptance before any clean-context test.

The SQL removes only runtime rows involving the target PlayerId, its rating/migration/progression/profile rows, ownership and PlayerId. Auth deletion remains a separate supported Admin API operation. Neither step modifies schema, migrations, RLS, functions, RPCs, provider configuration, browser storage, or unrelated identities.
