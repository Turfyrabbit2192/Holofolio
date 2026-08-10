import sharp from "sharp";
import type { CenteringMeasurement } from "@pokedex-vault/shared";

interface Raster {
  data: Uint8Array;
  width: number;
  height: number;
}

async function toGrayscaleRaster(buffer: Buffer): Promise<Raster> {
  const { data, info } = await sharp(buffer).grayscale().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

const GRADIENT_THRESHOLD = 18;

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

/**
 * Scans inward from one end of a line of pixels for the first strong
 * intensity transition (the inner border edge), then linearly interpolates
 * between the last sub-threshold sample and the first over-threshold one to
 * localize the crossing to sub-pixel precision rather than snapping to
 * whichever whole pixel happened to trip the threshold first.
 */
function findFirstEdge(get: (i: number) => number, length: number, marginStart: number): { pos: number; found: boolean } {
  let prevGrad = 0;
  for (let i = marginStart + 2; i < length - marginStart - 2; i++) {
    const grad = Math.abs(get(i + 2) - get(i - 2));
    if (grad > GRADIENT_THRESHOLD) {
      const denom = grad - prevGrad || 1;
      const frac = clamp01((GRADIENT_THRESHOLD - prevGrad) / denom);
      return { pos: i - 1 + frac, found: true };
    }
    prevGrad = grad;
  }
  return { pos: length * 0.06, found: false }; // fallback: assume a typical thin border if no clear edge found
}

/** Mean of the middle values only, so a single stray sample (e.g. landing on an artwork edge instead of the card border) can't skew the measurement. */
function trimmedMean(values: number[]): number {
  if (values.length <= 2) return values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

/**
 * Measures the colored-border width on each side of a tightly-cropped card
 * image by scanning several sample lines near the center for the first
 * strong edge (the transition from the printed border into the inner
 * artwork/text panel), then reports opposite-side ratios the way graders
 * describe centering (e.g. 55/45).
 */
export interface CenteringDetail extends CenteringMeasurement {
  // False when too many of the sample scans couldn't find a clean border
  // transition and fell back to a guessed offset — a signal that this
  // measurement is less trustworthy than usual (e.g. a low-contrast border,
  // heavy glare, or a photo that isn't cropped tightly to the card).
  edgesConfident: boolean;
}

export async function measureCentering(buffer: Buffer): Promise<CenteringDetail> {
  const raster = await toGrayscaleRaster(buffer);
  const { data, width, height } = raster;
  const marginX = Math.max(2, Math.round(width * 0.01));
  const marginY = Math.max(2, Math.round(height * 0.01));

  const sampleRows = 9;
  const rowBand = Math.round(height * 0.15);
  const centerY = Math.round(height / 2);
  const leftVals: number[] = [];
  const rightVals: number[] = [];
  let foundCount = 0;
  let sampleCount = 0;
  for (let s = 0; s < sampleRows; s++) {
    const y = centerY - rowBand + Math.round((2 * rowBand * s) / (sampleRows - 1));
    if (y < 0 || y >= height) continue;
    const rowGet = (x: number) => data[y * width + x];
    const left = findFirstEdge(rowGet, width, marginX);
    const right = findFirstEdge((i) => rowGet(width - 1 - i), width, marginX);
    leftVals.push(left.pos);
    rightVals.push(right.pos);
    foundCount += (left.found ? 1 : 0) + (right.found ? 1 : 0);
    sampleCount += 2;
  }

  const sampleCols = 9;
  const colBand = Math.round(width * 0.15);
  const centerX = Math.round(width / 2);
  const topVals: number[] = [];
  const bottomVals: number[] = [];
  for (let s = 0; s < sampleCols; s++) {
    const x = centerX - colBand + Math.round((2 * colBand * s) / (sampleCols - 1));
    if (x < 0 || x >= width) continue;
    const colGet = (y: number) => data[y * width + x];
    const top = findFirstEdge(colGet, height, marginY);
    const bottom = findFirstEdge((i) => colGet(height - 1 - i), height, marginY);
    topVals.push(top.pos);
    bottomVals.push(bottom.pos);
    foundCount += (top.found ? 1 : 0) + (bottom.found ? 1 : 0);
    sampleCount += 2;
  }

  const left = trimmedMean(leftVals);
  const right = trimmedMean(rightVals);
  const top = trimmedMean(topVals);
  const bottom = trimmedMean(bottomVals);
  const edgesConfident = sampleCount > 0 && foundCount / sampleCount >= 0.7;

  const lrTotal = left + right || 1;
  const tbTotal = top + bottom || 1;

  const leftPct = Math.round((left / lrTotal) * 1000) / 10;
  const topPct = Math.round((top / tbTotal) * 1000) / 10;

  return {
    top: Math.round(top),
    bottom: Math.round(bottom),
    left: Math.round(left),
    right: Math.round(right),
    leftRightRatio: [leftPct, Math.round((100 - leftPct) * 10) / 10],
    topBottomRatio: [topPct, Math.round((100 - topPct) * 10) / 10],
    edgesConfident,
  };
}

/** Converts a centering measurement into a 1-10 subgrade using roughly PSA-style tolerance bands. */
export function centeringToSubgrade(m: CenteringMeasurement): number {
  const worstOffset = Math.max(
    Math.abs(m.leftRightRatio[0] - 50),
    Math.abs(m.topBottomRatio[0] - 50)
  );
  // worstOffset 0 -> 50/50 perfect. Map offset bands to a 1-10 scale.
  if (worstOffset <= 2.5) return 10; // ~52.5/47.5 or better
  if (worstOffset <= 5) return 9.5; // 55/45
  if (worstOffset <= 7.5) return 9; // 57.5/42.5
  if (worstOffset <= 10) return 8.5; // 60/40
  if (worstOffset <= 12.5) return 8;
  if (worstOffset <= 15) return 7;
  if (worstOffset <= 17.5) return 6;
  if (worstOffset <= 20) return 5;
  if (worstOffset <= 25) return 4;
  if (worstOffset <= 30) return 3;
  if (worstOffset <= 35) return 2;
  return 1;
}
