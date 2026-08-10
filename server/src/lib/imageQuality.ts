import sharp from "sharp";
import type { EdgeQuad, ImageQualityIssue, ImageQualityReport } from "@pokedex-vault/shared";

const ANALYSIS_MAX_DIM = 640;
const EXPECTED_CARD_ASPECT = 2.5 / 3.5; // standard trading card ratio, width/height

interface GrayscaleRaster {
  data: Uint8Array;
  width: number;
  height: number;
}

async function toGrayscaleRaster(buffer: Buffer): Promise<GrayscaleRaster> {
  const { data, info } = await sharp(buffer)
    .rotate() // apply EXIF orientation
    .resize({ width: ANALYSIS_MAX_DIM, height: ANALYSIS_MAX_DIM, fit: "inside" })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

async function toRgbRaster(buffer: Buffer) {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: ANALYSIS_MAX_DIM, height: ANALYSIS_MAX_DIM, fit: "inside" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height, channels: info.channels };
}

/** Laplacian-variance sharpness score. Low variance = few strong edges = likely blurry. */
function laplacianVariance(gray: GrayscaleRaster): number {
  const { data, width, height } = gray;
  const lap = new Float64Array(width * height);
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const value =
        -4 * data[i] +
        data[i - 1] +
        data[i + 1] +
        data[i - width] +
        data[i + width];
      lap[i] = value;
      sum += value;
      count++;
    }
  }
  const mean = sum / count;
  let variance = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const d = lap[i] - mean;
      variance += d * d;
    }
  }
  return variance / count;
}

function brightnessStats(gray: GrayscaleRaster) {
  const { data } = gray;
  let sum = 0;
  let over = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    if (data[i] >= 248) over++;
  }
  return { mean: sum / data.length, glareRatio: over / data.length };
}

/**
 * Estimates a foreground (card) mask by sampling many points along the
 * photo's outer border as the background color (median per channel, not a
 * mean of just the 4 corner pixels — a single corner touched by the card, a
 * shadow, or a rotation fill-color wedge would otherwise skew a 4-sample
 * average badly), then classifying every pixel by color distance from that
 * background. Works because scan instructions ask the user to place the
 * card on a flat, contrasting surface.
 */
function estimateForegroundMask(rgb: { data: Uint8Array; width: number; height: number; channels: number }) {
  const { data, width, height, channels } = rgb;
  const sample = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  const border: number[][] = [];
  const step = Math.max(1, Math.round(Math.min(width, height) * 0.01));
  for (let x = 0; x < width; x += step) {
    border.push(sample(x, 0));
    border.push(sample(x, height - 1));
  }
  for (let y = 0; y < height; y += step) {
    border.push(sample(0, y));
    border.push(sample(width - 1, y));
  }
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  const bg = [0, 1, 2].map((c) => median(border.map((p) => p[c])));

  const mask = new Uint8Array(width * height);
  const THRESHOLD = 42;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      mask[y * width + x] = dist > THRESHOLD ? 1 : 0;
    }
  }
  return { mask, width, height, background: bg };
}

/** PCA on foreground pixel coordinates gives the dominant axis angle (degrees). */
function estimateOrientationDeg(mask: Uint8Array, width: number, height: number) {
  let n = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        sumX += x;
        sumY += y;
        n++;
      }
    }
  }
  if (n < 50) return { angleDeg: 0, fillRatio: 0, centroid: [width / 2, height / 2] as [number, number] };
  const cx = sumX / n;
  const cy = sumY / n;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        const dx = x - cx;
        const dy = y - cy;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
      }
    }
  }
  sxx /= n;
  syy /= n;
  sxy /= n;

  // Angle of the major eigenvector of the 2x2 covariance matrix.
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let angleDeg = (theta * 180) / Math.PI;
  // Normalize toward the nearest axis-aligned rotation (a rectangle's major
  // axis for a portrait card should be close to vertical/horizontal).
  while (angleDeg > 45) angleDeg -= 90;
  while (angleDeg < -45) angleDeg += 90;

  return { angleDeg, fillRatio: n / (width * height), centroid: [cx, cy] as [number, number] };
}

/**
 * Restricts the mask to a single connected blob — the one covering the
 * center of the frame — discarding everything else. A raw color-distance
 * mask is noisy against a real photographed background (shadows, gradients,
 * table texture, a stray scuff, another card or object sitting nearby), and
 * picking whichever blob happens to be LARGEST isn't safe either: an
 * uneven background or a neighboring item can easily form a bigger (or
 * merged) blob than the card itself, pulling the crop onto the wrong thing
 * entirely. The one guarantee we do have is that the card is always roughly
 * centered — the capture guide frame and the crop step both keep it there —
 * so anything not sitting on the center of the frame is disqualified
 * outright, no matter how large it is.
 */
