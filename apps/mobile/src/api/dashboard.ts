import type { DashboardStats } from "@pokedex-vault/shared";
import { apiRequest } from "./client";

export function getDashboardStats() {
  return apiRequest<DashboardStats>("/api/dashboard");
}
