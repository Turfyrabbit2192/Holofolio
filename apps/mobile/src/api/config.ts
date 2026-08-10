import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Resolves the API base URL. In priority order:
 * 1. EXPO_PUBLIC_API_URL, if set (use this for staging/production builds).
 * 2. The dev machine's LAN IP, inferred from the Expo dev server's host —
 *    works automatically for physical devices and Android/iOS simulators
 *    on the same network during `expo start`.
 * 3. localhost, as a last resort (web only).
 */
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri) {
    const host = String(hostUri).split(":")[0];
    if (host) return `http://${host}:4000`;
  }

  if (Platform.OS === "android") return "http://10.0.2.2:4000";
  return "http://localhost:4000";
}

export const API_BASE_URL = resolveApiUrl();
