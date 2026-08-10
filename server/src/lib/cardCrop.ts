import sharp from "sharp";
import { detectQuad, scanInwardCrop } from "./imageQuality";

export interface StraightenResult {
  buffer: Buffer;
  angleDeg: number;
  fillRatio: number;
}

/**
 * Rotates the photo to level the card (using the PCA orientation angle from
 * detectQuad, run on whichever blob covers the center of the frame), then
 * trims the rotated image down to just the card using TWO independent
 * boundary estimates that fail in different, non-overlapping ways — and
 * takes whichever one is tighter on each side:
 *
 *  - detectQuad's region detection (center-anchored connected blob): robust
 *    against a systematic bias across the whole background — a lighting
 *    gradient, table texture — because it requires the region to actually
 *    be one contiguous blob sitting on the center of the frame. But if
 *    something else (a mat's edge, another card, a shadow) is color-close
 *    enough to bridge into the card's own blob, this can still balloon.
 *  - scanInwardCrop's directional edge scan: can never expand outward or
 *    jump to a disconnected region, since each line only reports the FIRST
 *    transition coming in from its own edge. But if something else sits
 *    BETWEEN the card and that edge, the scan stops at ITS boundary
 *    instead, overshooting past the card.
 *
 * Intersecting the two (the more-inward answer wins on each side) means an
 * error in either method only wins if the OTHER method independently agrees
 * — any case where one method balloons out gets overruled by the other, so
 * the combined box is never looser than the better of the two.
 *
 * Rotating the whole photo to level the card necessarily rotates the
 * background too, which exposes new corner wedges outside the original
 * frame that sharp fills with a solid color. If that fill color doesn't
 * match the real background, both detection passes below would misread the
 * fill (or the newly-exposed real background beyond it) as part of the
 * card. Filling with the ALREADY-DETECTED background color instead keeps
 * every non-card pixel a consistent color after rotation.
 */
export async function straightenAndCrop(buffer: Buffer): Promise<StraightenResult> {
  const initial = await detectQuad(buffer);

  const rotated = await sharp(buffer)
    .rotate()
    .rotate(-initial.angleDeg, { background: initial.background })
    .toBuffer();

  const meta = await sharp(rotated).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width === 0 || height === 0) {
    return { buffer: rotated, angleDeg: initial.angleDeg, fillRatio: initial.fillRatio };
  }

  const [blobDetection, edgeBox] = await Promise.all([detectQuad(rotated), scanInwardCrop(rotated)]);

  const blobBox = blobDetection.quad
    ? {
        left: blobDetection.quad.topLeft[0],
        top: blobDetection.quad.topLeft[1],
        right: blobDetection.quad.bottomRight[0],
        bottom: blobDetection.quad.bottomRight[1],
      }
    : { left: 0, top: 0, right: 1, bottom: 1 };

  const leftN = Math.max(blobBox.left, edgeBox.left);
  const topN = Math.max(blobBox.top, edgeBox.top);
  const rightN = Math.min(blobBox.right, edgeBox.right);
  const bottomN = Math.min(blobBox.bottom, edgeBox.bottom);

  // The two estimates should always overlap substantially for a real card
  // photo — if they don't (near-zero or inverted overlap), something went
  // wrong with detection and trusting the intersection would crop to
  // nothing, so fall back to whichever box is smaller (safer than guessing).
  const valid = rightN - leftN > 0.05 && bottomN - topN > 0.05;
  const box = valid ? { left: leftN, top: topN, right: rightN, bottom: bottomN } : blobBox;

  const left = Math.max(0, Math.round(box.left * width));
  const top = Math.max(0, Math.round(box.top * height));
  const right = Math.min(width, Math.round(box.right * width));
  const bottom = Math.min(height, Math.round(box.bottom * height));

  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);

  const cropped = await sharp(rotated)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .toBuffer();

  const fillRatio = (cropWidth * cropHeight) / (width * height);
  return { buffer: cropped, angleDeg: initial.angleDeg, fillRatio };
}
