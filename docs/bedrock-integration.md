# AWS Bedrock Integration — QNote

How we wired Claude Sonnet 4.6 into QNote via AWS Bedrock.

---

## Why Bedrock

- OpenAI's `gpt-4o` was the original model, but the key in Vercel was configured for `gpt-5.4` which doesn't exist (or requires `max_completion_tokens` instead of `max_tokens` on a newer SDK version)
- Every note enrichment was silently falling back to dumb regex parsing — no real AI
- Bedrock gives us Claude directly, uses the same AWS IAM credentials already in the project, and keeps costs predictable

---

## Model

```
us.anthropic.claude-sonnet-4-6
```

The `us.` prefix is required for cross-region inference profiles in `us-east-1`. Without it you get:
> "Invocation of model ID anthropic.claude-sonnet-4-6 with on-demand throughput isn't supported."

---

## IAM Setup

The existing `qnote` IAM user needed **AmazonBedrockFullAccess** added.

1. AWS Console → IAM → Users → `qnote`
2. Add permissions → Attach policies directly → `AmazonBedrockFullAccess`

Also required: enable model access in Bedrock console.

1. AWS Console → Amazon Bedrock → Model access → Manage model access
2. Request access to `Claude Sonnet 4.6` (or whichever Claude model you want)
3. Wait for approval (usually instant for Anthropic models)

---

## Env Vars

Already in Vercel production — no new vars needed. Bedrock uses the same AWS credentials as S3/Transcribe:

| Var | Value |
|-----|-------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret |
| `AWS_REGION` | `us-east-1` |

> **Important:** All env vars must be set via the Vercel API (not `vercel env add` / `echo` piping) to avoid trailing newline corruption. Use `Invoke-RestMethod` with the Vercel API directly.

---

## The Client (`src/lib/bedrock.ts`)

```ts
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const MODEL_ID = "us.anthropic.claude-sonnet-4-6";

function getBedrockClient(): BedrockRuntimeClient {
  const region = (process.env.AWS_REGION ?? "us-east-1").trim();
  return new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
}
```

Key decisions:
- **Lazy factory** — client created at request time, not module load time. Avoids "region not accepted" / "credential not valid" errors on Vercel cold starts where env vars aren't available at module init.
- **No module-level singleton** — same pattern used for S3, Transcribe, Polly, Comprehend after fixing those same cold-start bugs.

### `invokeClaudeText` — raw text response

```ts
export async function invokeClaudeText(params: {
  system: string;
  messages: BedrockMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<string>
```

### `invokeClaudeJson<T>` — parsed JSON response

```ts
export async function invokeClaudeJson<T = unknown>(params: {
  system: string;
  messages: BedrockMessage[];
  maxTokens?: number;
  temperature?: number;
}): Promise<T>
```

Automatically strips markdown code fences (` ```json ... ``` `) that Claude sometimes wraps around JSON responses.

---

## Package

```bash
npm install @aws-sdk/client-bedrock-runtime
```

Already at `^3.1028.0` in `package.json` alongside the other AWS SDK clients.

---

## Where It's Used

| File | Function | Replaced |
|------|----------|----------|
| `src/lib/ai.ts` | `organizeNote()` | `openaiClient.chat.completions.create` (gpt-4o) |
| `src/lib/ai.ts` | `splitNote()` | `openaiClient.chat.completions.create` (gpt-4o) |
| `src/lib/ai.ts` | `synthesizeNotes()` | `openaiClient.chat.completions.create` (gpt-4o) |
| `src/lib/dailyDigest.ts` | `generateDailyDigest()` | `openaiClient.chat.completions.create` (gpt-4o) |

OpenAI is still used for **embeddings only** (`text-embedding-3-large`) — Bedrock's embedding story is weaker and semantic search was already working fine.

---

## Bedrock Request Format

Claude on Bedrock uses the Anthropic Messages API format wrapped in a Bedrock envelope:

```json
{
  "anthropic_version": "bedrock-2023-05-31",
  "max_tokens": 4096,
  "temperature": 0.1,
  "system": "...",
  "messages": [
    { "role": "user", "content": "..." }
  ]
}
```

Response shape:
```json
{
  "content": [{ "type": "text", "text": "..." }]
}
```

---

## Debugging Tips

### "region not accepted"
Env var has a trailing newline. Re-set via Vercel API:
```powershell
$body = @{ value = "us-east-1" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.vercel.com/v10/projects/$projectId/env/$envId" -Method Patch -Headers $headers -Body $body
```

### "Resolved credential object is not valid"
Same issue — `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` has a trailing newline. Re-set both via API.

### "Invocation of model ID ... with on-demand throughput isn't supported"
Use the cross-region inference profile prefix: `us.anthropic.claude-sonnet-4-6` not `anthropic.claude-sonnet-4-6`.

### "AccessDeniedException: not authorized to perform bedrock:InvokeModel"
Add `AmazonBedrockFullAccess` to the IAM user and enable model access in the Bedrock console.

### Testing a model ID locally
```js
// scripts/test-bedrock.mjs
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: "us-east-1",
  credentials: {
    accessKeyId: "YOUR_KEY",
    secretAccessKey: "YOUR_SECRET",
  },
});

const body = JSON.stringify({
  anthropic_version: "bedrock-2023-05-31",
  max_tokens: 20,
  messages: [{ role: "user", content: "Say OK" }],
});

const res = await client.send(new InvokeModelCommand({
  modelId: "us.anthropic.claude-sonnet-4-6",
  contentType: "application/json",
  accept: "application/json",
  body: Buffer.from(body),
}));

const result = JSON.parse(Buffer.from(res.body).toString());
console.log(result?.content?.[0]?.text); // "OK"
```

---

## Commit History

- `feat: swap AI reasoning to Claude Sonnet 4.6 via AWS Bedrock` — initial wiring
- `fix: lazy-init AWS clients to prevent 'region not accepted' error on cold start` — fixed S3/Transcribe/Polly/Comprehend with same pattern
