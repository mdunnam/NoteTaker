/**
 * AWS Bedrock client for QNote
 * Uses Claude claude-sonnet-4-5 via Amazon Bedrock for all AI reasoning.
 */

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID = "us.anthropic.claude-sonnet-4-6";

function getBedrockClient(): BedrockRuntimeClient {
  const region = (process.env.AWS_REGION ?? "us-east-1").trim();
  if (!region) throw new Error("AWS_REGION env var is not set");
  return new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}

export interface BedrockMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Call Claude via Bedrock. Returns the text response.
 */
export async function invokeClaudeText(params: {
  system: string;
  messages: BedrockMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const client = getBedrockClient();

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.1,
    system: params.system,
    messages: params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const command = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  });

  const response = await client.send(command);
  const result = JSON.parse(Buffer.from(response.body).toString("utf-8"));

  const text = result?.content?.[0]?.text;
  if (!text) throw new Error("No text response from Bedrock Claude");
  return text;
}

/**
 * Call Claude via Bedrock expecting a JSON response.
 * Strips markdown code fences if present.
 */
export async function invokeClaudeJson<T = unknown>(params: {
  system: string;
  messages: BedrockMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const raw = await invokeClaudeText(params);
  // Strip markdown code fences if Claude wraps the JSON
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`Bedrock Claude returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}
