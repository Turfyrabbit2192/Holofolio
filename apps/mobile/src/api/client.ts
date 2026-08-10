import { Platform } from "react-native";
import { API_BASE_URL } from "./config";
import { authStorage } from "./authStorage";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const json = await res.json();
    return json.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; formData?: FormData } = {}
): Promise<T> {
  const { method = "GET", body, auth = true, formData } = options;
  const headers: Record<string, string> = {};

  if (auth) {
    const token = await authStorage.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let requestBody: BodyInit | undefined;
  if (formData) {
    requestBody = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers, body: requestBody });

  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function imageUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}${path}`;
}

export interface ImagePart {
  uri: string;
  name: string;
  type: string;
}

/**
 * Builds a FormData-appendable file part from a local image URI. On native,
 * React Native's FormData polyfill understands `{uri, name, type}` objects
 * and streams the file directly. On web there is no such polyfill — real
 * browser FormData only accepts a Blob/File (anything else, including this
 * plain object, just gets String()-ified into a useless text field, so the
 * server silently receives no file at all) — so there we have to fetch the
 * uri (a blob:/data: URL from the camera/cropper/picker) into a real Blob
 * first.
 */
export async function toImagePart(uri: string, filename: string): Promise<Blob> {
  const ext = uri.split(".").pop()?.toLowerCase();
  const type = ext === "png" ? "image/png" : "image/jpeg";
  if (Platform.OS === "web") {
    const res = await fetch(uri);
    return await res.blob();
  }
  return { uri, name: filename, type } as unknown as Blob;
}
