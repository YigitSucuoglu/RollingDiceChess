const fs = require("node:fs");
const path = require("node:path");

const resources = ["en", "tr"].map((language) => ({
  language,
  value: JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "i18n", "resources", `${language}.json`), "utf8")),
}));

function flatten(value, prefix = "", output = new Map()) {
  if (Array.isArray(value)) {
    if (value.length === 0) throw new Error(`Empty translation array: ${prefix}`);
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, output));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) flatten(item, prefix ? `${prefix}.${key}` : key, output);
  } else {
    if (typeof value !== "string" || value.trim() === "") throw new Error(`Invalid translation: ${prefix}`);
    output.set(prefix, typeof value);
  }
  return output;
}

const reference = flatten(resources[0].value);
for (const resource of resources.slice(1)) {
  const candidate = flatten(resource.value);
  const missing = [...reference.keys()].filter((key) => !candidate.has(key));
  const extra = [...candidate.keys()].filter((key) => !reference.has(key));
  if (missing.length || extra.length) throw new Error(`${resource.language} parity failed\nMissing: ${missing.join(", ")}\nExtra: ${extra.join(", ")}`);
}
console.log(`i18n resource parity passed: ${reference.size} leaf values across ${resources.length} locales`);
