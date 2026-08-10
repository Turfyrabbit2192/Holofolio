import type { CardIdentification, GradingResult, ImageQualityReport, PricingResult } from "@pokedex-vault/shared";
import { apiRequest, ApiError, toImagePart } from "./client";
import { API_BASE_URL } from "./config";
import { authStorage } from "./authStorage";

export async function checkImageQuality(uri: string, side: "front" | "back") {
  const form = new FormData();
  form.append("image", await toImagePart(uri, `${side}.jpg`));
  form.append("side", side);
  return apiRequest<ImageQualityReport>("/api/scan/quality-check", { method: "POST", formData: form });
}

export interface ScanAnalyzeResult {
  identification: CardIdentification;
  grading: GradingResult;
  pricing: PricingResult;
  frontImageUrl: string;
  backImageUrl: string;
}

export interface ScanQualityFailure {
  error: string;
  frontQuality: ImageQualityReport;
  backQuality: ImageQualityReport;
}

export class ScanQualityError extends Error {
  frontQuality: ImageQualityReport;
  backQuality: ImageQualityReport;
  constructor(payload: ScanQualityFailure) {
    super(payload.error);
    this.frontQuality = payload.frontQuality;
    this.backQuality = payload.backQuality;
  }
}

export async function analyzeScan(frontUri: string, backUri: string): Promise<ScanAnalyzeResult> {
  const form = new FormData();
  form.append("front", await toImagePart(frontUri, "front.jpg"));
  form.append("back", await toImagePart(backUri, "back.jpg"));

  const token = await authStorage.getToken();
  const res = await fetch(`${API_BASE_URL}/api/scan/analyze`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  if (res.status === 422) {
    const payload = (await res.json()) as ScanQualityFailure;
    throw new ScanQualityError(payload);
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
    throw new ApiError(res.status, payload.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as ScanAnalyzeResult;
}
