import type { PricingResult } from "@pokedex-vault/shared";
import { apiRequest } from "./client";

export interface CardSearchResult {
  id: string;
  name: string;
  number: string;
  set: { id: string; name: string; total: string | null; releaseDate: string | null };
  rarity: string | null;
  supertype: string;
  subtypes: string[];
  images: { small: string; large: string };
}

export function searchCards(name: string, opts: { number?: string; set?: string } = {}) {
  const params = new URLSearchParams({ name });
  if (opts.number) params.set("number", opts.number);
  if (opts.set) params.set("set", opts.set);
  return apiRequest<{ results: CardSearchResult[] }>(`/api/cards/search?${params.toString()}`);
}

export interface CardSet {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string | null;
  images: { symbol: string; logo: string };
}

export function fetchSets() {
  return apiRequest<{ sets: CardSet[] }>(`/api/cards/sets`);
}

export function fetchCardsBySet(setId: string) {
  return apiRequest<{ results: CardSearchResult[] }>(`/api/cards/sets/${encodeURIComponent(setId)}/cards`);
}

export function getCardPrice(id: string, holoType = "Non-Holo") {
  const params = new URLSearchParams({ holo: holoType });
  return apiRequest<{ card: CardSearchResult; pricing: PricingResult }>(`/api/cards/${id}/price?${params.toString()}`);
}
