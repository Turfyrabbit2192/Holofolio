import sharp from "sharp";
import type { CardZone, DefectFinding } from "@pokedex-vault/shared";

interface Raster {
  data: Uint8Array;
  width: number;
  height: number;
}

async function toGrayscaleRaster(buffer: Buffer, maxDim = 700): Promise<Raster> {
  const { data, info } = await sharp(buffer)
    .resize({ width: maxDim, height: maxDim, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Pixels this close to full saturation are far more likely to be a camera
// flash hotspot or glare off glossy/holo card stock than genuine cardstock
// whitening, which rarely reads this bright even in good light. Treating
// them as "unreadable" instead of "bright" keeps glare from masquerading as
// wear on the very cards (holo foils) where this matters most.
const SATURATION_CEILING = 250;

const CORNER_DEFS: { zone: CardZone; ox: "l" | "r"; oy: "t" | "b" }[] = [
  { zone: "corner_top_left", ox: "l", oy: "t" },
  { zone: "corner_top_right", ox: "r", oy: "t" },
  { zone: "corner_bottom_left", ox: "l", oy: "b" },
  { zone: "corner_bottom_right", ox: "r", oy: "b" },
];

/** Whitening/chipping ratio: fraction of unusually bright pixels within a small corner patch relative to the patch median (whitening shows as pale flecks against the printed border color). */
function patchWhiteningRatio(raster: Raster, x0: number, y0: number, w: number, h: number): number {
  const { data, width, height } = raster;
  const values: number[] = [];
  for (let y = y0; y < y0 + h && y < height; y++) {
    for (let x = x0; x < x0 + w && x < width; x++) {
      if (x < 0 || y < 0) continue;
      values.push(data[y * width + x]);
    }
  }
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const brightThreshold = median + 45;
  const readable = values.filter((v) => v < SATURATION_CEILING);
  if (readable.length === 0) return 0;
  const bright = readable.filter((v) => v > brightThreshold).length;
  return bright / readable.length;
}

function whiteningToScore(ratio: number): number {
  if (ratio < 0.015) return 10;
  if (ratio < 0.03) return 9.5;
  if (ratio < 0.05) return 9;
  if (ratio < 0.08) return 8.5;
  if (ratio < 0.12) return 8;
  if (ratio < 0.16) return 7;
  if (ratio < 0.22) return 6;
  if (ratio < 0.3) return 5;
  if (ratio < 0.4) return 4;
  return 3;
}

// Even a crop that's tight to the card can leave a sliver of background,
// compression softening, or anti-aliasing right at its own cut line — pixels
// wide at most, but corner/edge sampling starts right at that boundary, so
// without a small buffer those crop artifacts (not the card) can read as
// whitening/wear. This skips just past them while still sampling the card's
// real corner/edge, which starts a few pixels further in.
const BOUNDARY_SAFETY_INSET_RATIO = 0.015;

export async function analyzeCorners(buffer: Buffer, side: "front" | "back") {
  const raster = await toGrayscaleRaster(buffer);
  const { width, height } = raster;
  const patchSize = Math.max(10, Math.round(Math.min(width, height) * 0.07));
  const safety = Math.round(Math.min(width, height) * BOUNDARY_SAFETY_INSET_RATIO);

  const findings: DefectFinding[] = [];
  const scores: number[] = [];

  for (const def of CORNER_DEFS) {
    const x0 = def.ox === "l" ? safety : width - patchSize - safety;
    const y0 = def.oy === "t" ? safety : height - patchSize - safety;
    const ratio = patchWhiteningRatio(raster, x0, y0, patchSize, patchSize);
    const score = whiteningToScore(ratio);
    scores.push(score);
    if (score <= 8) {
      findings.push({
        category: score <= 6 ? "chipping" : "whitening",
        zone: def.zone,
        side,
        description: `${score <= 6 ? "Corner chipping/wear" : "Slight corner whitening"} detected (${(ratio * 100).toFixed(1)}% of patch affected).`,
        severity: score <= 5 ? "major" : score <= 7.5 ? "moderate" : "minor",
        boundingBox: {
          x: x0 / width,
          y: y0 / height,
          width: patchSize / width,
          height: patchSize / height,
        },
      });
    }
  }

  // Corners subgrade weights the worst corner heavily, since one bad corner
  // is what a grader's eye catches first.
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const worst = Math.min(...scores);
  const overall = Math.round((avg * 0.4 + worst * 0.6) * 2) / 2;

  return { score: clamp(overall, 1, 10), findings };
}

const EDGE_DEFS: { zone: CardZone; axis: "h" | "v"; pos: "start" | "end" }[] = [
  { zone: "edge_top", axis: "h", pos: "start" },
  { zone: "edge_bottom", axis: "h", pos: "end" },
  { zone: "edge_left", axis: "v", pos: "start" },
  { zone: "edge_right", axis: "v", pos: "end" },
];

export async function analyzeEdges(buffer: Buffer, side: "front" | "back") {
  const raster = await toGrayscaleRaster(buffer);
  const { width, height } = raster;
  const bandThickness = Math.max(6, Math.round(Math.min(width, height) * 0.035));
  const inset = Math.round(Math.min(width, height) * 0.08); // skip corners, sample the middle of each edge
  const safety = Math.round(Math.min(width, height) * BOUNDARY_SAFETY_INSET_RATIO);

  const findings: DefectFinding[] = [];
  const scores: number[] = [];

  for (const def of EDGE_DEFS) {
    let x0: number;
    let y0: number;
    let w: number;
    let h: number;
    if (def.axis === "h") {
      x0 = inset;
      w = width - inset * 2;
      h = bandThickness;
      y0 = def.pos === "start" ? safety : height - bandThickness - safety;
    } else {
      y0 = inset;
      h = height - inset * 2;
      w = bandThickness;
      x0 = def.pos === "start" ? safety : width - bandThickness - safety;
    }
    const ratio = patchWhiteningRatio(raster, x0, y0, w, h);
    const score = whiteningToScore(ratio);
    scores.push(score);
    if (score <= 8) {
      findings.push({
        category: score <= 6 ? "edge_wear" : "whitening",
        zone: def.zone,
        side,
        description: `${score <= 6 ? "Edge wear" : "Minor edge whitening"} detected along this side (${(ratio * 100).toFixed(1)}% of band affected).`,
        severity: score <= 5 ? "major" : score <= 7.5 ? "moderate" : "minor",
        boundingBox: { x: x0 / width, y: y0 / height, width: w / width, height: h / height },
      });
    }
  }

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const worst = Math.min(...scores);
  const overall = Math.round((avg * 0.5 + worst * 0.5) * 2) / 2;

  return { score: clamp(overall, 1, 10), findings };
}

/**
 * Flags small regions whose local texture (3x3 stddev) is a statistical
 * outlier versus the card's overall texture — a generic stand-in for
 * scratches, print lines, and surface marks, which all show up as local
 * anomalies against the otherwise-smooth printed surface.
 */
export async function analyzeSurface(buffer: Buffer, side: "front" | "back") {
  const raster = await toGrayscaleRaster(buffer, 500);
  const { data, width, height } = raster;
  const block = 6;
  const cols = Math.floor(width / block);
  const rows = Math.floor(height / block);
  // Only blocks that aren't blown out by glare feed the anomaly statistics —
  // a saturated highlight has high local contrast at its own boundary too,
  // which would otherwise read as a false-positive "scratch".
  const readableStd: number[] = [];

  const statsAt = (bx: number, by: number) => {
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = by * block; y < by * block + block; y++) {
      for (let x = bx * block; x < bx * block + block; x++) {
        const v = data[y * width + x];
        sum += v;
        sumSq += v * v;
        n++;
      }
    }
    const mean = sum / n;
    const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    return { std, mean };
  };

  const stdGrid: number[][] = [];
  const meanGrid: number[][] = [];
  for (let by = 0; by < rows; by++) {
    const stdRow: number[] = [];
    const meanRow: number[] = [];
    for (let bx = 0; bx < cols; bx++) {
      const { std, mean } = statsAt(bx, by);
      stdRow.push(std);
      meanRow.push(mean);
      if (mean < SATURATION_CEILING) readableStd.push(std);
    }
    stdGrid.push(stdRow);
    meanGrid.push(meanRow);
  }

  const sorted = [...readableStd].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const p90 = sorted.length ? sorted[Math.floor(sorted.length * 0.9)] : 0;
  const anomalyThreshold = Math.max(median * 2.2, p90);

  const marginBlocksX = Math.max(1, Math.round(cols * 0.1));
  const marginBlocksY = Math.max(1, Math.round(rows * 0.1));

  let anomalyBlocks = 0;
  let totalInterior = 0;
  const findings: DefectFinding[] = [];
  let reportedFindings = 0;

  // A block right at the rim of a glare hotspot straddles the transition
  // from normal texture to blown-out highlight, which is itself high-contrast
  // and would otherwise misread as a scratch — so the exclusion is dilated
  // one block outward from every saturated block, not just the hotspot itself.
  const isGlare = (bx: number, by: number) => by >= 0 && by < rows && bx >= 0 && bx < cols && meanGrid[by][bx] >= SATURATION_CEILING;
  const isNearGlare = (bx: number, by: number) =>
    isGlare(bx, by) || isGlare(bx - 1, by) || isGlare(bx + 1, by) || isGlare(bx, by - 1) || isGlare(bx, by + 1);

  for (let by = marginBlocksY; by < rows - marginBlocksY; by++) {
    for (let bx = marginBlocksX; bx < cols - marginBlocksX; bx++) {
      if (isNearGlare(bx, by)) continue; // glare hotspot (or its rim) — unreadable, not a defect
      totalInterior++;
      if (stdGrid[by][bx] > anomalyThreshold) {
        anomalyBlocks++;
        if (reportedFindings < 6) {
          findings.push({
            category: "surface_mark",
            zone: "surface_general",
            side,
            description: "Possible surface mark or scratch detected (localized texture anomaly).",
            severity: stdGrid[by][bx] > anomalyThreshold * 1.6 ? "moderate" : "minor",
            boundingBox: {
              x: (bx * block) / width,
              y: (by * block) / height,
              width: block / width,
              height: block / height,
            },
          });
          reportedFindings++;
        }
      }
    }
  }

  const anomalyRatio = totalInterior > 0 ? anomalyBlocks / totalInterior : 0;
  let score: number;
  if (anomalyRatio < 0.01) score = 10;
  else if (anomalyRatio < 0.02) score = 9.5;
  else if (anomalyRatio < 0.035) score = 9;
  else if (anomalyRatio < 0.05) score = 8.5;
  else if (anomalyRatio < 0.07) score = 8;
  else if (anomalyRatio < 0.1) score = 7;
  else if (anomalyRatio < 0.14) score = 6;
  else if (anomalyRatio < 0.2) score = 5;
  else score = 4;

  return { score: clamp(score, 1, 10), findings, anomalyRatio: Math.round(anomalyRatio * 1000) / 1000 };
}
