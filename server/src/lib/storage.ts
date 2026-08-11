import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env, isSupabaseStorageConfigured } from "../env";

let s3Client: S3Client | null = null;
function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      forcePathStyle: true,
      region: "us-east-1", // Supabase's S3-compatible API accepts this regardless of the project's actual region
      endpoint: `https://${env.supabaseProjectRef}.storage.supabase.co/storage/v1/s3`,
      credentials: { accessKeyId: env.supabaseS3AccessKeyId, secretAccessKey: env.supabaseS3SecretAccessKey },
    });
  }
  return s3Client;
}

/**
 * Saves a scanned card photo and returns its publicly-reachable URL.
 *
 * Uses Supabase Storage (via its S3-compatible API) when configured, since
 * most hosting platforms wipe local disk on every redeploy/restart —
 * without it, saved collection photos would disappear the next time the
 * server restarts. Falls back to local disk (served from /uploads) when
 * Supabase credentials aren't set, so local development keeps working
 * without requiring a Supabase project.
 */
export async function saveImage(buffer: Buffer, subdir: "originals" | "processed"): Promise<string> {
  const filename = `${uuid()}.jpg`;
  const jpeg = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();

  if (isSupabaseStorageConfigured()) {
    const key = `${subdir}/${filename}`;
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: env.supabaseStorageBucket,
        Key: key,
        Body: jpeg,
        ContentType: "image/jpeg",
      })
    );
    return `https://${env.supabaseProjectRef}.supabase.co/storage/v1/object/public/${encodeURIComponent(env.supabaseStorageBucket)}/${key}`;
  }

  const dir = path.join(env.uploadDir, subdir);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, jpeg);
  return `/uploads/${subdir}/${filename}`;
}
