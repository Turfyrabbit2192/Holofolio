import "dotenv/config";
import path from "path";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: required("JWT_SECRET", "dev-only-insecure-secret"),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  pokemonTcgIoApiKey: process.env.POKEMONTCG_IO_API_KEY ?? "",
  ebayAppId: process.env.EBAY_APP_ID ?? "",
  ebayCertId: process.env.EBAY_CERT_ID ?? "",
  priceChartingToken: process.env.PRICECHARTING_API_TOKEN ?? "",
  collectrApiKey: process.env.COLLECTR_API_KEY ?? "",
  justTcgApiKey: process.env.JUSTTCG_API_KEY ?? "",
  uploadDir: path.resolve(process.cwd(), process.env.UPLOAD_DIR ?? "./uploads"),
  // Supabase Storage, accessed via its S3-compatible API. Only the project
  // ref + bucket + S3 credentials are needed — both the S3 endpoint and the
  // public object URL are standardized Supabase URL patterns derived from
  // the project ref, confirmed live: https://<ref>.storage.supabase.co/storage/v1/s3
  // (S3 API, region "us-east-1" regardless of the project's actual region)
  // and https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<key> (public read).
  supabaseProjectRef: process.env.SUPABASE_PROJECT_REF ?? "",
  supabaseS3AccessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID ?? "",
  supabaseS3SecretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY ?? "",
  supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "",
};

export const isSupabaseStorageConfigured = () =>
  env.supabaseProjectRef.length > 0 &&
  env.supabaseS3AccessKeyId.length > 0 &&
  env.supabaseS3SecretAccessKey.length > 0 &&
  env.supabaseStorageBucket.length > 0;

export const isClaudeVisionConfigured = () => env.anthropicApiKey.length > 0;
