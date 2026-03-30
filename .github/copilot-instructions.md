# Copilot Instructions for QNote

## Product Intent
- Build QNote as a capture-first, AI-assisted thinking system.
- Prioritize features that reduce mental load and improve daily usage.
- Favor fast capture, delayed organization, and confidence-based AI suggestions.

## Tech Stack
- Next.js App Router with TypeScript.
- Prisma with PostgreSQL and pgvector.
- NextAuth for authentication.
- Tailwind CSS for styling.

## Coding Standards
- Keep code simple, explicit, and readable.
- Follow existing folder and naming conventions.
- Avoid large refactors unless requested.
- Prefer minimal, targeted changes.
- Add JSDoc comments to exported functions and non-trivial logic.
- Keep comments short and useful.

## API and Data Rules
- Validate request inputs and AI outputs with Zod.
- Preserve backward compatibility for existing API routes when possible.
- For schema changes, update Prisma schema and include migration guidance.
- Avoid destructive data operations unless explicitly requested.

## UI and UX Rules
- Maintain existing visual language and component patterns.
- Optimize for desktop and mobile responsiveness.
- Prefer keyboard-friendly flows for inbox and triage interactions.
- Show AI confidence in a way that supports trust:
  - High confidence: auto-apply
  - Medium confidence: suggest
  - Low confidence: ask user

## AI Feature Priorities
- Prioritize current roadmap items in docs:
  - docs/IMPLEMENTATION.md
  - docs/PHASE3_IMPLEMENTATION_PLAN.md
- For immediate work, focus on:
  - Split notes into multiple cards
  - Right panel insights
  - Semantic search
  - Organize This Dump flow

## Testing and Verification
- Run targeted tests for changed areas.
- If tests are unavailable, verify behavior through the closest runnable path.
- Call out any unverified assumptions in the final response.

## Documentation
- When behavior changes, update relevant docs under docs/.
- Keep README links accurate when files move.

## Safety and Scope
- Do not add secrets or credentials to source control.
- Do not introduce new dependencies unless justified.
- If requirements are ambiguous, choose the smallest safe implementation.

## Commit Message Style
- Use Conventional Commits style when possible.
- Format: `type(scope): short summary`.
- Keep summary imperative and under 72 characters.
- Preferred types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Include scope for touched area, for example `notes`, `search`, `auth`, `prisma`, or `ui`.
- For breaking changes, include a `BREAKING CHANGE:` footer.

Examples:
- `feat(notes): add split note preview modal`
- `fix(search): handle empty semantic query safely`
- `docs(roadmap): move implementation docs into docs folder`

## Pull Request Checklist
- Keep changes focused and minimal for the stated task.
- Add or update tests for changed behavior when feasible.
- Run targeted verification for touched areas before opening PR.
- Confirm API input/output validation with Zod for new or changed routes.
- Confirm Prisma schema and migration guidance are included for data model changes.
- Update relevant docs under `docs/` and ensure README links still work.
- Include a short risk note and rollback approach in the PR description.
- Do not include secrets, tokens, or sensitive data in commits or PR text.
