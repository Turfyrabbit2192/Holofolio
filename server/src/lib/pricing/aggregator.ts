import type { CardIdentification, GradedPricePoint, GradingResult, PriceSourcePoint, PricingResult } from "@pokedex-vault/shared";
import type { PokemonTcgCard } from "../pokemonTcgApi";
import { pickTcgplayerPrice } from "../pokemonTcgApi";
import { env } from "../../env";
import { extractPriceChartingGradedPrices, fetchCollectrPricing, fetchEbayGradedPrice, fetchEbayPricing, fetchPriceChartingProduct } from "./providers";
import { fetchJustTcgPricing } from "./justtcg";

function tcgplayerSource(card: PokemonTcgCard | null, holoType: string): PriceSourcePoint {
  if (!card?.tcgplayer) {
    return {
      source: "TCGplayer",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "No TCGplayer pricing found for this exact card in the pokemontcg.io catalog.",
    };
  }
  const bucket = pickTcgplayerPrice(card, holoType);
  if (!bucket) {
    return {
      source: "TCGplayer",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: card.tcgplayer.updatedAt,
      note: "TCGplayer has this card listed but no price data for the matched variant.",
    };
  }
  return {
    source: "TCGplayer",
    configured: true,
    raw: bucket.market ?? bucket.mid,
    low: bucket.low,
    high: bucket.high,
    saleCount: null,
    asOf: card.tcgplayer.updatedAt,
    note: null,
  };
}

function cardmarketSource(card: PokemonTcgCard | null): PriceSourcePoint {
  if (!card?.cardmarket) {
    return {
      source: "Cardmarket",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "No Cardmarket pricing found for this card.",
    };
  }
  const prices = card.cardmarket.prices;
  const raw = (prices.trendPrice as number | undefined) ?? (prices.averageSellPrice as number | undefined) ?? null;
  if (raw === null) {
    return {
      source: "Cardmarket",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: card.cardmarket.updatedAt,
      note: "Cardmarket has this card listed but no usable price fields.",
    };
  }
  return {
    source: "Cardmarket",
    configured: true,
    raw,
    low: (prices.lowPrice as number | undefined) ?? null,
    high: (prices.trendPrice as number | undefined) ?? null,
    saleCount: null,
    asOf: card.cardmarket.updatedAt,
    note: null,
  };
}

function toDollars(cents: unknown): number | null {
  return typeof cents === "number" && cents > 0 ? cents / 100 : null;
}

function priceChartingSource(json: Record<string, unknown> | null): PriceSourcePoint {
  if (!env.priceChartingToken) {
    return {
      source: "PriceCharting",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "PriceCharting API token not configured on this server.",
    };
  }
  if (!json) {
    return {
      source: "PriceCharting",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "No PriceCharting listing matched this card.",
    };
  }
  const raw = toDollars(json["loose-price"]);
  if (raw === null) {
    return {
      source: "PriceCharting",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: `Found "${json["product-name"]}" on PriceCharting, but this API token's plan doesn't include price data.`,
    };
  }
  return {
    source: "PriceCharting",
    configured: true,
    raw,
    low: raw,
    high: raw,
    saleCount: null,
    asOf: new Date().toISOString(),
    note: null,
  };
}

