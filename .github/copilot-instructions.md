# NoteTaker — Copilot Context

*Auto-generated from wiki brain on 2026-05-27.*
*This file is read automatically by GitHub Copilot Chat.*

## Tech Stack
Key packages: @ai-sdk/openai, @aws-sdk/client-bedrock-runtime, @aws-sdk/client-comprehend, @aws-sdk/client-polly, @aws-sdk/client-s3, @aws-sdk/client-transcribe, @aws-sdk/s3-request-presigner, @prisma/client, class-variance-authority, lucide-react

## Active Branch
`main`

## Recent Commits
```
f383047 fix: suppressHydrationWarning on date renders, add mobile-web-app-capable meta, fix favicon 404
4ebad76 docs: Bedrock integration guide â€” setup, model ID, IAM, debugging
44bd722 feat: inline answer input on Quick Questions in Daily Digest
42e4071 fix: clarification questions must be about THIS note only â€” no cross-note hallucination
4f36358 feat: swap AI reasoning to Claude Sonnet 4.6 via AWS Bedrock (us.anthropic.claude-sonnet-4-6)
0b22fea fix: use gpt-4o instead of nonexistent gpt-5.4 â€” AI enrichment was silently falling back to dumb text parsing
af34323 feat: 'Needs review' badge links to /review, sidebar shows live count badge
bb066b3 fix: voice notes get provisional title from transcript, clean rawContent (no prefix)
3df2952 fix: fetch transcript from S3 via SDK instead of public URL â€” fixes XML/AccessDenied error
ca90139 fix: lazy-init AWS clients to prevent 'region not accepted' error on cold start
```

## Wiki Knowledge
### qnote-roadmap
# QNote Roadmap

QNote development is organized into phases, with a focus on rapid capture and AI-driven organization.

- **Phase 1 (Complete)**: Foundation (Next.js, Prisma, Auth).
- **Phase 2 (Complete)**: Capture and Inbox (Universal capture, quick save, basic triage).
- **Phase 3 (Complete)**: AI Organization (Auto-titles, summaries, entity detection, task extraction, confidence scoring).

## Documentation
- **Master Phase Implementation Plan**: Canonical reference for project phases.
- **AI Training Opt-In Plan**: Privacy and data usage documentation.
- **Use Case Workflow**: Intended user journey and interaction patterns.

## Guidelines
- Follow existing patterns in this codebase — check recent commits for style
- Run tests after logic changes if they exist
- Never hardcode secrets — use env vars or AWS Secrets Manager
- Flag production-affecting changes explicitly before making them