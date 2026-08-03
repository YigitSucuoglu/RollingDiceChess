import { brotliCompressSync, gzipSync } from "node:zlib";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { writeReports } from "./perf-utils.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const dist = path.join(root, "dist");
const assetsRoot = path.join(root, "src", "assets");
const categories = { html: [".html"], js: [".js"], css: [".css"], image: [".png", ".jpg", ".jpeg", ".webp", ".ico"], svg: [".svg"], font: [".woff", ".woff2", ".ttf", ".otf"] };

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(target) : [target];
  }))).flat();
}

function category(file) {
  const extension = path.extname(file).toLowerCase();
  return Object.entries(categories).find(([, extensions]) => extensions.includes(extension))?.[0] ?? "other";
}

async function metrics(file, base) {
  const buffer = await readFile(file);
  return { file: path.relative(base, file).replaceAll("\\", "/"), category: category(file), raw: buffer.length, gzip: gzipSync(buffer, { level: 9 }).length, brotli: brotliCompressSync(buffer).length };
}

const output = await Promise.all((await filesUnder(dist)).map((file) => metrics(file, dist)));
const sources = await Promise.all((await filesUnder(assetsRoot)).map(async (file) => ({ file: path.relative(root, file).replaceAll("\\", "/"), bytes: (await stat(file)).size })));
const totals = output.reduce((result, item) => {
  const bucket = result[item.category] ??= { files: 0, raw: 0, gzip: 0, brotli: 0 };
  bucket.files++; bucket.raw += item.raw; bucket.gzip += item.gzip; bucket.brotli += item.brotli;
  return result;
}, {});
const total = output.reduce((sum, item) => ({ files: sum.files + 1, raw: sum.raw + item.raw, gzip: sum.gzip + item.gzip, brotli: sum.brotli + item.brotli }), { files: 0, raw: 0, gzip: 0, brotli: 0 });
const largestOutput = [...output].sort((a, b) => b.raw - a.raw).slice(0, 20);
const largestSources = [...sources].sort((a, b) => b.bytes - a.bytes).slice(0, 20);
const report = { generatedAt: new Date().toISOString(), total, categories: totals, largestOutput, largestSources, sourceMaps: output.some((item) => item.file.endsWith(".map")), jsChunks: output.filter((item) => item.category === "js").length };
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
const markdown = `# Bundle performance report\n\nGenerated: ${report.generatedAt}\n\n| Scope | Files | Raw | Gzip | Brotli |\n|---|---:|---:|---:|---:|\n| Total | ${total.files} | ${format(total.raw)} | ${format(total.gzip)} | ${format(total.brotli)} |\n${Object.entries(totals).map(([name, value]) => `| ${name} | ${value.files} | ${format(value.raw)} | ${format(value.gzip)} | ${format(value.brotli)} |`).join("\n")}\n\n## Largest output\n\n${largestOutput.map((item) => `- ${item.file}: ${format(item.raw)} raw / ${format(item.gzip)} gzip`).join("\n")}\n\n## Largest source assets\n\n${largestSources.map((item) => `- ${item.file}: ${format(item.bytes)}`).join("\n")}\n`;
await writeReports("bundle", "bundle-report", report, markdown);
console.log(markdown);
