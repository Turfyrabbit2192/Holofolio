import type { GradedPricePoint, PriceSourcePoint } from "@pokedex-vault/shared";
import { env } from "../../env";

function unconfigured(source: PriceSourcePoint["source"], note: string): PriceSourcePoint {
  return { source, configured: false, raw: null, low: null, high: null, saleCount: null, asOf: null, note };
}

let ebayToken: { token: string; expiresAt: number } | null = null;

async function getEbayToken(): Promise<string | null> {
  if (!env.ebayAppId || !env.ebayCertId) return null;
  if (ebayToken && ebayToken.expiresAt > Date.now()) return ebayToken.token;

  const basic = Buffer.from(`${env.ebayAppId}:${env.ebayCertId}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; expires_in: number };
  ebayToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in - 60) * 1000 };
  return ebayToken.token;
}

/**
 * eBay Browse API — active listing asking prices for the search query.
 * IMPORTANT: this is NOT sold/completed data. Confirmed sold comps require
 * eBay's Marketplace Insights API, which needs separate partner approval
 * that isn't configured here. We label the result accordingly rather than
 * implying it reflects real transactions.
 */
export async function fetchEbayPricing(query: string): Promise<PriceSourcePoint> {
  if (!env.ebayAppId || !env.ebayCertId) {
    return unconfigured("eBay", "eBay API credentials not configured on this server.");
  }
  try {
    const token = await getEbayToken();
    if (!token) return unconfigured("eBay", "Could not authenticate with eBay's API.");

    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", query);
    url.searchParams.set("category_ids", "183454"); // Pokémon Individual Cards
    url.searchParams.set("limit", "50");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return unconfigured("eBay", `eBay search failed (${res.status}).`);

    const json = (await res.json()) as { itemSummaries?: Array<{ price?: { value: string } }> };
    const prices = (json.itemSummaries ?? [])
      .map((i) => (i.price ? Number(i.price.value) : null))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (prices.length === 0) return unconfigured("eBay", "No current eBay listings matched this card.");

    prices.sort((a, b) => a - b);
    const low = prices[0];
    const high = prices[prices.length - 1];
    const mid = prices[Math.floor(prices.length / 2)];

    return {
      source: "eBay",
      configured: true,
      raw: mid,
      low,
      high,
      saleCount: prices.length,
      asOf: new Date().toISOString(),
      note: "Based on current active eBay listings (asking prices), not confirmed sold comps — the Marketplace Insights API for sold data isn't connected.",
    };
  } catch {
    return unconfigured("eBay", "eBay lookup failed unexpectedly.");
  }
}

const LOT_PATTERN = /\b(lot|bundle|set of|x\s?\d+|\d+\s*cards?)\b/i;
const MIN_GRADED_MATCHES = 3;

// Set names strongly associated with a MODERN reprint/reissue of an
// otherwise identically-named-and-numbered older card (the exact confusion
// that broke this before: eBay's free-text search matched a 1999 Base Set
// Charizard query to 2021 "Celebrations: Classic Collection" reprint
// listings, which share the same name and number but are a completely
// different, much cheaper card). A listing title is excluded if it mentions
// one of these AND the target card's own set name doesn't.
const REPRINT_SIGNAL_WORDS = ["celebrations", "classic collection", "25th anniversary", "mcdonald", "jumbo", "promo", "oversize"];

function looksLikeADifferentPrinting(title: string, targetSetName: string): boolean {
  const lowerTitle = title.toLowerCase();
  const lowerSet = targetSetName.toLowerCase();
  return REPRINT_SIGNAL_WORDS.some((word) => lowerTitle.includes(word) && !lowerSet.includes(word));
}

/**
 * Median asking price of current eBay listings for this exact card at a
 * specific grade. Only returns a result when at least MIN_GRADED_MATCHES
 * listings clear both the grade-in-title check and the different-printing
 * exclusion — the caller (see aggregator.ts's addEbayGradedComp) applies a
 * further sanity check against the card's known raw market value before
 * trusting this, since eBay's free-text search is loose enough that even
 * these filters can't guarantee a clean match.
 */
export async function fetchEbayGradedPrice(
  cardName: string,
  setName: string,
  cardNumber: string,
  grade: number
): Promise<{ value: number; sampleSize: number } | null> {
  if (!env.ebayAppId || !env.ebayCertId) return null;
  try {
    const token = await getEbayToken();
    if (!token) return null;

    const roundedGrade = Math.round(grade);
    const query = [cardName, cardNumber, setName, "PSA", String(roundedGrade)].filter(Boolean).join(" ");

    const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
    url.searchParams.set("q", query);
    url.searchParams.set("category_ids", "183454"); // Pokémon Individual Cards
    url.searchParams.set("limit", "50");

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;

    const json = (await res.json()) as { itemSummaries?: Array<{ title?: string; price?: { value: string } }> };
    const gradePattern = new RegExp(`psa\\s*-?\\s*${roundedGrade}\\b(?!\\.5)`, "i");

    const prices = (json.itemSummaries ?? [])
      .filter((item) => {
        const title = item.title ?? "";
        if (!gradePattern.test(title)) return false;
        if (LOT_PATTERN.test(title)) return false;
        if (looksLikeADifferentPrinting(title, setName)) return false;
        return true;
      })
      .map((item) => (item.price ? Number(item.price.value) : null))
      .filter((v): v is number => v !== null && Number.isFinite(v));

    if (prices.length < MIN_GRADED_MATCHES) return null;

    prices.sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    return { value: median, sampleSize: prices.length };
  } catch {
    return null;
  }
}

function toDollars(cents: unknown): number | null {
  return typeof cents === "number" && cents > 0 ? cents / 100 : null;
}

/**
 * PriceCharting public API (https://www.pricecharting.com/api-documentation),
 * `/api/product?q=`. Field names below are taken directly from PriceCharting's
 * published "Prices API: Description of Keys" table for the Cards category:
 *   loose-price        Ungraded
 *   graded-price        Graded 9 (generic, not company-specific)
 *   box-only-price      Graded 9.5 (generic)
 *   new-price           Graded 8 or 8.5 (generic)
 *   cib-price           Graded 7 or 7.5 (generic)
 *   manual-only-price   PSA 10 specifically
 *   bgs-10-price        BGS 10 specifically
 *   condition-17-price  CGC 10 specifically
 *   condition-18-price  SGC 10 specifically
 * Note: PriceCharting's API requires a paid subscription — a product can be
 * found by name/id while still returning no price fields if the token
 * doesn't carry pricing entitlement, which we treat as "not configured"
 * rather than guessing at a price.
 */
export async function fetchPriceChartingProduct(query: string): Promise<Record<string, unknown> | null> {
  if (!env.priceChartingToken) return null;
  const url = new URL("https://www.pricecharting.com/api/product");
  url.searchParams.set("t", env.priceChartingToken);
  url.searchParams.set("q", query);

  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  if (json.status !== "success") return null;
  return json;
}

export async function fetchPriceChartingPricing(query: string): Promise<PriceSourcePoint> {
  if (!env.priceChartingToken) {
    return unconfigured("PriceCharting", "PriceCharting API token not configured on this server.");
  }
  try {
    const json = await fetchPriceChartingProduct(query);
    if (!json) return unconfigured("PriceCharting", "No PriceCharting listing matched this card.");

    const raw = toDollars(json["loose-price"]);
    if (raw === null) {
      return unconfigured(
        "PriceCharting",
        `Found "${json["product-name"]}" on PriceCharting, but this API token's plan doesn't include price data.`
      );
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
  } catch {
    return unconfigured("PriceCharting", "PriceCharting lookup failed unexpectedly.");
  }
}

/** Builds the graded-price breakdown from a PriceCharting `/api/product` response, using their documented Cards field mapping. */
export function extractPriceChartingGradedPrices(json: Record<string, unknown> | null): GradedPricePoint[] {
  if (!json) return [];
  const points: GradedPricePoint[] = [
    { label: "PSA 10", company: "PSA", grade: 10, value: toDollars(json["manual-only-price"]), note: null },
    { label: "BGS 10", company: "BGS", grade: 10, value: toDollars(json["bgs-10-price"]), note: null },
    { label: "CGC 10", company: "CGC", grade: 10, value: toDollars(json["condition-17-price"]), note: null },
    { label: "SGC 10", company: "Generic", grade: 10, value: toDollars(json["condition-18-price"]), note: "SGC isn't one of this app's tracked companies — shown as a generic grade-10 comp." },
    {
      label: "Graded ~9.5",
      company: "Generic",
      grade: 9.5,
      value: toDollars(json["box-only-price"]),
      note: "PriceCharting's generic graded-9.5 bucket, not company-specific.",
    },
    {
      label: "Graded ~9",
      company: "Generic",
      grade: 9,
      value: toDollars(json["graded-price"]),
      note: "PriceCharting's generic graded-9 bucket, not company-specific.",
    },
    {
      label: "Graded ~8-8.5",
      company: "Generic",
      grade: 8.25,
      value: toDollars(json["new-price"]),
      note: "PriceCharting's generic graded-8/8.5 bucket, not company-specific.",
    },
    {
      label: "Graded ~7-7.5",
      company: "Generic",
      grade: 7.25,
      value: toDollars(json["cib-price"]),
      note: "PriceCharting's generic graded-7/7.5 bucket, not company-specific.",
    },
  ];
  return points.filter((p) => p.value !== null);
}

/** Collectr has no published public developer API at this time. */
export async function fetchCollectrPricing(): Promise<PriceSourcePoint> {
  return unconfigured("Collectr", "Collectr does not currently offer a public API to integrate with.");
}
