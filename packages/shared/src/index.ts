// Shared domain types used by both the server and the mobile app.
// Keeping these in one place means the API contract can't silently drift
// between client and server.

export type GradingCompany = "PSA" | "TAG" | "BGS" | "CGC";

export type CardLanguage =
  | "English"
  | "Japanese"
  | "Korean"
  | "Chinese"
  | "German"
  | "French"
  | "Italian"
  | "Spanish"
  | "Portuguese"
  | "Other";

export type HoloType = "Non-Holo" | "Holo" | "Reverse Holo" | "Cosmos Holo" | "Other";

export type CardCondition = "Raw" | "Graded";

export interface EdgeQuad {
  // Four corners of the detected card in the source image, clockwise from top-left.
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
}

export type ImageQualityIssueType =
  | "blurry"
  | "too_dark"
  | "too_bright"
  | "glare"
  | "bad_angle"
  | "card_not_found"
  | "low_resolution"
  | "check_unavailable";

export interface ImageQualityIssue {
  type: ImageQualityIssueType;
  message: string;
  severity: "warning" | "reject";
}

export interface ImageQualityReport {
  passed: boolean;
  issues: ImageQualityIssue[];
  metrics: {
    sharpnessScore: number; // Laplacian variance, higher = sharper
    brightnessMean: number; // 0-255
    glareRatio: number; // fraction of blown-out highlight pixels
    detectedQuad: EdgeQuad | null;
  };
}

export interface CenteringMeasurement {
  // Border widths in px measured from the perspective-corrected crop.
  top: number;
  bottom: number;
  left: number;
  right: number;
  leftRightRatio: [number, number]; // normalized e.g. [53, 47]
  topBottomRatio: [number, number];
}

export type DefectCategory =
  | "scratch"
  | "whitening"
  | "surface_mark"
  | "print_line"
  | "holo_scratch"
  | "stain"
  | "dent"
  | "crease"
  | "scuffing"
  | "print_imperfection"
  | "edge_wear"
  | "color_issue"
  | "alignment_issue"
  | "corner_wear"
  | "chipping"
  | "layering"
  | "bend";

export type CardZone =
  | "corner_top_left"
  | "corner_top_right"
  | "corner_bottom_left"
  | "corner_bottom_right"
  | "edge_top"
  | "edge_bottom"
  | "edge_left"
  | "edge_right"
  | "surface_center"
  | "surface_general";

export interface DefectFinding {
  category: DefectCategory;
  zone: CardZone;
  side: "front" | "back";
  description: string;
  severity: "minor" | "moderate" | "major";
  // Normalized 0-1 bounding box relative to the cropped card image, for overlay rendering.
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface SubgradeScores {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
}

export interface CompanyGradeEstimate {
  company: GradingCompany;
  overall: number;
  subgrades: SubgradeScores;
  scale: string; // e.g. "1-10 whole numbers" or "1-10 in 0.5 increments"
  notes: string[];
}

export interface GradingQualifier {
  code: string; // short shorthand inspired by (not identical to) real grading-company qualifier codes, e.g. "OC", "CR"
  label: string;
  note: string;
}

export interface GradingResult {
  isEstimate: true;
  aiOverallGrade: number;
  subgrades: SubgradeScores;
  centeringFront: CenteringMeasurement | null;
  centeringBack: CenteringMeasurement | null;
  companyEstimates: CompanyGradeEstimate[];
  defects: DefectFinding[];
  qualifiers: GradingQualifier[];
  confidence: "High" | "Medium" | "Low";
  confidenceNote: string;
  varianceExplanation: string;
  disclaimer: string;
}

export interface CardIdentification {
  confident: boolean;
  confidenceNote: string | null;
  name: string;
  set: string;
  setId: string | null;
  cardNumber: string;
  totalInSet: string | null;
  rarity: string;
  cardType: string;
  language: CardLanguage;
  holoType: HoloType;
  variant: string | null;
  isPromo: boolean;
  isFirstEditionOrShadowless: boolean;
  pokemonTcgIoId: string | null;
  imageUrl: string | null;
}

export interface PriceSourcePoint {
  source: "eBay" | "TCGplayer" | "PriceCharting" | "Collectr" | "Cardmarket" | "JustTCG";
  configured: boolean;
  raw: number | null;
  low: number | null;
  high: number | null;
  saleCount: number | null;
  asOf: string | null;
  note: string | null;
}

export interface GradedPricePoint {
  label: string; // "PSA 10", "BGS 9.5", etc.
  company: GradingCompany | "Generic";
  grade: number;
  value: number | null;
  note: string | null;
}

export interface PricingResult {
  estimatedValue: number | null;
  // Whether `estimatedValue` reflects a specific grade (matched against the AI's
  // estimated grade against a real graded-price comp) or is the raw/ungraded
  // market aggregate because no graded-price source had a usable comp.
  valuationBasis: "graded" | "raw" | "none";
  valuationNote: string;
  gradeUsedForValuation: { company: GradingCompany | "Generic"; grade: number } | null;
  // The raw/ungraded market aggregate, preserved even when `estimatedValue` above is grade-adjusted.
  rawEstimatedValue: number | null;
  marketRangeLow: number | null;
  marketRangeHigh: number | null;
  confidence: "High" | "Medium" | "Low" | "None";
  confidenceNote: string;
  sourcesUsed: PriceSourcePoint[];
  gradedPrices: GradedPricePoint[];
  totalSalesConsidered: number;
  lastUpdated: string;
  disclaimer: string;
}

export interface CollectionItemDTO {
  id: string;
  card: CardIdentification;
  frontImageUrl: string;
  backImageUrl: string;
  latestGrade: GradingResult | null;
  latestPricing: PricingResult | null;
  condition: CardCondition;
  gradingCompany: GradingCompany | null;
  certNumber: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  notes: string | null;
  dateScanned: string;
  scanHistoryCount: number;
}

export interface ScanRecordDTO {
  id: string;
  createdAt: string;
  overallGrade: number;
  subgrades: SubgradeScores;
  frontImageUrl: string;
  backImageUrl: string;
}

export interface DashboardStats {
  totalCards: number;
  collectionValue: number;
  averageGrade: number;
  highestValueCard: { name: string; value: number } | null;
  cardsScanned: number;
  valueChangePct30d: number | null;
  gradeDistribution: Record<string, number>;
  rawVsGraded: { raw: number; graded: number };
  companyDistribution: Record<GradingCompany, number>;
  setsCollected: number;
  valueOverTime: { date: string; value: number }[];
}
