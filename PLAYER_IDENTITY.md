# RouletteChess Player Identity

RouletteChess separates the immutable internal UUID `PlayerId`, the human-readable display name, and the immutable public discriminator. Public identity is presented as `Yigit #19F1P`; `#19F1P` is not the PlayerId.

Discriminators contain exactly five uppercase `A-Z0-9` characters, are generated only by trusted PostgreSQL logic, and are globally unique. Allocation uses a transaction advisory lock, retries collisions, and retains a UNIQUE constraint as final authority. Values are never derived from UUID, email, Google identity, or display name.

Display names are mutable and non-unique for account players. Guest names use the system-owned `Guest####` convention; Guest callers cannot rename and account callers cannot choose case-insensitive `Guest####` names. Account rename resolves ownership through `auth.uid()` and never accepts a client-selected PlayerId or discriminator.

Allocated discriminators remain attached to retired/replaced PlayerIds and are never recycled. DATA-01C Keep Guest preserves the Guest PlayerId/discriminator; Keep Google preserves the Google PlayerId/discriminator.

`username_onboarding_required` is durable server state. New accounts require onboarding, and Guest profiles retaining a system name require onboarding after becoming account-owned. A successful authorized rename clears the flag. PROFILE-IDENTITY-01B will implement the onboarding and rename UX.

Cloud responses and the guarded local cache carry discriminator/onboarding state. Existing server values remain visible offline. Local-only fallback profiles use `null` and never fabricate an official discriminator.
