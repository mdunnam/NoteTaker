/**
 * AWS Polly utility for QNote
 * Converts text to speech using Amazon Polly.
 */

import { PollyClient, SynthesizeSpeechCommand, OutputFormat, Engine, TextType } from "@aws-sdk/client-polly";

// Lazy client factory — reads env vars at request time, not module init
function getPollyClient(): PollyClient {
  const region = (process.env.AWS_REGION ?? "us-east-1").trim();
  if (!region) throw new Error("AWS_REGION env var is not set");
  return new PollyClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

/**
 * Convert text to speech. Returns an MP3 audio buffer.
 * Uses neural engine for better quality.
 */
export async function synthesizeSpeech(params: {
  text: string;
  voiceId?: string;
}): Promise<Buffer> {
  const DEFAULT_VOICE = (process.env.AWS_POLLY_VOICE ?? "Joanna") as string;
  // Truncate to Polly's limit (3000 chars for standard, 6000 for SSML)
  const text = params.text.slice(0, 3000);

  const response = await getPollyClient().send(
    new SynthesizeSpeechCommand({
      Text: text,
      TextType: TextType.TEXT,
      OutputFormat: OutputFormat.MP3,
      VoiceId: (params.voiceId ?? DEFAULT_VOICE) as Parameters<typeof SynthesizeSpeechCommand>[0]["VoiceId"],
      Engine: Engine.NEURAL,
    })
  );

  if (!response.AudioStream) {
    throw new Error("No audio stream returned from Polly");
  }

  // Convert the readable stream to a Buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.AudioStream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
