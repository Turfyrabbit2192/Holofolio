import { apiRequest } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export function register(email: string, password: string, displayName?: string) {
  return apiRequest<AuthResponse>("/api/auth/register", { method: "POST", body: { email, password, displayName }, auth: false });
}

export function login(email: string, password: string) {
  return apiRequest<AuthResponse>("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
}

export function me() {
  return apiRequest<AuthUser>("/api/auth/me");
}
