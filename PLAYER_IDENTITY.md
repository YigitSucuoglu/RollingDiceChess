# RouletteChess Player Identity

RouletteChess separates the immutable internal UUID `PlayerId`, the human-readable display name, and the immutable public discriminator. Public identity is presented as `Yigit #19F1P`; `#19F1P` is not the PlayerId.

Discriminators contain exactly five uppercase `A-Z0-9` characters, are generated only by trusted PostgreSQL logic, and are globally unique. Allocation uses a transaction advisory lock, retries collisions, and retains a UNIQUE constraint as final authority. Values are never derived from UUID, email, Google identity, or display name.

Display names are mutable and non-unique for account players. Guest names use the system-owned `Guest####` convention; Guest callers cannot rename and account callers cannot choose case-insensitive `Guest####` names. Account rename resolves ownership through `auth.uid()` and never accepts a client-selected PlayerId or discriminator.

Allocated discriminators remain attached to retired/replaced PlayerIds and are never recycled. DATA-01C Keep Guest preserves the Guest PlayerId/discriminator; Keep Google preserves the Google PlayerId/discriminator.

`username_onboarding_required` is durable server state. New accounts require onboarding, and Guest profiles retaining a system name require onboarding after becoming account-owned. The application blocks every normal route until an authenticated canonical profile with this flag completes the mandatory username form. Refresh, direct navigation and restored sessions cannot skip it; Sign Out remains the recovery path.

Onboarding and later Profile rename share the narrow `rename_current_player(requested_name)` RPC. The browser supplies only the requested name. PostgreSQL resolves `auth.uid()` to the owned UUID PlayerId, validates the non-unique account name, changes `display_name`, and clears onboarding in one transaction. A subsequent canonical profile read refreshes the guarded cache. UUID PlayerId, discriminator, progression, statistics, rating and ownership are not rename inputs and do not change.

There is no Skip/Maybe Later action. Account users may rename from Profile; Guest and local-only users receive no active rename action. The `Guest####` namespace remains case-insensitively reserved for system-owned Guest names.

Cloud responses and the guarded local cache carry discriminator/onboarding state. Existing server values remain visible offline. Local-only fallback profiles use `null` and never fabricate an official discriminator.
