import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env, isR2Configured } from "../env";

let r2Client: S3Client | null = null;
function getR2Client(): S3Client {
  if (!r2Client) {
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.r2AccessKeyId, secretAccessKey: env.r2SecretAccessKey },
    });
  }
  return r2Client;
}

/**
 * Saves a scanned card photo and returns its publicly-reachable URL.
 *
 * Uses Cloudflare R2 (S3-compatible object storage) when configured, since
 * most hosting platforms wipe local disk on every redeploy/restart —
 * without R2, saved collection photos would disappear the next time the
 * server restarts. Falls back to local disk (served from /uploads) when R2
 * credentials aren't set, so local development keeps working without
 * requiring an R2 account.
 */
export async function saveImage(buffer: Buffer, subdir: "originals" | "processed"): Promise<string> {
  const filename = `${uuid()}.jpg`;
  const jpeg = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();

  if (isR2Configured()) {
    const key = `${subdir}/${filename}`;
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: env.r2BucketName,
        Key: key,
        Body: jpeg,
        ContentType: "image/jpeg",
      })
    );
    return `${env.r2PublicUrlBase}/${key}`;
  }

  const dir = path.join(env.uploadDir, subdir);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, jpeg);
  return `/uploads/${subdir}/${filename}`;
}
