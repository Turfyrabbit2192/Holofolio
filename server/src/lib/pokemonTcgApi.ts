import { env } from "../env";

const BASE_URL = "https://api.pokemontcg.io/v2";

export interface PokemonTcgPrice {
  low: number | null;
  mid: number | null;
  high: number | null;
  market: number | null;
  directLow: number | null;
}

export interface PokemonTcgCard {
  id: string;
  name: string;
  number: string;
  set: { id: string; name: string; total: string | null; releaseDate: string | null };
  rarity: string | null;
  supertype: string;
  subtypes: string[];
  images: { small: string; large: string };
  tcgplayer: { url: string; updatedAt: string; prices: Record<string, PokemonTcgPrice> } | null;
  cardmarket: { url: string; updatedAt: string; prices: Record<string, number | null> } | null;
}

export interface PokemonTcgSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string | null;
  images: { symbol: string; logo: string };
}

function headers(): Record<string, string> {
  return env.pokemonTcgIoApiKey ? { "X-Api-Key": env.pokemonTcgIoApiKey } : {};
}

function escapeQueryValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

/**
 * pokemontcg.io's free public API is prone to intermittent 500s — retrying
 * the exact same query moments later routinely succeeds (confirmed by hand:
 * the same request failed, then succeeded, then failed again on consecutive
 * tries). Only 5xx/network failures are retried; a 4xx means the request
 * itself is bad and retrying won't help.
 */
async function fetchWithRetry(url: URL, retries = 4): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: headers() });
      if (res.ok || res.status < 500) return res;
      lastError = new Error(`pokemontcg.io request failed: ${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function mapCard(raw: any): PokemonTcgCard {
  return {
    id: raw.id,
    name: raw.name,
    number: raw.number,
    set: {
      id: raw.set?.id ?? "",
      name: raw.set?.name ?? "",
      total: raw.set?.printedTotal ? String(raw.set.printedTotal) : raw.set?.total ? String(raw.set.total) : null,
      releaseDate: raw.set?.releaseDate ?? null,
    },
    rarity: raw.rarity ?? null,
    supertype: raw.supertype ?? "Pokémon",
    subtypes: raw.subtypes ?? [],
    images: { small: raw.images?.small ?? "", large: raw.images?.large ?? "" },
    tcgplayer: raw.tcgplayer
      ? {
          url: raw.tcgplayer.url,
          updatedAt: raw.tcgplayer.updatedAt,
          prices: raw.tcgplayer.prices ?? {},
        }
      : null,
    cardmarket: raw.cardmarket
      ? {
          url: raw.cardmarket.url,
          updatedAt: raw.cardmarket.updatedAt,
          prices: raw.cardmarket.prices ?? {},
        }
      : null,
  };
}

export async function searchCards(params: {
  name?: string;
  number?: string;
  set?: string;
  setId?: string;
  pageSize?: number;
}): Promise<PokemonTcgCard[]> {
  const clauses: string[] = [];
  if (params.name) clauses.push(`name:"${escapeQueryValue(params.name)}*"`);
  if (params.number) clauses.push(`number:"${escapeQueryValue(params.number)}"`);
  if (params.set) clauses.push(`set.name:"${escapeQueryValue(params.set)}*"`);
  if (params.setId) clauses.push(`set.id:"${escapeQueryValue(params.setId)}"`);

  if (clauses.length === 0) return [];

  const url = new URL(`${BASE_URL}/cards`);
  url.searchParams.set("q", clauses.join(" "));
  url.searchParams.set("pageSize", String(params.pageSize ?? 20));

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`pokemontcg.io search failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: any[] };
  return json.data.map(mapCard);
}

function mapSet(raw: any): PokemonTcgSet {
  return {
    id: raw.id,
    name: raw.name,
    series: raw.series ?? "",
    printedTotal: raw.printedTotal ?? 0,
    total: raw.total ?? 0,
    releaseDate: raw.releaseDate ?? null,
    images: { symbol: raw.images?.symbol ?? "", logo: raw.images?.logo ?? "" },
  };
}

