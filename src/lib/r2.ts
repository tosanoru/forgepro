import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * R2 is S3-compatible, so the AWS SDK works against it unmodified — just
 * point endpoint at the account's R2 URL. Same direct-upload shape as Mux
 * in src/lib/mux.ts: the browser gets a presigned URL and PUTs straight to
 * storage, the file bytes never pass through our server.
 */
function client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY environment variables.");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucket() {
  const name = process.env.R2_BUCKET_NAME;
  if (!name) throw new Error("Missing R2_BUCKET_NAME environment variable.");
  return name;
}

/** Presigned PUT URL, valid for 10 minutes — used for direct browser upload. */
export async function createUploadUrl(key: string, contentType: string): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
  return getSignedUrl(client(), cmd, { expiresIn: 600 });
}

/**
 * Direct server-side upload — used when we already have the bytes in hand
 * (e.g. a generated thumbnail image), unlike Brand Assets/Video Review
 * where the browser uploads directly and we only ever hand out a
 * presigned URL. No presigning needed here since there's no browser leg.
 */
export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

/** Presigned GET URL, valid for 1 hour — used for downloads/previews rather than a public bucket. */
export async function createDownloadUrl(key: string): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(client(), cmd, { expiresIn: 3600 });
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}
