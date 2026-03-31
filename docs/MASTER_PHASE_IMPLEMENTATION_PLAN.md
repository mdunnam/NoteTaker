# QNote Master Phase Implementation Plan (Canonical)

This is the single-source implementation and roadmap document for QNote.

Scope:
- Includes current architecture, shipped features, product workflow, missing gaps, priority tiers, phased plan, acceptance criteria, and execution sequence.
- Excludes AI training policy/process details, which remain in `docs/AI_TRAINING_OPTIN_IMPLEMENTATION_PLAN.md`.

## 1. Product Definition

QNote is a capture-first, AI-assisted thinking system. It should not behave like static note storage. The product target is:

- fast capture with minimal friction,
- high-quality AI organization,
- explicit clarification when uncertain,
- memory-assisted personalization over time,
- resurfacing and synthesis that creates "memory payoff".

## 2. Current Product Boundary (Shipped)

Current boundary:
- capture,
- organize,
- clarify,
- regenerate,
- learn from hint interactions.

What is live now:

1. Core AI organization pipeline
- model-driven note organization with title, summary, intent, next action, priority, category, type, tags, tasks, entities, confidence
- low-confidence clarification questions
- split note generation for mixed input

2. Capture and triage
- capture bar with optional project/context hints
- inbox triage stream
- split and regenerate actions in cards
- bulk clarify + regenerate for selected notes

3. Personalization and learning
- per-user memory profile (projects, contexts, people, topics)
- memory-conditioned organization prompts
- chip-click confidence lift tracking
- hint effectiveness analytics in settings

4. Retrieval and relation
- embedding persistence in pgvector-compatible column
- semantic ranking path with fallback
- related note relation links
- contextual right panel on note detail

5. Reliability
- durable note enrichment queue (`NoteJob`)
- worker endpoint for processing and retries

## 3. Current Workflow (Intended)

1. Capture
- user writes/pastes a thought
- optional project/context hints included

2. First-pass organization
- note is created quickly
- AI enrichment processes in background

3. Clarification loop
- if confidence is low, questions + quick chips shown
- user clicks project/context hint
- note regenerates immediately with updated context

4. Bulk triage
- user selects multiple notes
- applies shared project/context hints
- runs clarify + regenerate batch

5. Detail review
- user opens note detail
- sees intent, next action, tasks, confidence state, related context

6. Learning visibility
- settings show hint usage and average confidence lift
- user sees what hints are actually improving model behavior

## 4. Architecture Summary

Stack:
- Next.js App Router + TypeScript
- Prisma + PostgreSQL + pgvector-compatible storage
- NextAuth credential auth
- Tailwind CSS UI

Major domains:
- Capture/API routes under `src/app/api`
- AI orchestration under `src/lib/ai.ts` and `src/lib/enrichNote.ts`
- User memory and hint telemetry under `src/lib/userMemory.ts`
- UI triage surfaces under `src/components/notes`
- Context panel under `src/components/layout/RightPanel.tsx`

## 5. API Surface (Current)

Main note APIs:
- `POST /api/notes`
- `GET /api/notes`
- `GET|PATCH|DELETE /api/notes/[id]`
- `POST /api/notes/[id]/split`
- `POST /api/notes/[id]/summary`
- `GET /api/notes/[id]/insights`

Search APIs:
- `POST /api/search/semantic`
- `POST /api/search/ask`

User/settings APIs:
- `PATCH /api/user`
- `GET /api/user/hint-stats`

System/worker APIs:
- `POST|GET /api/worker/enrich`

## 6. Data Model (Current)

Key models:
- `User`
- `UserPreferences`
- `Note`
- `NoteJob`
- `Collection`
- `Entity`
- `NoteEntity`
- `NoteRelation`
- `ApiKey`

Key note fields:
- core: `rawContent`, `title`, `summary`, `category`, `type`, `tags`
- AI context: `suggestedProject`, `extractedTasks`, `extractedDates`, `extractedEntities`, `aiMeta`
- confidence and triage: `status`, `confidenceScore`, `priority`
- retrieval: `embedding`
- UX: `isArchived`, `isPinned`, `collectionId`, `isSplitFrom`

User memory storage:
- `UserPreferences.thinkingMemory` JSON contains per-user memory buckets and hint stats

## 7. What Is Missing (Complete Gap Map)

### A. Immediate product gaps (explicit unfinished work)
1. Dedicated Organize This Dump flow (analyze + confirm create)
2. Dedicated Dump Mode UX and keyboard-first triage variant
3. Instrumentation dashboard for conversion and time metrics

### B. Surface completeness gaps
1. Several navigation routes still need full feature depth:
- Cards
- Projects
- Topics
- Timeline
- Favorites
- Archive
2. Search UX needs richer product behavior and ranking controls