function selectCardComponent(mask: Uint8Array, width: number, height: number): Uint8Array {
  const labels = new Int32Array(width * height).fill(-1);
  const stack: number[] = [];
  const sizes: number[] = [];
  let label = 0;

  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    let size = 0;
    stack.length = 0;
    stack.push(start);
    labels[start] = label;
    while (stack.length > 0) {
      const idx = stack.pop() as number;
      size++;
      const x = idx % width;
      const y = (idx / width) | 0;
      if (x > 0 && mask[idx - 1] && labels[idx - 1] === -1) {
        labels[idx - 1] = label;
        stack.push(idx - 1);
      }
      if (x < width - 1 && mask[idx + 1] && labels[idx + 1] === -1) {
        labels[idx + 1] = label;
        stack.push(idx + 1);
      }
      if (y > 0 && mask[idx - width] && labels[idx - width] === -1) {
        labels[idx - width] = label;
        stack.push(idx - width);
      }
      if (y < height - 1 && mask[idx + width] && labels[idx + width] === -1) {
        labels[idx + width] = label;
        stack.push(idx + width);
      }
    }
    sizes.push(size);
    label++;
  }

  let bestLabel = labels[Math.floor(height / 2) * width + Math.floor(width / 2)];

  if (bestLabel === -1) {
    // The exact center pixel missed (e.g. it landed on a lighter patch of
    // the card's own art that happens to read close to the background
    // color) — widen the search to a small ring around the center instead
    // of giving up and falling back to "just pick the biggest blob."
    const radius = Math.round(Math.min(width, height) * 0.12);
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    search: for (let dy = -radius; dy <= radius; dy += 2) {
      const y = cy + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = -radius; dx <= radius; dx += 2) {
        const x = cx + dx;
        if (x < 0 || x >= width) continue;
        const lbl = labels[y * width + x];
        if (lbl !== -1) {
          bestLabel = lbl;
          break search;
        }
      }
    }
  }

  if (bestLabel === -1) {
    // Nothing at all near the center — fall back to the largest component
    // overall rather than returning an empty mask.
    let maxSize = 0;
    for (let i = 0; i < sizes.length; i++) {
      if (sizes[i] > maxSize) {
        maxSize = sizes[i];
        bestLabel = i;
      }
    }
  }

  const result = new Uint8Array(width * height);
  if (bestLabel === -1) return result;
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === bestLabel) result[i] = 1;
  }
  return result;
}

function boundingBox(mask: Uint8Array, width: number, height: number) {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, maxX, minY, maxY };
}

export interface QuadDetection {
  quad: EdgeQuad | null;
  angleDeg: number;
  fillRatio: number;
  boxAspect: number | null;
  background: { r: number; g: number; b: number };
}

async function detectQuad(buffer: Buffer): Promise<QuadDetection> {
  const rgb = await toRgbRaster(buffer);
  const { mask: rawMask, width, height, background } = estimateForegroundMask(rgb);
  const bg = { r: background[0], g: background[1], b: background[2] };
  const mask = selectCardComponent(rawMask, width, height);
  const orientation = estimateOrientationDeg(mask, width, height);
  const box = boundingBox(mask, width, height);
  if (!box) {
    return { quad: null, angleDeg: 0, fillRatio: 0, boxAspect: null, background: bg };
  }
  const boxWidth = box.maxX - box.minX;
  const boxHeight = box.maxY - box.minY;
  const boxAspect = boxWidth / boxHeight;

  // Express the detected box back in the ORIGINAL image's coordinate space
  // (0-1 normalized) so the client can draw an overlay regardless of the
  // analysis downscale factor.
  const quad: EdgeQuad = {
    topLeft: [box.minX / width, box.minY / height],
    topRight: [box.maxX / width, box.minY / height],
    bottomRight: [box.maxX / width, box.maxY / height],
    bottomLeft: [box.minX / width, box.maxY / height],
  };

  return { quad, angleDeg: orientation.angleDeg, fillRatio: orientation.fillRatio, boxAspect, background: bg };
}

export async function assessImageQuality(buffer: Buffer): Promise<ImageQualityReport> {
  const [gray, quad] = await Promise.all([toGrayscaleRaster(buffer), detectQuad(buffer)]);
  const sharpness = laplacianVariance(gray);
  const { mean: brightnessMean, glareRatio } = brightnessStats(gray);

  const issues: ImageQualityIssue[] = [];

  if (sharpness < 55) {
    issues.push({
      type: "blurry",
      message: "This photo looks blurry. Hold the camera steady and make sure the card is in focus.",
      severity: "reject",
    });
  }
  if (brightnessMean < 60) {
    issues.push({
      type: "too_dark",
      message: "This photo is too dark. Please retake it in better lighting.",
      severity: "reject",
    });
  }
  if (brightnessMean > 235) {
    issues.push({
      type: "too_bright",
      message: "This photo is overexposed. Move away from direct light and try again.",
      severity: "reject",
    });
  }
  if (glareRatio > 0.06) {
    issues.push({
      type: "glare",
      message: "Glare or reflection detected on the card surface. Tilt the card or change the lighting angle.",
      severity: "reject",
    });
  }
  if (!quad.quad || quad.fillRatio < 0.12) {
    issues.push({
      type: "card_not_found",
      message: "We couldn't clearly detect the card in this photo. Place it on a flat, contrasting background and fill more of the frame.",
      severity: "reject",
    });
  } else {
    if (Math.abs(quad.angleDeg) > 8) {
      issues.push({
        type: "bad_angle",
        message: "The card looks tilted. Lay it flat and align it with the frame before scanning.",
        severity: "reject",
      });
    }
    if (quad.boxAspect && Math.abs(quad.boxAspect - EXPECTED_CARD_ASPECT) > 0.18 && Math.abs(1 / quad.boxAspect - EXPECTED_CARD_ASPECT) > 0.18) {
      issues.push({
        type: "bad_angle",
        message: "The card's proportions look off, likely from a steep camera angle. Shoot from directly above the card.",
        severity: "warning",
      });
    }
  }

  const passed = issues.every((i) => i.severity !== "reject");

  return {
    passed,
    issues,
    metrics: {
      sharpnessScore: Math.round(sharpness * 100) / 100,
      brightnessMean: Math.round(brightnessMean * 100) / 100,
      glareRatio: Math.round(glareRatio * 1000) / 1000,
      detectedQuad: quad.quad,
    },
  };
}

