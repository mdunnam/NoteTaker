/**
 * AWS Comprehend utility for QNote
 * Enriches notes with sentiment, entities, and key phrases.
 */

import {
  ComprehendClient,
  DetectSentimentCommand,
  DetectEntitiesCommand,
  DetectKeyPhrasesCommand,
  LanguageCode,
} from "@aws-sdk/client-comprehend";

// Lazy client factory — reads env vars at request time, not module init
function getComprehendClient(): ComprehendClient {
  const region = (process.env.AWS_REGION ?? "us-east-1").trim();
  if (!region) throw new Error("AWS_REGION env var is not set");
  return new ComprehendClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export interface ComprehendInsights {
  sentiment: {
    label: string; // POSITIVE | NEGATIVE | NEUTRAL | MIXED
    scores: Record<string, number>;
  };
  entities: Array<{
    text: string;
    type: string;
    score: number;
  }>;
  keyPhrases: string[];
}

/**
 * Run sentiment, entity, and key phrase detection on a block of text.
 * Truncates to Comprehend's 5000 byte limit.
 */
export async function analyzeText(text: string): Promise<ComprehendInsights> {
  // Comprehend max is 5000 UTF-8 bytes
  const truncated = Buffer.from(text).slice(0, 4900).toString("utf-8");
  const lang = LanguageCode.EN;
  const comprehendClient = getComprehendClient();

  const [sentimentResult, entitiesResult, keyPhrasesResult] = await Promise.all([
    comprehendClient.send(new DetectSentimentCommand({ Text: truncated, LanguageCode: lang })),
    comprehendClient.send(new DetectEntitiesCommand({ Text: truncated, LanguageCode: lang })),
    comprehendClient.send(new DetectKeyPhrasesCommand({ Text: truncated, LanguageCode: lang })),
  ]);

  return {
    sentiment: {
      label: sentimentResult.Sentiment ?? "NEUTRAL",
      scores: {
        positive: sentimentResult.SentimentScore?.Positive ?? 0,
        negative: sentimentResult.SentimentScore?.Negative ?? 0,
        neutral: sentimentResult.SentimentScore?.Neutral ?? 0,
        mixed: sentimentResult.SentimentScore?.Mixed ?? 0,
      },
    },
    entities: (entitiesResult.Entities ?? [])
      .filter((e) => (e.Score ?? 0) > 0.8)
      .map((e) => ({
        text: e.Text ?? "",
        type: e.Type ?? "OTHER",
        score: e.Score ?? 0,
      })),
    keyPhrases: (keyPhrasesResult.KeyPhrases ?? [])
      .filter((kp) => (kp.Score ?? 0) > 0.9)
      .map((kp) => kp.Text ?? "")
      .filter(Boolean)
      .slice(0, 20),
  };
}
