import type { CardIdentification, CollectionItemDTO, GradingResult, PricingResult, ScanRecordDTO } from "@pokedex-vault/shared";
import { apiRequest } from "./client";

export interface CollectionFilters {
  q?: string;
  rarity?: string;
  condition?: "Raw" | "Graded";
  gradingCompany?: string;
  minGrade?: number;
  maxGrade?: number;
  minPrice?: number;
  maxPrice?: number;
  sort?: "value_desc" | "value_asc" | "grade_desc" | "grade_asc" | "recent" | "oldest" | "alpha";
}

export function listCollection(filters: CollectionFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const qs = params.toString();
  return apiRequest<{ items: CollectionItemDTO[] }>(`/api/collection${qs ? `?${qs}` : ""}`);
}

export function getCollectionItem(id: string) {
  return apiRequest<{ item: CollectionItemDTO; scanHistory: ScanRecordDTO[] }>(`/api/collection/${id}`);
}

export interface CreateCollectionItemPayload {
  identification: CardIdentification;
  grading: GradingResult;
  pricing: PricingResult;
  frontImageUrl: string;
  backImageUrl: string;
  condition: "Raw" | "Graded";
  gradingCompany?: "PSA" | "TAG" | "BGS" | "CGC" | null;
  certNumber?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  notes?: string | null;
}

export function createCollectionItem(payload: CreateCollectionItemPayload) {
  return apiRequest<CollectionItemDTO>("/api/collection", { method: "POST", body: payload });
}

export interface PatchCollectionItemPayload {
  notes?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  condition?: "Raw" | "Graded";
  gradingCompany?: "PSA" | "TAG" | "BGS" | "CGC" | null;
  certNumber?: string | null;
  language?: string;
  holoType?: string;
  variant?: string | null;
  isPromo?: boolean;
  isFirstEditionOrShadowless?: boolean;
}

export function patchCollectionItem(id: string, payload: PatchCollectionItemPayload) {
  return apiRequest<CollectionItemDTO>(`/api/collection/${id}`, { method: "PATCH", body: payload });
}

export function deleteCollectionItem(id: string) {
  return apiRequest<void>(`/api/collection/${id}`, { method: "DELETE" });
}

export interface RescanPayload {
  identification: CardIdentification;
  grading: GradingResult;
  pricing: PricingResult;
  frontImageUrl: string;
  backImageUrl: string;
}

export function rescanCollectionItem(id: string, payload: RescanPayload) {
  return apiRequest<CollectionItemDTO>(`/api/collection/${id}/rescan`, { method: "POST", body: payload });
}