export interface EdgeCropBox {
  left: number; // normalized 0-1, in the same coordinate space as EdgeQuad
  top: number;
  right: number;
  bottom: number;
}

const EDGE_RUN = 3; // consecutive pixels required past the threshold to count as a real edge, not one noisy pixel

/** Walks one line of pixels from the edge inward, stopping at the first SUSTAINED run of pixels that read as "not background." Returns the offset from the start of the scan, or null if the line never leaves the background. */
function scanLineForEdge(get: (i: number) => number, length: number, threshold: number): number | null {
  let run = 0;
  for (let i = 0; i < length; i++) {
    if (get(i) > threshold) {
      run++;
      if (run >= EDGE_RUN) return i - EDGE_RUN + 1;
    } else {
      run = 0;
    }
  }
  return null;
}

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Finds the card's boundary by scanning inward from each of the photo's 4
 * edges toward the center — several sample lines per side, stopping each
 * one at the first sustained color departure from the background — the
 * same directional-scan approach already used for centering measurement
 * (see centering.ts's findFirstEdge), rather than classifying every pixel
 * in the frame into regions and hoping the right region gets picked.
 *
 * This is deliberately used for the FINAL crop instead of full-frame region
 * detection: a region/blob approach has to correctly classify the ENTIRE
 * photo, and a background patch, mat edge, shadow, or another item nearby
 * can still get misclassified as "the card" no matter how the blob is
 * chosen. A directional scan structurally cannot do that — each line only
 * ever reports the first transition it crosses coming in from ITS OWN edge
 * of the CURRENT frame, so it can shrink the crop inward but can never
 * expand outward or jump to some disconnected object elsewhere in the shot.
 * Worst case on a noisy/low-contrast side, that side just doesn't get
 * trimmed — never a wrong region.
 */
async function scanInwardCrop(buffer: Buffer): Promise<EdgeCropBox> {
  const { data, width, height, channels } = await toRgbRaster(buffer);
  const { background } = estimateForegroundMask({ data, width, height, channels });
  const THRESHOLD = 42;

  const dist = (x: number, y: number) => {
    const i = (y * width + x) * channels;
    const dr = data[i] - background[0];
    const dg = data[i + 1] - background[1];
    const db = data[i + 2] - background[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const SAMPLES = 9;
  const BAND = 0.6; // sample across the middle 60% of each side, staying clear of corners

  const leftOffsets: number[] = [];
  const rightOffsets: number[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    const y = Math.round(height * (0.5 - BAND / 2) + (height * BAND * s) / (SAMPLES - 1));
    if (y < 0 || y >= height) continue;
    const left = scanLineForEdge((i) => dist(i, y), width, THRESHOLD);
    const right = scanLineForEdge((i) => dist(width - 1 - i, y), width, THRESHOLD);
    if (left !== null) leftOffsets.push(left);
    if (right !== null) rightOffsets.push(right);
  }

  const topOffsets: number[] = [];
  const bottomOffsets: number[] = [];
  for (let s = 0; s < SAMPLES; s++) {
    const x = Math.round(width * (0.5 - BAND / 2) + (width * BAND * s) / (SAMPLES - 1));
    if (x < 0 || x >= width) continue;
    const top = scanLineForEdge((i) => dist(x, i), height, THRESHOLD);
    const bottom = scanLineForEdge((i) => dist(x, height - 1 - i), height, THRESHOLD);
    if (top !== null) topOffsets.push(top);
    if (bottom !== null) bottomOffsets.push(bottom);
  }

  const left = median(leftOffsets, 0);
  const right = median(rightOffsets, 0);
  const top = median(topOffsets, 0);
  const bottom = median(bottomOffsets, 0);

  return {
    left: left / width,
    top: top / height,
    right: 1 - right / width,
    bottom: 1 - bottom / height,
  };
}

export { detectQuad, scanInwardCrop };
