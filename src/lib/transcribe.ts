/**
 * AWS Transcribe utility for QNote
 * Converts audio files to text using Amazon Transcribe.
 */

import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
  TranscriptionJobStatus,
} from "@aws-sdk/client-transcribe";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { uploadToS3 } from "./s3";

// Lazy client factory — reads env vars at request time, not module init
function getTranscribeClient(): TranscribeClient {
  const region = (process.env.AWS_REGION ?? "us-east-1").trim();
  if (!region) throw new Error("AWS_REGION env var is not set");
  return new TranscribeClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Upload audio to S3, kick off a Transcribe job, poll until done, return transcript text.
 */
export async function transcribeAudio(params: {
  userId: string;
  audioBuffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<string> {
  const bucket = (process.env.AWS_S3_BUCKET ?? "qnote-blinq").trim();
  const transcribeClient = getTranscribeClient();
  const ext = params.filename.split(".").pop()?.toLowerCase() ?? "mp3";
  const key = `audio/${params.userId}/${Date.now()}-${params.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  // Upload audio to S3
  await uploadToS3({
    key,
    body: params.audioBuffer,
    contentType: params.mimeType,
    metadata: { userId: params.userId, originalName: params.filename },
  });

  const jobName = `qnote-${params.userId.slice(0, 8)}-${Date.now()}`;
  const mediaFormat = (["mp3", "mp4", "wav", "flac", "ogg", "amr", "webm"].includes(ext) ? ext : "mp3") as
    | "mp3" | "mp4" | "wav" | "flac" | "ogg" | "amr" | "webm";

  // Start transcription job
  await transcribeClient.send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: `s3://${bucket}/${key}` },
      MediaFormat: mediaFormat,
      LanguageCode: (process.env.AWS_TRANSCRIBE_LANGUAGE as "en-US") ?? "en-US",
      OutputBucketName: bucket,
      OutputKey: `transcripts/${jobName}.json`,
    })
  );

  // Poll for completion (max 5 minutes)
  const maxAttempts = 60;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 5000));

    const { TranscriptionJob: job } = await transcribeClient.send(
      new GetTranscriptionJobCommand({ TranscriptionJobName: jobName })
    );

    if (job?.TranscriptionJobStatus === TranscriptionJobStatus.COMPLETED) {
      // Fetch transcript JSON from S3 using SDK (bucket may block public access)
      const transcriptKey = `transcripts/${jobName}.json`;
      const s3 = new S3Client({
        region: (process.env.AWS_REGION ?? "us-east-1").trim(),
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
      const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: transcriptKey }));
      const body = await obj.Body?.transformToString();
      if (!body) throw new Error("Empty transcript response from S3");
      const json = JSON.parse(body);
      const transcript = json?.results?.transcripts?.[0]?.transcript ?? "";
      return transcript;
    }

    if (job?.TranscriptionJobStatus === TranscriptionJobStatus.FAILED) {
      throw new Error(`Transcription failed: ${job.FailureReason}`);
    }
  }

  throw new Error("Transcription timed out after 5 minutes");
}
