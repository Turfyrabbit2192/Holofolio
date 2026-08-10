import sharp from "sharp";
import type { DefectFinding } from "@pokedex-vault/shared";

interface Raster {
  data: Uint8Array;
  width: number;
  height: number;
}

async function toGrayscaleRaster(buffer: Buffer, maxDim = 480): Promise<Raster> {
  const { data, info } = await sharp(buffer)
    .resize({ width: maxDim, height: maxDim, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

interface LineBin {
  votes: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  thetaBin: number;
  rhoBin: number;
}

const MIN_GRADIENT = 22;
const ANGLE_BINS = 90; // 2-degree resolution over [0, PI)
const RHO_RES = 2; // px
// A card's own printed border/panel edges are near-perfectly horizontal or
// vertical by design — and every single card has them. A genuine fold from
// handling is essentially never exactly axis-aligned, so lines whose angle
// falls within this many bins of dead horizontal or dead vertical are
// treated as print geometry, not a crease, no matter how long they run.
const AXIS_EXCLUSION_BINS = 3; // ~6 degrees
function isAxisAligned(thetaBin: number): boolean {
  const halfway = ANGLE_BINS / 2;
  return thetaBin <= AXIS_EXCLUSION_BINS || thetaBin >= ANGLE_BINS - AXIS_EXCLUSION_BINS || Math.abs(thetaBin - halfway) <= AXIS_EXCLUSION_BINS;
}

export interface CreaseDetection {
  findings: DefectFinding[];
  surfaceCap: number | null;
}

/**
 * Detects long, straight fold/crease lines with a gradient-guided Hough
 * transform: each strong-edge pixel votes for exactly one (angle, offset)
 * bin — its own local gradient direction — instead of sweeping every
 * candidate angle per pixel like a textbook Hough transform. A real crease
 * produces a run of edge pixels that are all locally aligned to the same
 * line, so it shows up as one bin with a vote count close to the line's
 * pixel length. Short print-artwork edges rarely accumulate that many votes
 * in a single bin, and the printed border frame is excluded via margin.
 *
 * This is a heuristic, not a certainty: a strong straight internal print
 * line (e.g. a text-box border) can occasionally trigger it too, so
 * findings are phrased as "possible" and should be confirmed by eye.
 */
export async function detectCreases(buffer: Buffer, side: "front" | "back"): Promise<CreaseDetection> {
  const raster = await toGrayscaleRaster(buffer);
  const { data, width, height } = raster;

  if (width < 40 || height < 40) return { findings: [], surfaceCap: null };

  const marginX = Math.round(width * 0.09);
  const marginY = Math.round(height * 0.09);
  const diag = Math.sqrt(width * width + height * height);
  const rhoBins = Math.ceil((2 * diag) / RHO_RES);

  const at = (x: number, y: number) => data[y * width + x];
  const bins = new Map<number, LineBin>();

  for (let y = marginY; y < height - marginY; y++) {
    for (let x = marginX; x < width - marginX; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) - 2 * at(x - 1, y) + 2 * at(x + 1, y) - at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      if (mag < MIN_GRADIENT) continue;

      // A Hough line's normal angle equals the local gradient direction
      // (mod PI), since the gradient points across the edge, not along it.
      let theta = Math.atan2(gy, gx);
      if (theta < 0) theta += Math.PI;
      const thetaBin = Math.min(ANGLE_BINS - 1, Math.floor((theta / Math.PI) * ANGLE_BINS));
      const thetaCenter = ((thetaBin + 0.5) / ANGLE_BINS) * Math.PI;
      const rho = x * Math.cos(thetaCenter) + y * Math.sin(thetaCenter);
      const rhoBin = Math.floor((rho + diag) / RHO_RES);
      const key = thetaBin * rhoBins + rhoBin;

      let bin = bins.get(key);
      if (!bin) {
        bin = { votes: 0, minX: x, maxX: x, minY: y, maxY: y, thetaBin, rhoBin };
        bins.set(key, bin);
      }
      bin.votes++;
      if (x < bin.minX) bin.minX = x;
      if (x > bin.maxX) bin.maxX = x;
      if (y < bin.minY) bin.minY = y;
      if (y > bin.maxY) bin.maxY = y;
    }
  }

  const minVotes = Math.round(Math.min(width, height) * 0.3);

  // A single physical line often fragments across a couple of neighboring
  // (angle, offset) bins, since per-pixel gradient direction is noisy —
  // merge bins that are close in both angle and offset before scoring, so
  // one crease is reported once instead of two or three overlapping pieces.
  const preFilterVotes = Math.max(4, Math.round(minVotes * 0.35));
  let pool = [...bins.values()].filter((b) => b.votes >= preFilterVotes);
  const mergedBins: LineBin[] = [];
  while (pool.length > 0) {
    pool.sort((a, b) => b.votes - a.votes);
    const seed = pool.shift()!;
    const group: LineBin = { ...seed };
    let changed = true;
    while (changed) {
      changed = false;
      pool = pool.filter((cand) => {
        const closeTheta = Math.abs(cand.thetaBin - group.thetaBin) <= 2;
        const closeRho = Math.abs(cand.rhoBin - group.rhoBin) <= 6;
        if (closeTheta && closeRho) {
          group.votes += cand.votes;
          group.minX = Math.min(group.minX, cand.minX);
          group.maxX = Math.max(group.maxX, cand.maxX);
          group.minY = Math.min(group.minY, cand.minY);
          group.maxY = Math.max(group.maxY, cand.maxY);
          changed = true;
          return false;
        }
        return true;
      });
    }
    mergedBins.push(group);
  }

  const candidates = mergedBins
    .filter((b) => b.votes >= minVotes && !isAxisAligned(b.thetaBin))
    .sort((a, b) => b.votes - a.votes);

  const findings: DefectFinding[] = [];
  let surfaceCap: number | null = null;

  for (const bin of candidates) {
    const lengthPx = Math.sqrt((bin.maxX - bin.minX) ** 2 + (bin.maxY - bin.minY) ** 2);
    // A real fold is a mostly-continuous line: most pixels along its span
    // are edge pixels. Holo-foil texture can coincidentally align enough
    // votes into one bin to pass the vote-count threshold, but those votes
    // stay sparse across a wide bounding box rather than densely filling a
    // line — this ratio tells the two apart.
    const density = bin.votes / Math.max(1, lengthPx);
    if (density < 0.35) continue;

    // Normalized against the full image diagonal (not the shorter side) so
    // a line running corner-to-corner reads as ~100%, not over it — a
    // steep diagonal can legitimately be longer than either side alone.
    const lengthFraction = lengthPx / diag;
    // Thresholds are lower than the "60% / 40%" they'd be if measured
    // against a single side, since the diagonal denominator is roughly 1.7x
    // longer than the card's short side for a standard trading-card aspect.
    const severity: DefectFinding["severity"] = lengthFraction > 0.35 ? "major" : lengthFraction > 0.22 ? "moderate" : "minor";
    const cap = lengthFraction > 0.35 ? 2 : lengthFraction > 0.22 ? 3.5 : 5.5;
    surfaceCap = surfaceCap === null ? cap : Math.min(surfaceCap, cap);

    findings.push({
      category: "crease",
      zone: "surface_general",
      side,
      description: `Possible crease or fold line detected, running across roughly ${Math.round(
        lengthFraction * 100
      )}% of the card${severity === "minor" ? " (could also be a sharp print edge — verify in person)" : ""}.`,
      severity,
      boundingBox: {
        x: bin.minX / width,
        y: bin.minY / height,
        width: Math.max(1, bin.maxX - bin.minX) / width,
        height: Math.max(1, bin.maxY - bin.minY) / height,
      },
    });

    if (findings.length >= 3) break; // avoid flooding the UI with near-duplicate line reports
  }

  return { findings, surfaceCap };
}
