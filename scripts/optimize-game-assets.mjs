import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const goldSourceRoot = path.join(root, "src", "assets", "pieces", "gold");
const goldOutputRoot = path.join(root, "src", "assets", "pieces", "gold-runtime");
const slotSourceRoot = path.join(root, "src", "assets", "slot-machine", "generated");
const slotOutputRoot = path.join(root, "src", "assets", "slot-machine", "runtime");
const reportRoot = path.join(root, ".performance", "game-assets");

const pieceNames = ["bishop", "king", "knight", "pawn", "queen", "rook"];
const colors = ["black", "white"];
const profiles = [
  ...colors.flatMap((color) => pieceNames.map((piece) => ({
    name: `${color}-${piece}`,
    source: path.join(goldSourceRoot, `${color}-${piece}.png`),
    output: path.join(goldOutputRoot, `${color}-${piece}.webp`),
    width: 256,
  }))),
  {
    name: "game-machine",
    source: path.join(slotSourceRoot, "update-machine-game-trimmed.png"),
    output: path.join(slotOutputRoot, "game-machine.webp"),
    width: 704,
  },
  {
    height: 256,
    name: "game-lever",
    source: path.join(slotSourceRoot, "update-lever-game-trimmed.png"),
    output: path.join(slotOutputRoot, "game-lever.webp"),
  },
];

function calculateQuality(reference, candidate, channels) {
  let squaredError = 0;
  let comparedChannels = 0;
  let alphaError = 0;
  const referenceLuma = [];
  const candidateLuma = [];

  for (let index = 0; index < reference.length; index += channels) {
    const alpha = channels === 4 ? reference[index + 3] / 255 : 1;
    if (channels === 4) alphaError += Math.abs(reference[index + 3] - candidate[index + 3]);
    if (alpha === 0) continue;

    for (let channel = 0; channel < 3; channel += 1) {
      const difference = (reference[index + channel] - candidate[index + channel]) * alpha;
      squaredError += difference ** 2;
      comparedChannels += 1;
    }

    referenceLuma.push((0.2126 * reference[index] + 0.7152 * reference[index + 1] + 0.0722 * reference[index + 2]) * alpha);
    candidateLuma.push((0.2126 * candidate[index] + 0.7152 * candidate[index + 1] + 0.0722 * candidate[index + 2]) * alpha);
  }

  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const referenceMean = mean(referenceLuma);
  const candidateMean = mean(candidateLuma);
  let referenceVariance = 0;
  let candidateVariance = 0;
  let covariance = 0;

  for (let index = 0; index < referenceLuma.length; index += 1) {
    const referenceDelta = referenceLuma[index] - referenceMean;
    const candidateDelta = candidateLuma[index] - candidateMean;
    referenceVariance += referenceDelta ** 2;
    candidateVariance += candidateDelta ** 2;
    covariance += referenceDelta * candidateDelta;
  }

  referenceVariance /= referenceLuma.length;
  candidateVariance /= referenceLuma.length;
  covariance /= referenceLuma.length;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const mse = squaredError / comparedChannels;

  return {
    meanAlphaDifference: alphaError / (reference.length / channels),
    psnr: 10 * Math.log10((255 ** 2) / mse),
    ssim: ((2 * referenceMean * candidateMean + c1) * (2 * covariance + c2)) /
      ((referenceMean ** 2 + candidateMean ** 2 + c1) * (referenceVariance + candidateVariance + c2)),
  };
}

await Promise.all([goldOutputRoot, slotOutputRoot, reportRoot].map((directory) => fs.mkdir(directory, { recursive: true })));
const results = [];

for (const profile of profiles) {
  const resize = profile.width ? { width: profile.width } : { height: profile.height };
  await sharp(profile.source)
    .resize({ ...resize, fit: "inside", kernel: "lanczos3", withoutEnlargement: true })
    .webp({ alphaQuality: 100, effort: 6, quality: 92, smartSubsample: true })
    .toFile(profile.output);

  const reference = await sharp(profile.source).resize({ ...resize, fit: "inside", kernel: "lanczos3", withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const candidate = await sharp(profile.output).ensureAlpha().raw().toBuffer();
  const sourceMetadata = await sharp(profile.source).metadata();
  const outputMetadata = await sharp(profile.output).metadata();
  const sourceBytes = (await fs.stat(profile.source)).size;
  const outputBytes = (await fs.stat(profile.output)).size;

  results.push({
    name: profile.name,
    output: path.relative(root, profile.output).replaceAll("\\", "/"),
    outputBytes,
    outputDimensions: `${outputMetadata.width}x${outputMetadata.height}`,
    reductionPercent: (1 - outputBytes / sourceBytes) * 100,
    source: path.relative(root, profile.source).replaceAll("\\", "/"),
    sourceBytes,
    sourceDimensions: `${sourceMetadata.width}x${sourceMetadata.height}`,
    ...calculateQuality(reference.data, candidate, reference.info.channels),
  });
}

await fs.writeFile(path.join(reportRoot, "asset-report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), profiles: results }, null, 2)}\n`);
console.table(results.map(({ name, outputBytes, reductionPercent, psnr, ssim }) => ({ name, outputBytes, reductionPercent: reductionPercent.toFixed(1), psnr: psnr.toFixed(2), ssim: ssim.toFixed(5) })));
