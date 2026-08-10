import type { CardIdentification, PriceSourcePoint } from "@pokedex-vault/shared";
import { env } from "../../env";

const BASE_URL = "https://api.justtcg.com/v1";

interface JustTcgVariant {
  condition: string;
  printing: string;
  price: number;
  lastUpdated: number; // unix seconds
  minPrice30d: number | null;
  maxPrice30d: number | null;
}

interface JustTcgCard {
  name: string;
  set_name: string;
  number: string;
  variants: JustTcgVariant[];
}

function headers(): Record<string, string> {
  return { "x-api-key": env.justTcgApiKey };
}

/** Strips a "004/102"-style set number down to its leading numeric part for loose comparison against a plain "4". */
function normalizeNumber(raw: string): string {
  const leading = raw.split("/")[0]?.trim() ?? raw;
  const stripped = leading.replace(/^0+(?=\d)/, "");
  return stripped.toLowerCase();
}

function scoreCandidate(card: JustTcgCard, identification: CardIdentification): number {
  let score = 0;
  const cardName = card.name.toLowerCase().trim();
  const wantName = identification.name.toLowerCase().trim();
  if (cardName === wantName) score += 3;
  else if (cardName.includes(wantName) || wantName.includes(cardName)) score += 1;

  const cardSet = card.set_name.toLowerCase().trim();
  const wantSet = identification.set.toLowerCase().trim();
  if (wantSet) {
    if (cardSet === wantSet) score += 3;
    else if (cardSet.includes(wantSet) || wantSet.includes(cardSet)) score += 1.5;
  }

  if (identification.cardNumber) {
    if (normalizeNumber(card.number) === normalizeNumber(identification.cardNumber)) score += 3;
  }

  return score;
}

/** Picks the raw (ungraded) Near Mint variant closest to the scanned card's printing/holo type. */
function pickVariant(card: JustTcgCard, holoType: string): JustTcgVariant | null {
  const nearMint = card.variants.filter((v) => v.condition === "Near Mint");
  const pool = nearMint.length > 0 ? nearMint : card.variants;
  if (pool.length === 0) return null;

  const order =
    holoType === "Reverse Holo"
      ? ["Reverse Holofoil", "Holofoil", "Normal"]
      : holoType === "Holo"
      ? ["Holofoil", "1st Edition Holofoil", "Unlimited Holofoil", "Reverse Holofoil", "Normal"]
      : ["Normal", "1st Edition", "Unlimited", "Holofoil"];

  for (const printing of order) {
    const match = pool.find((v) => v.printing === printing);
    if (match) return match;
  }
  return pool[0];
}

/** Real-time Pokemon TCG pricing aggregated from TCGplayer sale data via JustTCG's API — a second live pricing source alongside the pokemontcg.io-sourced TCGplayer/Cardmarket figures. */
export async function fetchJustTcgPricing(identification: CardIdentification): Promise<PriceSourcePoint> {
  if (!env.justTcgApiKey) {
    return {
      source: "JustTCG",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "JustTCG API key not configured on this server.",
    };
  }
  if (!identification.name) {
    return {
      source: "JustTCG",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "No card name to search for.",
    };
  }

  try {
    const url = new URL(`${BASE_URL}/cards`);
    url.searchParams.set("game", "pokemon");
    url.searchParams.set("q", identification.name);
    url.searchParams.set("limit", "20");

    const res = await fetch(url, { headers: headers() });
    if (!res.ok) {
      return {
        source: "JustTCG",
        configured: false,
        raw: null,
        low: null,
        high: null,
        saleCount: null,
        asOf: null,
        note: `JustTCG lookup failed (${res.status}).`,
      };
    }
    const json = (await res.json()) as { data: JustTcgCard[] };
    const candidates = json.data ?? [];
    if (candidates.length === 0) {
      return {
        source: "JustTCG",
        configured: false,
        raw: null,
        low: null,
        high: null,
        saleCount: null,
        asOf: null,
        note: "No matching card found on JustTCG.",
      };
    }

    let best: JustTcgCard | null = null;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate, identification);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    // Require at least one strong (exact) match dimension — name, set, or
    // number — rather than confidently pricing the wrong printing of a card.
    if (!best || bestScore < 3) {
      return {
        source: "JustTCG",
        configured: false,
        raw: null,
        low: null,
        high: null,
        saleCount: null,
        asOf: null,
        note: "JustTCG results didn't confidently match this card's set/number.",
      };
    }

    const variant = pickVariant(best, identification.holoType);
    if (!variant) {
      return {
        source: "JustTCG",
        configured: false,
        raw: null,
        low: null,
        high: null,
        saleCount: null,
        asOf: null,
        note: `Found "${best.name}" on JustTCG, but it has no priced variants.`,
      };
    }

    return {
      source: "JustTCG",
      configured: true,
      raw: variant.price,
      low: variant.minPrice30d ?? variant.price,
      high: variant.maxPrice30d ?? variant.price,
      saleCount: null,
      asOf: new Date(variant.lastUpdated * 1000).toISOString(),
      note: null,
    };
  } catch (err) {
    console.error("JustTCG pricing lookup failed", err);
    return {
      source: "JustTCG",
      configured: false,
      raw: null,
      low: null,
      high: null,
      saleCount: null,
      asOf: null,
      note: "JustTCG lookup failed unexpectedly.",
    };
  }
}
