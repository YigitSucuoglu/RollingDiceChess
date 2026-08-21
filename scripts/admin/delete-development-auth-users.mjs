import { createHash } from "node:crypto";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

const CONFIRMATION = "DELETE-ALL-ROULETTECHESS-DEVELOPMENT-AUTH-USERS";
const EXPECTED_PROJECT_REF = "kbtnnknsgobfvyydxbex";
const PAGE_SIZE = 1000;

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
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
const expectedCount = Number(option("expected-count"));

if (!url || !secret) throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const parsedUrl = new URL(url);
const projectRef = parsedUrl.hostname.split(".")[0];
if (projectRef !== EXPECTED_PROJECT_REF) {
  throw new Error(`Refusing unexpected Supabase project: ${fingerprint(parsedUrl.hostname)}`);
}
if (confirmation !== CONFIRMATION || !Number.isSafeInteger(expectedCount) || expectedCount < 0) {
  throw new Error(
    `Explicit confirmation required: --confirm=${CONFIRMATION} --expected-count=<current-count>`,
  );
}

const client = createClient(url, secret, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});
const users = await listAllUsers(client);
const anonymousCount = users.filter((user) => user.is_anonymous === true).length;
const permanentCount = users.length - anonymousCount;
const googleIdentityCount = users.reduce((count, user) => count
  + (user.identities?.filter((identity) => identity.provider === "google").length ?? 0), 0);

console.log(JSON.stringify({
  projectFingerprint: fingerprint(parsedUrl.hostname),
  candidates: users.length,
  anonymous: anonymousCount,
  permanent: permanentCount,
  googleIdentities: googleIdentityCount,
}));
if (users.length !== expectedCount) {
  throw new Error(`Auth count changed: expected ${expectedCount}, found ${users.length}. Nothing was deleted.`);
}

let deleted = 0;
const failures = [];
for (const user of users) {
  const { error } = await client.auth.admin.deleteUser(user.id);
  if (error) failures.push({ userFingerprint: fingerprint(user.id), reason: error.message });
  else deleted += 1;
}

const remaining = await listAllUsers(client);
console.log(JSON.stringify({ deleted, failed: failures.length, remaining: remaining.length }));
if (failures.length > 0 || remaining.length > 0) {
  for (const failure of failures) console.error(JSON.stringify(failure));
  throw new Error("Auth cleanup was incomplete. Review failures and rerun with the new exact expected count.");
}
