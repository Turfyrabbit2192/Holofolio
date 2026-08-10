import type { DefectFinding, GradingResult, ImageQualityReport, SubgradeScores } from "@pokedex-vault/shared";
import { measureCentering, centeringToSubgrade } from "./centering";
import { analyzeCorners, analyzeEdges, analyzeSurface } from "./surfaceAnalysis";
import { detectCreases } from "./creaseDetection";
import { buildCompanyEstimates, buildQualifiers, explainVariance } from "./companyProfiles";

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

// Print lines, ink/color issues, and print misregistration are factory
// defects that a pixel-texture heuristic can't reliably name on its own —
// telling "this is a print defect" apart from ordinary card art requires
// the semantic understanding only the AI vision pass has. They previously
// only produced a cosmetic qualifier badge that CLAIMED to count against
// the surface subgrade without actually doing so; this makes that real,
// the same way a detected crease already caps it below.
const PRINT_ERROR_CATEGORIES = new Set<DefectFinding["category"]>([
  "print_line",
  "print_imperfection",
  "color_issue",
  "alignment_issue",
]);

function worstCap(
  defects: DefectFinding[],
  match: (d: DefectFinding) => boolean,
  caps: { minor: number; moderate: number; major: number }
): number | null {
  let cap: number | null = null;
  for (const d of defects) {
    if (!match(d)) continue;
    const c = caps[d.severity];
    cap = cap === null ? c : Math.min(cap, c);
  }
  return cap;
}

export interface GradingQualityInputs {
  front?: ImageQualityReport | null;
  back?: ImageQualityReport | null;
}

/** Confidence reflects how trustworthy the underlying measurements are, not how good the card looks. */
function computeConfidence(
  frontEdgesConfident: boolean,
  backEdgesConfident: boolean,
  quality?: GradingQualityInputs
): { confidence: GradingResult["confidence"]; confidenceNote: string } {
  const reasons: string[] = [];
  let level: 0 | 1 | 2 = 2;

  const sharpness = [quality?.front?.metrics.sharpnessScore, quality?.back?.metrics.sharpnessScore].filter(
    (v): v is number => typeof v === "number"
  );
  if (sharpness.length && Math.min(...sharpness) < 110) {
    level = Math.min(level, 1) as 0 | 1;
    reasons.push("one of the photos was only moderately sharp");
  }

  const glare = [quality?.front?.metrics.glareRatio, quality?.back?.metrics.glareRatio].filter(
    (v): v is number => typeof v === "number"
  );
  if (glare.length && Math.max(...glare) > 0.02) {
    level = Math.min(level, 1) as 0 | 1;
    reasons.push("some glare or reflection was present");
  }

  if (!frontEdgesConfident || !backEdgesConfident) {
    level = 0;
    reasons.push("the printed border wasn't clearly detectable on every side, making centering a rougher approximation than usual");
  }

  const confidence: GradingResult["confidence"] = level === 2 ? "High" : level === 1 ? "Medium" : "Low";
  const confidenceNote =
    reasons.length === 0
      ? "Both photos were sharp, well-lit, and showed clear card borders, so this estimate rests on clean measurements."
      : `Confidence is ${confidence.toLowerCase()} because ${reasons.join(
          " and "
        )} — retake the photos in brighter, even light directly above the card for a tighter estimate.`;

  return { confidence, confidenceNote };
}

