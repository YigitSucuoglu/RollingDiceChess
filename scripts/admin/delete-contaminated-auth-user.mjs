import { createHash } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "DELETE-CONTAMINATED-ROULETTECHESS-AUTH-USER";
const EXPECTED_PROJECT_REF = "kbtnnknsgobfvyydxbex";
const PAGE_SIZE = 1000;

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

async function listAllUsers(client) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`Auth inventory failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < PAGE_SIZE) return users;
  }
}

const url = process.env.SUPABASE_URL?.trim();
const secret = process.env.SUPABASE_SECRET_KEY?.trim();
const confirmation = option("confirm");
const expectedFingerprint = option("expected-user-fingerprint");
const inspectOnly = option("inspect-only") === "true";

if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const parsedUrl = new URL(url);
const projectRef = parsedUrl.hostname.split(".")[0];
if (projectRef !== EXPECTED_PROJECT_REF) {
  throw new Error(`Refusing unexpected Supabase project: ${fingerprint(parsedUrl.hostname)}`);
}
if (confirmation !== CONFIRMATION || expectedFingerprint !== "0e392ad07ae9") {
  throw new Error(
    `Explicit confirmation required: --confirm=${CONFIRMATION} `
      + "--expected-user-fingerprint=0e392ad07ae9",
  );
}

const client = createClient(url, secret, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const users = await listAllUsers(client);
const candidates = users.filter((user) => fingerprint(user.id) === expectedFingerprint);
if (candidates.length !== 1) {
  throw new Error(`Expected one matching Auth user, found ${candidates.length}. Nothing was deleted.`);
}
const [target] = candidates;
const identityProviders = [...new Set(
  target.identities?.map((identity) => identity.provider).filter(Boolean) ?? [],
)].sort();
const metadataProviders = Array.isArray(target.app_metadata?.providers)
  ? target.app_metadata.providers.filter((provider) => typeof provider === "string").sort()
  : [];
const googleIdentities = identityProviders.filter((provider) => provider === "google");
const googleProviderConfirmed = googleIdentities.length > 0
  || (target.app_metadata?.provider === "google" && metadataProviders.includes("google"));
console.log(JSON.stringify({
  projectFingerprint: fingerprint(parsedUrl.hostname),
  targetFingerprint: fingerprint(target.id),
  anonymous: target.is_anonymous === true,
  identityProviders,
  appProvider: typeof target.app_metadata?.provider === "string"
    ? target.app_metadata.provider
    : null,
  metadataProviders,
  inspectOnly,
}));
if (!inspectOnly) {
  if (target.is_anonymous === true || !googleProviderConfirmed) {
    throw new Error("Matching Auth user is not the expected permanent Google account. Nothing was deleted.");
  }

  const { error } = await client.auth.admin.deleteUser(target.id);
  if (error) throw new Error(`Target Auth deletion failed: ${error.message}`);

  const remaining = (await listAllUsers(client))
    .filter((user) => fingerprint(user.id) === expectedFingerprint).length;
  console.log(JSON.stringify({ deleted: 1, targetRemaining: remaining }));
  if (remaining !== 0) throw new Error("Target Auth user still exists after deletion.");
}
