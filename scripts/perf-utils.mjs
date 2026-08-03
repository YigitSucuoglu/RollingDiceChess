import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const PERF_ROOT = new URL("../.performance/", import.meta.url);

export async function writeReports(folder, name, data, markdown) {
  const directory = new URL(`${folder}/`, PERF_ROOT);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL(`${name}.json`, directory), `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(new URL(`${name}.md`, directory), markdown);
}

export function percentile(sorted, fraction) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length;
  return { min: sorted[0], max: sorted.at(-1), average, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), standardDeviation: Math.sqrt(variance) };
}

export async function startPreview() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteCli, "preview", "--host", "127.0.0.1"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite preview exited early:\n${output}`);
    try {
      const response = await fetch("http://127.0.0.1:4173/");
      if (response.ok) return child;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`Vite preview did not become ready:\n${output}`);
}

export function stopPreview(child) {
  child.kill();
}
