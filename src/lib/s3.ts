/**
 * AWS S3 utility for QNote
 * Handles file uploads to the qnote-blinq S3 bucket.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION ?? "us-east-1";
const bucket = process.env.AWS_S3_BUCKET ?? "qnote-blinq";

export const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Upload a file buffer to S3.
 * Returns the S3 key (path) for the stored file.
 */
export async function uploadToS3(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
      Metadata: params.metadata,
    })
  );
  return params.key;
}

/**
 * Generate a pre-signed URL for temporary private access to an S3 object.
 * Default expiry: 1 hour.
 */
export async function getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

/**
 * Delete an object from S3.
 */
export async function deleteFromS3(key: string): Promise<void> {
  await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Build the S3 key for an imported file.
 * Format: imports/{userId}/{timestamp}-{filename}
 */
export function buildImportKey(userId: string, filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `imports/${userId}/${Date.now()}-${sanitized}`;
}