/** Every set in the catalog (~170 at last count) — small enough to fetch in one page, newest first. */
export async function fetchAllSets(): Promise<PokemonTcgSet[]> {
  const url = new URL(`${BASE_URL}/sets`);
  url.searchParams.set("orderBy", "-releaseDate");
  url.searchParams.set("pageSize", "250");

  const res = await fetchWithRetry(url);
  if (!res.ok) {
    throw new Error(`pokemontcg.io sets lookup failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { data: any[] };
  return json.data.map(mapSet);
}

/** Sorts by the leading numeric part of the card number ("4" before "10"), falling back to plain text order for non-numeric numbers (some promos use letters). */
export function sortByCardNumber(cards: PokemonTcgCard[]): PokemonTcgCard[] {
  return [...cards].sort((a, b) => {
    const na = parseInt(a.number, 10);
    const nb = parseInt(b.number, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });
}

export async function getCardById(id: string): Promise<PokemonTcgCard | null> {
  const res = await fetchWithRetry(new URL(`${BASE_URL}/cards/${encodeURIComponent(id)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`pokemontcg.io lookup failed: ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { data: any };
  return mapCard(json.data);
}

/** Strips a "004/102"-style set number down to its leading numeric part, dropping any leading zeros, for loose comparison — pokemontcg.io stores numbers unpadded ("4") even for cards printed with padding ("004"). */
function normalizeCardNumber(raw: string): string {
  const leading = raw.split("/")[0]?.trim() ?? raw;
  return leading.replace(/^0+(?=\d)/, "").toLowerCase();
}

/** Loosely normalizes a set name for comparison, since the AI's transcription can differ from the catalog's exact text (e.g. "Scarlet and Violet" vs "Scarlet & Violet"). */
function normalizeSetName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreCandidate(card: PokemonTcgCard, input: { name: string; set?: string; cardNumber?: string }): number {
  let score = 0;
  const cardName = card.name.toLowerCase().trim();
  const wantName = input.name.toLowerCase().trim();
  if (cardName === wantName) score += 3;
  else if (cardName.includes(wantName) || wantName.includes(cardName)) score += 1.5;

  if (input.set) {
    const cardSet = normalizeSetName(card.set.name);
    const wantSet = normalizeSetName(input.set);
    if (cardSet === wantSet) score += 3;
    else if (cardSet.includes(wantSet) || wantSet.includes(cardSet)) score += 1.5;
  }

  if (input.cardNumber && normalizeCardNumber(card.number) === normalizeCardNumber(input.cardNumber)) {
    score += 3;
  }

  return score;
}

/**
 * Best-effort match of an AI/manual identification against the real card
 * catalog, used to enrich results with canonical set metadata, images, and
 * real pricing. Searches broadly by name only (pokemontcg.io's own
 * `set.name`/`number` query clauses do exact/prefix text matching, which is
 * brittle against how the AI transcribes things — e.g. it reports numbers
 * exactly as printed, "004", while the catalog stores them unpadded, "4";
 * and set names can be phrased slightly differently, "and" vs "&") and ranks
 * candidates client-side using normalized set + card-number comparisons.
 */
export async function findBestMatch(input: { name: string; set?: string; cardNumber?: string }): Promise<PokemonTcgCard | null> {
  if (!input.name) return null;
  try {
    const candidates = await searchCards({ name: input.name, pageSize: 250 });
    if (candidates.length === 0) return null;

    let best = candidates[0];
    let bestScore = scoreCandidate(best, input);
    for (const candidate of candidates.slice(1)) {
      const score = scoreCandidate(candidate, input);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  } catch (err) {
    console.warn("pokemontcg.io match failed after retries, continuing without a catalog match", err);
    return null;
  }
}

/** Picks the most relevant TCGplayer price bucket (holofoil / reverseHolofoil / normal / 1stEdition variants) for a card + holo type. */
export function pickTcgplayerPrice(card: PokemonTcgCard, holoType: string): PokemonTcgPrice | null {
  if (!card.tcgplayer) return null;
  const prices = card.tcgplayer.prices;
  const order =
    holoType === "Reverse Holo"
      ? ["reverseHolofoil", "holofoil", "normal", "unlimitedHolofoil", "1stEditionHolofoil"]
      : holoType === "Holo"
      ? ["holofoil", "1stEditionHolofoil", "unlimitedHolofoil", "reverseHolofoil", "normal"]
      : ["normal", "1stEdition", "unlimited", "holofoil", "reverseHolofoil"];
  for (const key of order) {
    if (prices[key]) return prices[key];
  }
  const firstKey = Object.keys(prices)[0];
  return firstKey ? prices[firstKey] : null;
}
