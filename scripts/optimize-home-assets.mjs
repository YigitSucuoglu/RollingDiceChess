import sharp from "sharp";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const outputRoot = path.join(root, "src", "assets", "home");
const reportRoot = path.join(root, ".performance", "home-assets");
const assets = [
  { name: "machine", source: "src/assets/slot-machine/generated/update-machine-transparent.png", widths: [624, 1248], mobileWidth: 768 },
  { name: "lever", source: "src/assets/slot-machine/generated/update-lever-transparent.png", widths: [112, 224] },
  { name: "white-queen", source: "src/assets/pieces/gold/white-queen.png", widths: [160, 320] },
  { name: "black-knight", source: "src/assets/pieces/gold/black-knight.png", widths: [160, 320] },
  { name: "white-king", source: "src/assets/pieces/gold/white-king.png", widths: [160, 320] },
];

function quality(reference, candidate, channels) {
  let squaredDifference = 0; let alphaDifference = 0; let visibleChannels = 0; let changedPixels = 0;
  const referenceLuma = []; const candidateLuma = [];
  for (let index = 0; index < reference.length; index += channels) {
    const alpha = channels === 4 ? reference[index + 3] / 255 : 1;
    if (channels === 4) alphaDifference += Math.abs(reference[index + 3] - candidate[index + 3]);
    if (alpha === 0) continue;
    let pixelChanged = false;
    for (let channel = 0; channel < Math.min(3, channels); channel++) {
      const difference = reference[index + channel] - candidate[index + channel];
      squaredDifference += (difference * alpha) ** 2; visibleChannels++;
      if (Math.abs(difference * alpha) > 12) pixelChanged = true;
    }
    if (pixelChanged) changedPixels++;
    referenceLuma.push((0.2126 * reference[index] + 0.7152 * reference[index + 1] + 0.0722 * reference[index + 2]) * alpha);
    candidateLuma.push((0.2126 * candidate[index] + 0.7152 * candidate[index + 1] + 0.0722 * candidate[index + 2]) * alpha);
  }
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const referenceMean = mean(referenceLuma); const candidateMean = mean(candidateLuma);
  let referenceVariance = 0; let candidateVariance = 0; let covariance = 0;
  for (let index = 0; index < referenceLuma.length; index++) {
    const referenceDelta = referenceLuma[index] - referenceMean; const candidateDelta = candidateLuma[index] - candidateMean;
    referenceVariance += referenceDelta ** 2; candidateVariance += candidateDelta ** 2; covariance += referenceDelta * candidateDelta;
  }
  referenceVariance /= referenceLuma.length; candidateVariance /= referenceLuma.length; covariance /= referenceLuma.length;
  const c1 = (0.01 * 255) ** 2; const c2 = (0.03 * 255) ** 2;
  const ssim = ((2 * referenceMean * candidateMean + c1) * (2 * covariance + c2)) / ((referenceMean ** 2 + candidateMean ** 2 + c1) * (referenceVariance + candidateVariance + c2));
  const mse = squaredDifference / visibleChannels;
  return { mse, psnr: mse === 0 ? null : 10 * Math.log10((255 * 255) / mse), ssim, changedPixelPercentage: changedPixels / referenceLuma.length * 100, meanAlphaDifference: channels === 4 ? alphaDifference / (reference.length / 4) : 0 };
}

await mkdir(outputRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });
const results = [];
for (const asset of assets) {
  const sourcePath = path.join(root, asset.source);
  const metadata = await sharp(sourcePath).metadata();
  const trimmed = await sharp(sourcePath).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer({ resolveWithObject: true });
  const variants = [];
  for (const [index, width] of asset.widths.entries()) {
    const density = index + 1;
    const webpPath = path.join(outputRoot, `${asset.name}-${density}x.webp`);
    await sharp(sourcePath).resize({ width, kernel: "lanczos3" }).webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(webpPath);
    const reference = await sharp(sourcePath).resize({ width, kernel: "lanczos3" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const candidate = await sharp(webpPath).ensureAlpha().raw().toBuffer();
    variants.push({ density, width, height: reference.info.height, bytes: (await stat(webpPath)).size, ...quality(reference.data, candidate, reference.info.channels) });
  }
  if (asset.mobileWidth) {
    await sharp(sourcePath).resize({ width: asset.mobileWidth, kernel: "lanczos3" }).webp({ quality: 90, alphaQuality: 100, effort: 6, smartSubsample: true }).toFile(path.join(outputRoot, `${asset.name}-mobile.webp`));
  }
  const fallbackPath = path.join(outputRoot, `${asset.name}-fallback.png`);
  await sharp(sourcePath).resize({ width: asset.widths[0], kernel: "lanczos3" }).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(fallbackPath);
  results.push({ name: asset.name, source: asset.source, sourceBytes: (await stat(sourcePath)).size, canvas: { width: metadata.width, height: metadata.height }, alphaBounds: { width: trimmed.info.width, height: trimmed.info.height, left: -trimmed.info.trimOffsetLeft, top: -trimmed.info.trimOffsetTop, right: metadata.width - trimmed.info.width + trimmed.info.trimOffsetLeft, bottom: metadata.height - trimmed.info.height + trimmed.info.trimOffsetTop }, fallbackBytes: (await stat(fallbackPath)).size, variants });
}
await writeFile(path.join(reportRoot, "asset-report.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), format: "WebP quality 90 / alpha 100", results }, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));