export async function runGradingPipeline(
  frontBuffer: Buffer,
  backBuffer: Buffer,
  extraDefects: DefectFinding[] = [],
  quality?: GradingQualityInputs
): Promise<GradingResult> {
  const [centeringFrontDetail, centeringBackDetail] = await Promise.all([
    measureCentering(frontBuffer),
    measureCentering(backBuffer),
  ]);
  const { edgesConfident: frontEdgesConfident, ...centeringFront } = centeringFrontDetail;
  const { edgesConfident: backEdgesConfident, ...centeringBack } = centeringBackDetail;

  const [frontCorners, backCorners, frontEdges, backEdges, frontSurface, backSurface, frontCrease, backCrease] =
    await Promise.all([
      analyzeCorners(frontBuffer, "front"),
      analyzeCorners(backBuffer, "back"),
      analyzeEdges(frontBuffer, "front"),
      analyzeEdges(backBuffer, "back"),
      analyzeSurface(frontBuffer, "front"),
      analyzeSurface(backBuffer, "back"),
      detectCreases(frontBuffer, "front"),
      detectCreases(backBuffer, "back"),
    ]);

  const centeringFrontScore = centeringToSubgrade(centeringFront);
  const centeringBackScore = centeringToSubgrade(centeringBack);
  const centering = round1(centeringFrontScore * 0.65 + centeringBackScore * 0.35);
  let corners = round1(frontCorners.score * 0.6 + backCorners.score * 0.4);
  let edges = round1(frontEdges.score * 0.6 + backEdges.score * 0.4);

  let surface = round1(frontSurface.score * 0.55 + backSurface.score * 0.45);
  const creaseCaps = [frontCrease.surfaceCap, backCrease.surfaceCap].filter((v): v is number => v !== null);
  if (creaseCaps.length) surface = round1(Math.min(surface, ...creaseCaps));

  const printErrorCap = worstCap(extraDefects, (d) => PRINT_ERROR_CATEGORIES.has(d.category), {
    minor: 8.5,
    moderate: 6.5,
    major: 4,
  });
  if (printErrorCap !== null) surface = round1(Math.min(surface, printErrorCap));

  // The corner/edge photo analysis above already measures whitening
  // numerically and is the primary signal — this is a supplementary safety
  // net for when the AI's own eyes catch something the fixed-patch pixel
  // heuristic missed (odd lighting, a holo pattern confusing the sampler,
  // etc). Only MODERATE+ AI findings apply a cap, so routine minor findings
  // that the photo analysis already accounts for don't get double-counted.
  const cornerCap = worstCap(
    extraDefects,
    (d) => (d.category === "corner_wear" || d.category === "chipping" || d.category === "whitening") && d.zone.startsWith("corner_"),
    { minor: 10, moderate: 7.5, major: 5 }
  );
  if (cornerCap !== null) corners = round1(Math.min(corners, cornerCap));

  const edgeCap = worstCap(
    extraDefects,
    (d) => (d.category === "edge_wear" || d.category === "whitening") && d.zone.startsWith("edge_"),
    { minor: 10, moderate: 7.5, major: 5 }
  );
  if (edgeCap !== null) edges = round1(Math.min(edges, edgeCap));

  const subgrades: SubgradeScores = { centering, corners, edges, surface };

  const centeringOffset = Math.max(
    Math.abs(centeringFront.leftRightRatio[0] - 50),
    Math.abs(centeringFront.topBottomRatio[0] - 50),
    Math.abs(centeringBack.leftRightRatio[0] - 50),
    Math.abs(centeringBack.topBottomRatio[0] - 50)
  );

  const companyEstimates = buildCompanyEstimates(subgrades, centeringOffset);
  // The headline AI grade is a single whole-number figure (unlike the
  // per-company estimates below, which keep each company's real scale —
  // PSA whole numbers, BGS/CGC half-points, TAG two decimals).
  const aiOverallGrade = Math.round(
    companyEstimates.reduce((sum, e) => sum + e.overall, 0) / companyEstimates.length
  );

  const defects: DefectFinding[] = [
    ...frontCorners.findings,
    ...backCorners.findings,
    ...frontEdges.findings,
    ...backEdges.findings,
    ...frontSurface.findings,
    ...backSurface.findings,
    ...frontCrease.findings,
    ...backCrease.findings,
    ...extraDefects,
  ];

  const qualifiers = buildQualifiers(subgrades, centeringOffset, defects);
  const { confidence, confidenceNote } = computeConfidence(frontEdgesConfident, backEdgesConfident, quality);

  return {
    isEstimate: true,
    aiOverallGrade,
    subgrades,
    centeringFront,
    centeringBack,
    companyEstimates,
    defects,
    qualifiers,
    confidence,
    confidenceNote,
    varianceExplanation: explainVariance(companyEstimates),
    disclaimer:
      "This is an AI-generated estimate based on computer-vision analysis of your photos, using publicly known grading philosophies for PSA, TAG, BGS, and CGC. It is not an official grade from any grading company and actual submitted grades may differ, especially for defects only visible in person (e.g. under raking light) or on the card's back if not photographed clearly.",
  };
}
