# RouletteChess Player Data Model

## Deployment status

`supabase/migrations/202608130001_auth_01c_player_identity.sql`: **NOT APPLIED**.

The repository contains the migration contract, but this task had no authenticated Supabase project access. Cloud persistence, rename, anonymous Guest creation and conflict resolution must not be presented as live until DATA-01 applies and validates it remotely.

## Identity and ownership

`player_id` is the permanent RouletteChess identity. It is distinct from `AccountId`, Supabase `auth.users.id`, Google identity and `display_name`. A rename changes only `display_name`; progression, rating and future match history continue to reference `player_id`.

Supabase Anonymous Auth is the selected cloud Guest strategy. It supplies a server-recognized `auth.uid()` for RLS without email/password. Identity linking can preserve the same auth user and PlayerId. If browser auth storage is cleared, an unlinked Guest may become unrecoverable. A Google identity already owned by another auth user requires a short-lived server-recorded handoff and explicit conflict choice.

The shipped Guest flow remains local until the migration is applied and Anonymous Sign-Ins/manual identity linking are enabled and verified. This preserves offline play and avoids claiming undeployed cloud storage.

## Persisted model

- `players`: PlayerId, non-unique display name, ownership kind and lifecycle.
- `player_auth_owners`: one auth user to one active PlayerId association.
- `player_progression`: client-originated casual XP and aggregate statistics.
- `player_piece_statistics`: normalized per-piece counters.
- `player_ratings`: separate rating default `1000`; browser roles receive no UPDATE path.
- `local_profile_bootstraps`: schema-versioned bootstrap idempotency ledger.
- `player_migration_intents`: expiring hashed handoff and auditable outcome.

Local `PlayerProfile.playerId` is a source-record identifier, not cloud PlayerId. Display name, XP and statistics are bootstrap inputs. `processedMatchIds` stays local cache/idempotency data. Language, sound, themes and setup preferences remain settings, outside identity.

## Trust and migration boundaries

Singleplayer bot-game XP/statistics are client-originated casual progression. Bot games never change multiplayer rating. Future RATING-01 owns an authoritative ranked-match update path.

RLS exposes only the current owner's private rows. Rename and one-time bootstrap use narrow RPCs. Conflict resolution locks its records and is all-or-nothing/idempotent:

- `USE_GOOGLE_PROFILE`: Google PlayerId survives; Guest PlayerId retires. Values are not added.
- `USE_GUEST_PROFILE`: Guest PlayerId survives; Google ownership moves to it and the previous Google PlayerId retires. Values are not added.

Names are non-unique and never authorization data. Basic length/control/HTML-delimiter validation is applied; moderation and reserved names are deferred.

```text
Supabase Auth session != cloud player rows != local PlayerProfile != settings
```

The local profile remains after bootstrap for recovery. No token, email, provider metadata or raw database row enters player DTOs, MatchSnapshot, local profile storage or Sentry context.

## DATA-01 deployment checklist

1. Review/apply the migration in a non-production Supabase branch/project.
2. Enable Anonymous Sign-Ins and manual identity linking.
3. Verify trigger-created players, rating 1000 and six piece-stat rows.
4. Test RLS as two auth users; cross-player access and direct rating/ownership writes must fail.
5. Verify bootstrap replay, local recovery, same-user Google linking and both conflict choices.
6. Verify concurrent/opposite conflict retries.
7. Only then connect infrastructure/UI and mark remote status **APPLIED**.

Future history references PlayerId, not name. Guests and Google-linked users may both later appear on a rating leaderboard. Multiplayer, RATING-01 and LEADERBOARD-01 are out of scope.