/** Drops any configured source whose value is a wild outlier vs. the group median — guards against a mismatched card skewing the estimate. */
function removeOutliers(points: { source: PriceSourcePoint; value: number }[]) {
  if (points.length < 3) return points;
  const values = points.map((p) => p.value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  return points.filter((p) => p.value <= median * 3 && p.value >= median / 3);
}

const SOURCE_WEIGHT: Record<PriceSourcePoint["source"], number> = {
  TCGplayer: 1.0,
  JustTCG: 0.9, // independently-refreshed TCGplayer-sourced aggregator — strong signal, but a step removed from the primary source
  Cardmarket: 0.6,
  eBay: 0.5, // active listings, not confirmed sold — weighted down accordingly
  PriceCharting: 0.8,
  Collectr: 0.7,
};

export async function buildPricingResult(identification: CardIdentification, matchedCard: PokemonTcgCard | null): Promise<PricingResult> {
  const query = [identification.name, identification.set, identification.cardNumber].filter(Boolean).join(" ");

  const [ebay, priceChartingProduct, collectr, justTcg] = await Promise.all([
    fetchEbayPricing(query),
    fetchPriceChartingProduct(query),
    fetchCollectrPricing(),
    fetchJustTcgPricing(identification),
  ]);
  const priceCharting = priceChartingSource(priceChartingProduct);

  const sourcesUsed: PriceSourcePoint[] = [
    tcgplayerSource(matchedCard, identification.holoType),
    justTcg,
    cardmarketSource(matchedCard),
    ebay,
    priceCharting,
    collectr,
  ];

  const configuredWithValue = sourcesUsed
    .filter((s) => s.configured && s.raw !== null)
    .map((s) => ({ source: s, value: s.raw as number }));

  const cleaned = removeOutliers(configuredWithValue);

  const totalSalesConsidered = sourcesUsed.reduce((sum, s) => sum + (s.saleCount ?? 0), 0);

  let estimatedValue: number | null = null;
  let marketRangeLow: number | null = null;
  let marketRangeHigh: number | null = null;

  if (cleaned.length > 0) {
    const totalWeight = cleaned.reduce((sum, p) => sum + SOURCE_WEIGHT[p.source.source], 0);
    estimatedValue = cleaned.reduce((sum, p) => sum + p.value * SOURCE_WEIGHT[p.source.source], 0) / totalWeight;
    estimatedValue = Math.round(estimatedValue * 100) / 100;

    const lows = cleaned.map((p) => p.source.low ?? p.value);
    const highs = cleaned.map((p) => p.source.high ?? p.value);
    marketRangeLow = Math.round(Math.min(...lows) * 100) / 100;
    marketRangeHigh = Math.round(Math.max(...highs) * 100) / 100;
  }

  let confidence: PricingResult["confidence"];
  let confidenceNote: string;
  if (cleaned.length === 0) {
    confidence = "None";
    confidenceNote = "No pricing sources returned usable data for this card. Try correcting the card identification or check back later.";
  } else if (cleaned.length === 1) {
    confidence = "Low";
    confidenceNote = `Only one pricing source (${cleaned[0].source.source}) had data — treat this estimate as rough.`;
  } else if (!identification.confident) {
    confidence = "Low";
    confidenceNote = "Card identification wasn't fully confident, so this price estimate may not match your exact card.";
  } else if (cleaned.length >= 2) {
    const values = cleaned.map((p) => p.value);
    const spread = (Math.max(...values) - Math.min(...values)) / (estimatedValue || 1);
    confidence = spread > 0.6 ? "Medium" : "High";
    confidenceNote =
      spread > 0.6
        ? `Sources disagree somewhat (${cleaned.map((p) => p.source.source).join(", ")}) — treating this as a medium-confidence estimate.`
        : `Based on ${cleaned.map((p) => p.source.source).join(", ")}.`;
  } else {
    confidence = "Medium";
    confidenceNote = "Limited source agreement available.";
  }

  const gradedPrices: GradedPricePoint[] = extractPriceChartingGradedPrices(priceChartingProduct);
  if (gradedPrices.length === 0) {
    gradedPrices.push({
      label: "Graded prices",
      company: "Generic",
      grade: 0,
      value: null,
      note: env.priceChartingToken
        ? "PriceCharting didn't return grade-specific pricing for this card."
        : "No configured pricing source currently publishes grade-specific comps. Add a PriceCharting API token to populate this.",
    });
  }

  return {
    estimatedValue,
    valuationBasis: estimatedValue === null ? "none" : "raw",
    valuationNote:
      estimatedValue === null
        ? "No pricing data available."
        : "Raw/ungraded market value — no grading result was applied to this valuation.",
    gradeUsedForValuation: null,
    rawEstimatedValue: estimatedValue,
    marketRangeLow,
    marketRangeHigh,
    confidence,
    confidenceNote,
    sourcesUsed,
    gradedPrices,
    totalSalesConsidered,
    lastUpdated: new Date().toISOString(),
    disclaimer:
      "Prices are estimates aggregated from the sources listed above and are not a guarantee of what your card would sell for. Raw and graded values can vary significantly based on condition, timing, and buyer demand.",
  };
}

/**
 * Re-points `estimatedValue` at the graded-price comp closest to the AI's
 * overall grade estimate (e.g. AI grade 9 -> the "graded ~9" comp), so the
 * headline value reflects what the card would likely fetch AT that grade
 * rather than its raw/ungraded market price. Falls back to the raw value,
 * unchanged, when no graded-price source returned any comps (currently only
 * PriceCharting publishes grade-specific pricing, and it requires a paid API
 * token) — never fabricates a grade multiplier over the raw price.
 */
export function applyGradeValuation(pricing: PricingResult, grading: GradingResult): PricingResult {
  const candidates = pricing.gradedPrices.filter(
    (p): p is GradedPricePoint & { value: number } => p.value !== null
  );

  if (candidates.length === 0) {
    return {
      ...pricing,
      valuationBasis: "raw",
      gradeUsedForValuation: null,
      valuationNote:
        "No graded-price source is configured, so this is the raw/ungraded market value. Add a PriceCharting API token to see pricing at your AI-estimated grade.",
    };
  }

  const targetGrade = grading.aiOverallGrade;
  let best = candidates[0];
  let bestDistance = Math.abs(best.grade - targetGrade);
  for (const c of candidates.slice(1)) {
    const distance = Math.abs(c.grade - targetGrade);
    if (distance < bestDistance) {
      best = c;
      bestDistance = distance;
    }
  }
  const isExact = bestDistance < 0.01;

  return {
    ...pricing,
    estimatedValue: best.value,
    valuationBasis: "graded",
    gradeUsedForValuation: { company: best.company, grade: best.grade },
    valuationNote: isExact
      ? `Valued at your AI-estimated grade (${best.grade}) using the ${best.label} comp from PriceCharting.`
      : `No exact comp for grade ${targetGrade.toFixed(1)} — showing the closest available (${best.label}, grade ${best.grade}) from PriceCharting as an estimate.`,
  };
}

/**
 * Adds an eBay-derived graded-price comp at the AI's exact estimated grade
 * (PriceCharting only publishes a handful of fixed grade buckets like "PSA
 * 10"/generic-9, not arbitrary grades). eBay's free-text search can't
 * reliably tell apart different printings of a card that share the same
 * name and number — confirmed in testing, where it matched a 1999 Base Set
 * Charizard search to 2021 reprint listings — so the result is only kept if
 * it clears a sanity floor/ceiling against the card's already-known raw
 * market value: a graded, authenticated, slabbed card should never be
 * worth meaningfully LESS than the raw card regardless of grade, and
 * shouldn't be wildly higher either. Anything that fails this is silently
 * dropped rather than shown, same as the app's approach everywhere else —
 * an unreliable number doesn't get displayed as if it were a fact.
 */
export async function addEbayGradedComp(
  pricing: PricingResult,
  identification: CardIdentification,
  grading: GradingResult
): Promise<PricingResult> {
  if (pricing.rawEstimatedValue === null) return pricing;

  const result = await fetchEbayGradedPrice(
    identification.name,
    identification.set,
    identification.cardNumber,
    grading.aiOverallGrade
  );
  if (!result) return pricing;

  const floor = pricing.rawEstimatedValue * 0.8;
  const ceiling = pricing.rawEstimatedValue * 40;
  if (result.value < floor || result.value > ceiling) return pricing;

  const grade = Math.round(grading.aiOverallGrade);
  const point: GradedPricePoint = {
    label: `eBay PSA ${grade} (active listings)`,
    company: "PSA",
    grade,
    value: result.value,
    note: `Based on ${result.sampleSize} current eBay listing${result.sampleSize === 1 ? "" : "s"} — active asking prices, not confirmed sold comps.`,
  };
  return { ...pricing, gradedPrices: [...pricing.gradedPrices, point] };
}
