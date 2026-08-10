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
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  // The public URL prefix scanned card photos are served from — either the
  // bucket's own r2.dev dev URL or a custom domain mapped to it, with no
  // trailing slash (e.g. "https://pub-abc123.r2.dev" or "https://cdn.example.com").
  r2PublicUrlBase: (process.env.R2_PUBLIC_URL_BASE ?? "").replace(/\/$/, ""),
};

export const isR2Configured = () =>
  env.r2AccountId.length > 0 && env.r2AccessKeyId.length > 0 && env.r2SecretAccessKey.length > 0 && env.r2BucketName.length > 0 && env.r2PublicUrlBase.length > 0;

export const isClaudeVisionConfigured = () => env.anthropicApiKey.length > 0;