### C. Memory payoff gaps (core differentiator not fully delivered)
1. Project/topic clustering from note activity
2. Forgotten-note resurfacing and repeated-pattern surfacing
3. Multi-note synthesis and auto-project generation
4. Contextual proactive suggestions beyond current right panel snapshots

### D. Capture surface gaps
1. Clipboard capture
2. Context-aware app/web capture
3. Global hotkey + desktop integration
4. Browser extension
5. Email-to-note
6. Mobile share sheet and offline-first sync
7. Voice and OCR inputs

### E. Platform maturity gaps
1. OAuth providers (Google/GitHub)
2. Multi-user collaboration/team features
3. Broader governance and enterprise controls

### F. Trust/learning infra gaps (training doc handles details)
1. Training consent implementation in product
2. Data deletion request flow
3. De-identification and export gates
4. Evaluation/rollback governance in production process

## 8. Priority Tiers (Ruthless)

### Must Have (fastest path to undeniable value)
1. Organize This Dump
2. True semantic search UX
3. Project/topic clustering
4. Resurfacing engine
5. Multi-note synthesis

### Should Have
1. Dump Mode + keyboard-first triage
2. Right panel depth upgrades
3. Instrumentation dashboards
4. Training-consent foundation
5. OAuth login options

### Nice to Have
1. Capture-from-anywhere stack
2. Desktop/global hotkey polish
3. Mobile/offline stack
4. Voice and OCR
5. Team collaboration

## 9. Recommended Execution Sequence

1. Organize This Dump
2. Search UX + relevance tuning
3. Project/topic clustering
4. Resurfacing
5. Multi-note synthesis
6. Instrumentation + consent foundation
7. Capture surfaces

## 10. Phase Plan (Detailed)

## Phase 3 (Complete foundation + close immediate gaps)

Delivered:
- split flow
- summary regeneration
- memory-aware organization
- clarification chips (inbox + detail)
- bulk clarify
- right panel contextual section
- hint effectiveness analytics

Remaining in this phase:
- Organize This Dump dedicated UX
- Dump Mode variant + keyboard-first triage
- instrumentation dashboard

Exit criteria:
- users can process messy dumps in one guided flow
- clarification rate drops over time for active users
- dashboard reports confidence lift and resolution time trends

## Phase 4 (System-level intelligence)

Targets:
- full semantic search product UX
- project/topic cluster detection
- richer right panel suggestions and link actions
- knowledge-page style grouping of repeated themes

Exit criteria:
- repeated themes auto-group into project/topic candidates
- search becomes meaning-first with clear relevance controls
- right panel influences triage decisions measurably

## Phase 5 (Memory payoff)

Targets:
- resurfacing forgotten notes at useful moments
- resurfacing repeated patterns and unresolved threads
- context-aware reminders tied to active work

Exit criteria:
- resurfaced-note reopen rate is positive and stable
- users report rediscovery value, not noise

## Phase 6 (Synthesis and planning)

Targets:
- multi-note synthesis output with actions
- planning mode (tasks, sequencing, dependencies)
- idea expansion mode and review mode loops

Exit criteria:
- synthesis outputs drive real follow-up actions
- users can convert note clusters into executable plans

## Phase 7 (Capture ubiquity)

Targets:
- desktop capture surfaces
- browser and email capture channels
- mobile/share-sheet capture

Exit criteria:
- users can capture from outside app with low friction
- inbound capture consistency stays high across surfaces

## 11. Metrics and Acceptance Criteria

Primary metrics:
1. Notes resolved without manual edit
2. Clarification rate trend by active user cohort
3. Confidence lift after hint interactions
4. Resurfaced-note reopen rate
5. Synthesis-to-action conversion rate

Operational metrics:
1. Enrichment queue latency and retry rates
2. Search relevance CTR and dwell time
3. Bulk triage completion time
4. Right panel interaction rate

Release gates per major phase:
- functional acceptance for each core path
- regression suite green
- build/deploy stability
- quality metrics non-regressing against previous baseline

## 12. Risks and Mitigations

1. Over-automation risk
- Mitigation: confidence-aware behavior and explicit clarification path

2. Prompt drift and model variance
- Mitigation: stable eval set and scorecard checks before prompt/model changes

3. Surface expansion before core payoff
- Mitigation: sequence by memory-payoff roadmap, not by channel count

4. Data trust concerns
- Mitigation: keep training implementation opt-in and separate (see training doc)

## 13. Canonical Related Docs

- AI training and governance details:
  - `docs/AI_TRAINING_OPTIN_IMPLEMENTATION_PLAN.md`

- This master plan supersedes older split planning docs for day-to-day execution.
