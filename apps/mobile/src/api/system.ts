import { apiRequest } from "./client";

export function getHealth() {
  return apiRequest<{ ok: boolean; claudeVisionConfigured: boolean }>("/api/health", { auth: false });
}
