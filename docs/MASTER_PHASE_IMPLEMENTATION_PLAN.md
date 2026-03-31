# QNote Master Phase Implementation Plan (Canonical)

This is the single-source implementation and roadmap document for QNote. Every shipped feature, every pending feature, every phase, every spec, every acceptance criterion is here. This document supersedes `IMPLEMENTATION.md`, `PHASE3_IMPLEMENTATION_PLAN.md`, and `USE_CASE_WORKFLOW.md`.

AI training policy details are separately documented in `docs/AI_TRAINING_OPTIN_IMPLEMENTATION_PLAN.md`.

Related docs:
- [AI Training Opt-In Plan](AI_TRAINING_OPTIN_IMPLEMENTATION_PLAN.md)

## 1. Product Definition

QNote is a capture-first, AI-assisted thinking system. It is not a passive note archive.

The product target:
- accept raw, messy, mixed input instantly with no friction
- infer intent, structure, and priority automatically
- ask for clarification only when the AI is uncertain
- learn from the user's corrections and hint signals over time
- resurface forgotten thinking at the right moment
- synthesize across notes to show patterns the user cannot see manually

The product wins when users say: *"I forgot I even wrote that, and it brought it back because it connected to what I am working on right now."*

## 2. Current Engineering State (2026-03-30)

### 2.1 Delivery Status

- Core AI organization pipeline: title, summary, intent, next action, priority, category, type, tags, tasks, entities, confidence
- Low-confidence clarification questions generated automatically
- Split note generation for mixed multitopic input
- Capture bar with optional project/context hints at save time
- Inbox triage stream with split and regenerate card actions
- Bulk clarify and regenerate for selected note batches
- Per-user memory profile: projects, contexts, people, topics
- Organization prompts conditioned on per-user memory
- Chip-click confidence lift tracking
- Hint effectiveness analytics in settings
- Embedding persistence into pgvector-compatible column
- Semantic ranking with on-the-fly keyword fallback
- Related note relation links
- Contextual right panel on note detail routes
- Durable enrichment queue (`NoteJob`) with worker retry loop

### 2.2 Current Product Boundary

Shipped:
- capture, organize, clarify, regenerate, learn from hint interactions

Not yet shipped:
- Organize This Dump dedicated flow
- Dump Mode UX
- Instrumentation dashboard
- Full surface depth for Cards, Projects, Topics, Timeline, Favorites, Archive
- Project/topic cluster detection
- Smart resurfacing
- Multi-note synthesis
- Capture from outside the app

---

## 3. Intended User Workflow

### 3.1 Primary Journey

**Step 1 — Fast Capture**

User writes or pastes a raw thought into the Capture Bar.
Optional at save time: project hint, context hint, tags.
Note is created immediately. AI organization runs in background.

**Step 2 — First-Pass AI Organization**

AI produces: title, interpretive summary, intent, next action, priority, extracted tasks, entities, confidence score.

Expected behavior by confidence tier:
- High confidence: auto-applied. No user action needed.
- Medium confidence: shown as a suggestion. Quick review recommended.
- Low confidence: clarification questions appear. User provides a chip hint.

**Step 3 — Clarification Loop**

When confidence is low:
- inbox cards and note detail show the AI's clarification questions
- quick project/context chip buttons appear
- user clicks one hint
- note regenerates immediately with updated context
- confidence, intent, and category all improve from the re-run

**Step 4 — Bulk Clarify During Triage**

For batches of related notes:
- user selects multiple inbox notes
- picks shared project/context hints from dropdowns
- runs "Clarify + Regenerate"
- all selected notes regenerate with the shared context
- consistent classification across the cluster

**Step 5 — Contextual Review in Note Detail**

On the note detail route:
- main content shows summary, intent, next action, tasks, confidence state
- RightPanel shows contextual related notes and note-level guidance
- user understands why the note matters, and what to do next

**Step 6 — Learning Feedback Visibility**

In Settings:
- hint effectiveness table shows per-hint uses and average confidence lift
- user can see if the system is actually improving from their corrections

### 3.2 Day-to-Day Workflow Pattern

Morning:
- capture 10–20 mixed notes quickly
- AI organizes in background

Midday triage:
- open inbox
- resolve low-confidence notes with chip hints
- bulk clarify any grouped cluster

Execution:
- open high-priority notes
- follow next-action guidance
- work through extracted tasks

Reflection:
- check related/contextual notes in RightPanel
- revisit unresolved low-confidence items

### 3.3 Confidence-State Behavior

High confidence:
- auto-applied behavior. No user action needed.

Medium confidence:
- suggestion chips shown. Quick review recommended.

Low confidence:
- clarification questions shown. User must provide a hint or edit manually.

### 3.4 Success Criteria for Current Workflow

- Low-confidence notes trend downward over time for active users
- Average confidence lift from hints stays positive
- Manual correction time per note decreases
- Users can triage a full inbox in under 10 minutes

---

## 4. Architecture

### 4.1 Tech Stack

- Next.js App Router + TypeScript
- Prisma + PostgreSQL + pgvector extension
- NextAuth.js credential auth
- Tailwind CSS
- OpenAI (organization, embedding, splitting)
- Zod (request/response validation)
- Vitest (unit tests)

### 4.2 Project Structure

```
src/
  app/
    (app)/
      layout.tsx                     # App shell: sidebar, capture bar, right panel
      inbox/page.tsx                 # Main triage view
      notes/[id]/page.tsx            # Note detail
      cards/page.tsx                 # Card grid (placeholder)
      projects/page.tsx              # Projects view (placeholder)
      topics/page.tsx                # Topics view (placeholder)
      timeline/page.tsx              # Timeline (placeholder)
      search/page.tsx                # Search (partial)
      favorites/page.tsx             # Favorites (placeholder)
      archive/page.tsx               # Archive (placeholder)
      settings/page.tsx              # Settings + hint analytics
      collections/page.tsx           # Collections view
    api/
      notes/route.ts                 # GET, POST notes
      notes/[id]/route.ts            # PATCH, DELETE single note
      notes/[id]/split/route.ts      # POST preview/create split
      notes/[id]/summary/route.ts    # POST regenerate AI summary
      notes/[id]/insights/route.ts   # GET contextual note insights
      search/semantic/route.ts       # POST semantic search
      search/ask/route.ts            # POST conversational ask
      auth/signup/route.ts           # POST create user
      user/route.ts                  # PATCH user profile
      user/hint-stats/route.ts       # GET hint effectiveness stats
      worker/enrich/route.ts         # POST/GET enrichment worker
    login/page.tsx
    signup/page.tsx
    layout.tsx                       # Root layout + NextAuth provider
    globals.css

  components/
    layout/
      Sidebar.tsx
      CaptureBar.tsx
      RightPanel.tsx
    notes/
      NoteCard.tsx
      InboxStream.tsx
      InboxFilterBar.tsx
      NoteDetailClient.tsx
    search/
      SearchClient.tsx
      AskPanel.tsx
    settings/
      SettingsClient.tsx
      HintEffectivenessPanel.tsx
    collections/
      CollectionsClient.tsx
    landing/
      LandingPageClient.tsx

  lib/
    ai.ts                            # organizeNote, splitNote, embedNote
    enrichNote.ts                    # full enrichment pipeline
    db.ts                            # Prisma client singleton
    userMemory.ts                    # memory CRUD + hint stats
    searchRanking.ts                 # semantic + keyword blending
    rateLimit.ts                     # per-user API rate limiting
    stripe.ts                        # billing (placeholder)

  auth.ts                            # NextAuth config

prisma/
  schema.prisma
  migrations/
```

### 4.3 Key Files to Know

- `src/lib/ai.ts` — all AI functions: organize, split, embed
- `src/lib/userMemory.ts` — per-user memory buckets and hint telemetry
- `src/lib/enrichNote.ts` — full pipeline called by the worker
- `src/app/api/notes/route.ts` — note creation with AI trigger
- `src/components/layout/CaptureBar.tsx` — the primary capture surface
- `prisma/schema.prisma` — data model

---

## 5. API Surface (Complete)

### Note CRUD
```
POST   /api/notes                    Create note, triggers async enrichment
GET    /api/notes                    List notes with filters
GET    /api/notes/[id]               Get single note
PATCH  /api/notes/[id]               Update note fields
DELETE /api/notes/[id]               Delete note
```

### AI Operations
```
POST   /api/notes/[id]/split         Preview or create split cards
POST   /api/notes/[id]/summary       Regenerate AI organization and confidence
GET    /api/notes/[id]/insights      Get related notes, tasks, entities for detail view
```

### Search
```
POST   /api/search/semantic          Semantic vector search with optional keyword fallback
POST   /api/search/ask               Conversational question against note corpus
```

### User
```
PATCH  /api/user                     Update profile (name)
GET    /api/user/hint-stats          Get per-hint usage and confidence lift stats
```

### Auth
```
POST   /api/auth/signup              Create new account
POST   /api/auth/[...nextauth]       NextAuth session handler
```

### System
```
POST   /api/worker/enrich            Trigger enrichment batch
GET    /api/worker/enrich            Check worker status
```

---

## 6. Data Model (Complete)

### Models

```
User
  id, email, password (hashed), name, createdAt, updatedAt
  → notes, collections, entities, preferences, apiKeys

UserPreferences
  id, userId
  defaultCollection, theme
  thinkingMemory (JSON — knownProjects, knownContexts, knownPeople, knownTopics, hintStats)
  createdAt, updatedAt

Note
  id, userId
  rawContent (never mutated), title, summary
  category, type (TASK | IDEA | NOTE | REFERENCE | DECISION)
  tags[], suggestedProject
  extractedTasks (JSON), extractedDates (JSON), extractedEntities (JSON)
  status (UNPROCESSED | PROCESSING | PROCESSED)
  confidenceScore (0–1), priority (high | medium | low)
  aiMeta (JSON — intent, nextAction, clarificationQuestions)
  embedding (vector 1536 — pgvector)
  isArchived, isPinned, isSplitFrom
  collectionId
  createdAt, updatedAt

NoteJob
  id, noteId, userId
  status (PENDING | PROCESSING | DONE | FAILED)
  attempts, maxAttempts, lastError
  scheduledAt, processedAt, createdAt

Collection
  id, userId, name, description, color, icon
  createdAt, updatedAt

Entity
  id, userId, name, type, canonical
  createdAt, updatedAt

NoteEntity (junction)
  noteId, entityId, confidence, context

NoteRelation
  id, sourceId, targetId, type, strength
  createdAt

ApiKey
  id, userId, key (hashed), name, lastUsed, createdAt
```

### User Memory Shape (`thinkingMemory` JSON field)

```json
{
  "knownProjects": [{ "name": "string", "count": 5, "lastSeen": "ISO date" }],
  "knownContexts": [{ "name": "string", "count": 3, "lastSeen": "ISO date" }],
  "knownPeople":   [{ "name": "string", "count": 2, "lastSeen": "ISO date" }],
  "knownTopics":   [{ "name": "string", "count": 7, "lastSeen": "ISO date" }],
  "hintStats": [
    {
      "hint": "QNote",
      "kind": "project",
      "uses": 12,
      "totalConfidenceLift": 2.4,
      "lastUsed": "ISO date"
    }
  ]
}
```

---

## 7. Dependencies

```
Core:      next, react, react-dom, typescript
Auth:      next-auth, bcryptjs
Database:  @prisma/client, prisma
AI:        ai, openai, @ai-sdk/openai, zod
Styling:   tailwindcss, autoprefixer, postcss, lucide-react
Dev:       eslint, vitest, @types/*
```

---

## 8. Setup and Dev Instructions

### Prerequisites

- Node.js 18+
- PostgreSQL with pgvector extension
- OpenAI API key

### Database options

1. Vercel Postgres (recommended for v1): https://vercel.com/docs/storage/postgres
2. Neon (free tier): https://neon.tech
3. Local PostgreSQL: `createdb qnote`

Enable pgvector on your database before migrating:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### .env.local

```env
DATABASE_URL="postgresql://user:password@host:5432/qnote"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="run: openssl rand -base64 32"
OPENAI_API_KEY="sk-..."
```

### Run

```bash
npm install
npm run db:migrate
npm run dev
# open http://localhost:3000
```

### Verify AI works

```bash
node -e "
const { organizeNote } = require('./src/lib/ai');
organizeNote('call jim about invoices, look into unreal plugin crash, daughter needs school form friday').then(console.log);
"
```

---

## 9. Test Instructions

### Manual flow

1. Sign up with any email/password
2. Capture: `Call Jim about invoices, look into Unreal plugin crash, daughter needs school form Friday`
3. Click Save — AI processes in background
4. Check Inbox — note should appear with title, summary, category, tasks, entities, confidence score
5. If confidence is low, click a project chip — note regenerates with improved confidence

### Test split

Capture: `1. Call client  2. Fix database bug  3. Brainstorm feature X  4. Buy groceries`
- Expect split suggestion
- Click split in card — review modal opens
- Accept all or select individual cards

### Test bulk clarify

- Capture 3–4 notes on the same topic without hints
- Select all in inbox — choose shared project hint — click Clarify + Regenerate
- All notes should regenerate with consistent classification

### Test semantic search

- Capture notes about payments, invoices, billing
- Search "billing issues" — should surface those notes without exact keyword match

### Automated tests

```bash
npm run test                                 # all tests
npm run test -- src/app/api/notes            # targeted
```

---

## 10. Phase 3 — Remaining Work

Phase 3 is partially delivered. Shipped items are listed in section 2.1. Three items remain.

---

### 10.1 Organize This Dump (Must Have — Priority 1)

**Goal**: User pastes a brain dump, meeting notes, email, or raw block — AI splits and organizes it — user reviews and confirms before anything is created.

**Why it matters**: This is the product's clearest differentiator. It collapses hours of manual cleanup into one guided flow.

#### API

`POST /api/notes/analyze-dump`
- Input (Zod validated): `{ rawText: string }`
- Runs `splitNote()` then `organizeNote()` on each split in parallel
- Returns preview — nothing is created yet
- Response:
```json
{
  "splits": [
    {
      "title": "Fix database bug",
      "summary": "Performance regression on user query path",
      "category": "Work",
      "type": "TASK",
      "priority": "high",
      "tags": ["backend", "performance"],
      "extractedTasks": [{ "text": "Profile query plan", "dueDate": null }]
    }
  ]
}
```

`POST /api/notes/analyze-dump/confirm`
- Input: `{ splits: OrganizedNote[] }`
- Creates all selected notes in a transaction
- Rolls back if any creation fails
- Returns: `{ created: NoteId[] }`

#### UI

Button in CaptureBar or Sidebar: "Organize This Dump" — opens two-step modal.

Step 1 — Paste modal:
- Large textarea with placeholder: "Paste meeting notes, brain dump, email, anything..."
- "Analyze" button
- Loading state: "AI is reading your dump..."

Step 2 — Preview modal:
- Header: "Found N items"
- One card per split:
  - Editable title (inline)
  - Category badge + Type badge
  - Priority badge
  - First extracted task preview
  - Checkbox to include/exclude this card
- Buttons: "Create All", "Edit & Create", "Cancel"

"Edit & Create" mode:
- Each card expands inline for editing title, category, priority before creating

Post-create:
- Toast: "Created N notes"
- "View all in inbox" link

#### Testing

- 5-line mixed brain dump → expect 2–4 splits with meaningful titles
- Meeting transcript → expect action items extracted per person
- Slack thread dump → expect categorized work items
- Verify transaction rolls back if one creation fails
- Verify "Cancel" at preview stage creates nothing

---

### 10.2 Dump Mode Capture Variant (Should Have — Priority 2)

**Goal**: Stripped-down capture for zero-friction brain dumping. No categorization UI. AI handles everything after save.

#### UI

Toggle in CaptureBar (or Settings → Capture preferences): "Dump Mode" checkbox.

When Dump Mode is ON:
- Save button becomes "Dump It"
- Tags field hidden
- Textarea grows larger
- Placeholder: "Brain dump here. We'll organize it."

After save:
- Toast: "Organizing your dump..."
- When enrichment completes: "Done — N notes ready"
- Click toast → inbox filtered to new notes

Keyboard-first triage shortcuts in inbox:
- `A` — accept AI suggestions on focused card
- `E` — inline edit on focused card
- `S` — trigger split on focused card
- `P` — pin focused card
- `D` — delete focused card
- `→` or `J` — next card
- `←` or `K` — previous card
- `?` — show shortcut legend overlay

#### API

`POST /api/notes` accepts optional `dumpMode: true`.
When true:
- skip categorization blocking validation
- create note immediately
- tag note with `dumpMode: true` for analytics
- enrichment runs async as normal

#### Database

```prisma
model Note {
  // add:
  dumpMode  Boolean  @default(false)
}
```

Migration:
```sql
ALTER TABLE "Note" ADD COLUMN "dumpMode" BOOLEAN NOT NULL DEFAULT false;
```

#### Testing

- Toggle Dump Mode, capture messy multi-topic note
- Confirm note created immediately without blocking
- Confirm enrichment runs async
- Test all keyboard shortcut bindings in inbox

---

### 10.3 Instrumentation Dashboard (Should Have — Priority 3)

**Goal**: Make AI performance measurable — for the user and the product team.

#### Metrics to track

Per-user:
- Clarification rate: % of notes requiring a chip click after first enrichment
- Average confidence on first pass
- Average confidence after clarification
- Average confidence lift per hint interaction
- Time from capture to PROCESSED status
- Manual edit rate after enrichment

#### API

`GET /api/user/stats`

Response:
```json
{
  "totalNotes": 142,
  "clarificationRate": 0.31,
  "avgFirstPassConfidence": 0.61,
  "avgPostClarificationConfidence": 0.84,
  "avgEnrichmentLatencyMs": 1820,
  "manualEditRate": 0.08
}
```

#### UI

New section in Settings: "AI Performance"

Cards showing:
- First-pass confidence (numeric with trend arrow)
- Clarification rate (% with trend arrow — should fall over time)
- Confidence lift from hints (your top-performing hints)
- Avg enrichment time (seconds)

Persisted history:
- Store one daily `UserMetricSnapshot` row per user
- Use last 30 daily snapshots to render inline sparklines on performance cards
- Keep trend arrows based on 7-day vs 30-day comparison while the sparkline shows the actual month shape

Existing hint effectiveness table stays below this section.

#### Testing

- Capture 10+ notes, verify stats update correctly
- Verify clarification rate increments each time a chip is clicked
- Verify confidence lift stats match hint-stats data

---

## 11. Phase 4 — System-Level Intelligence

**Goal**: Convert note activity into structured systems. Notes stop being individual units and become signals in a thinking graph.

---

### 11.1 Semantic Search UX (Must Have — Priority 1)

Current state: backend search endpoint exists with keyword fallback. Search page is a placeholder.

#### API (update `POST /api/search/semantic`)

- Accept: `{ query: string, limit?: number, filters?: { category?, type?, tags? } }`
- Return: ranked results with similarity score, matched snippet, highlight positions
- Support optional keyword boost alongside vector score

#### UI

Replace placeholder `/search` page:

Search input:
- Large prominent input at top of page
- Default mode: "Semantic"
- Toggle: switch to keyword mode
- Typeahead: top 3 related notes shown as user types (debounced 300ms)

Results list per note:
- Title
- Highlighted matched snippet
- Category badge
- Capture date
- Similarity % on right
- Click → opens note detail

Empty state:
- "No results" message with example queries to try
- "Try keyword mode" fallback suggestion

Filters sidebar:
- Category, type, date range, tags
- Active filters shown as removable chips above results

#### Testing

- Search "billing issues" → finds notes about payments, invoices, Stripe
- Search "team discussion" → finds notes about people and collaboration
- Test with 0, 1, and 50+ notes in corpus
- Test filter combinations
- Test typeahead debounce

---

### 11.2 Project/Topic Cluster Detection (Must Have — Priority 2)

**Goal**: Detect when 5+ notes share a common theme and suggest a project or topic group.

#### Detection logic

Run on enrichment completion and on a periodic background scan:
- Group notes by `suggestedProject` and `extractedEntities` of type PROJECT or TOPIC
- Find clusters where an entity appears in 5+ notes within the last 30 days
- Score cluster: note count + recency + entity type weight + embedding proximity
- Emit cluster suggestion when score exceeds threshold

#### API

`GET /api/clusters`

Response:
```json
{
  "clusters": [
    {
      "label": "QNote AI",
      "kind": "project",
      "noteCount": 9,
      "strength": 0.87,
      "noteIds": ["..."],
      "suggestedAction": "Create project"
    }
  ]
}
```

`POST /api/clusters/accept`
- Input: `{ label, kind, noteIds }`
- Creates a Collection and links all matching notes
- Returns: `{ collectionId }`

#### UI

RightPanel global section: "Clusters Detected"
- Top 2–3 candidates shown
- Each: label + note count + "Create project" button
- Dismiss option — suppresses that cluster for 7 days

Inbox header: soft suggestion banner for high-strength clusters
- "You have 7 notes about QNote AI. Group them?"
- Accept → create collection and link notes

#### Testing

- Capture 8 notes mentioning same project → cluster should appear after enrichment
- Accept cluster → verify collection created and notes linked
- Dismiss → verify it suppresses for 7 days

---

### 11.3 Right Panel Depth Upgrade (Should Have — Priority 3)

Current state: contextual RightPanel on note detail shows intent, next action, tasks, related notes, clarification questions.

New sections to add:

**Unresolved threads:**
- "You've mentioned this 3 times without resolution"
- Links to prior notes on same theme
- "Synthesize these" quick action

**Suggested links:**
- Notes that semantically cluster with this one but are not yet linked
- "These 2 notes seem related"
- Accept link button

**Conversion actions:**
- "Turn this into a project" (when note has 3+ tasks and coherent goal)
- "Split this note" (when note covers 2+ unrelated topics)
- "Add to collection" dropdown

**Global panel additions (non-detail routes):**
- Priority queue: top 3 high-priority uncompleted tasks
- Needs clarification: notes still under 0.5 confidence
- Cluster suggestions: top detected project/topic candidates

---

### 11.4 Knowledge Pages (Nice to Have)

**Goal**: For repeatedly-mentioned entities, auto-assemble a structured reference page.

Each knowledge page:
- All notes referencing the entity
- Timeline of mentions (oldest → newest)
- Extracted insights and patterns across those notes
- Related people and projects
- Unresolved questions

Example: "Unreal Plugin Crash" → one page with every note, every attempted fix, every related person, every open question.

#### API

`GET /api/topics/[entity]/page` — returns assembled knowledge page data

#### UI

Topic detail at `/topics/[slug]`:
- Header: entity name + type badge
- Chronological note timeline
- Insights panel
- Unresolved threads section

#### Testing

- Mention same topic in 5+ notes → topic page assembles
- Verify timeline order is correct
- Verify related notes are semantically relevant

---

### 11.5 Focus Mode (Nice to Have)

Filter entire app to a single project or topic.

- Keyboard shortcut or sidebar button toggles Focus Mode
- When on: inbox, search, RightPanel all scoped to selected project/topic
- Sidebar shows scoped note count and completion percentage
- Related past notes surface prominently

---

## 12. Phase 5 — Memory Payoff (Smart Resurfacing)

**Goal**: Make users rediscover their own thinking at the right moment. This is the "holy shit" moment.

---

### 12.1 Pattern Resurfacing

Detect repeated themes across time windows.

Logic:
- Weekly: find entities/tags appearing in 5+ notes
- Surface: "You've written about pricing 5 times this week"
- Group related notes under the detected pattern

API: `GET /api/resurface/patterns`
UI: RightPanel section — "Patterns in your thinking"

---

### 12.2 Forgotten Note Resurfacing

Surface notes captured and never revisited.

Logic:
- Notes older than 14 days, status PROCESSED, never opened in detail view
- Weight by: unresolved tasks remaining, original priority, entity overlap with recent notes
- Cap at 3 suggestions to avoid noise

API: `GET /api/resurface/forgotten`

Response:
```json
{
  "notes": [
    { "id": "...", "title": "...", "daysSinceCaptured": 18, "reason": "3 unresolved tasks" }
  ]
}
```

UI:
- Inbox section: "From the past" — up to 3 cards
- RightPanel on note detail: "You wrote about this before" when topics overlap with current note

Database change needed:
```sql
ALTER TABLE "Note" ADD COLUMN "lastOpenedAt" TIMESTAMP;
ALTER TABLE "Note" ADD COLUMN "viewCount" INT NOT NULL DEFAULT 0;
```

---

### 12.3 Context-Aware Resurfacing

When user opens a note or types in search, check for semantically related past notes.

Logic:
- On note detail open: vector similarity against all user notes
- Return top 2 past notes with explanation of why they are related
- On search: inject relevant past notes into results regardless of date

UI: RightPanel — "You've thought about this before" section

---

### 12.4 Time-Based Resurfacing

Scheduled nudges:
- Morning: today's extracted tasks from all recent notes
- Evening: "These ideas from today might connect"
- Weekly: patterns, clusters detected, unresolved threads

Implementation path: in-app widget first, optional email digest later.

---

### 12.5 Duplicate and Overlap Detection

Detect when a new note covers ground already in the corpus.

- Compare incoming note embedding against recent notes at enrichment time
- If similarity > 0.90: surface "You may have captured this before"
- Show side-by-side with quick merge/link action

---

## 13. Phase 6 — Synthesis and Planning

**Goal**: Turn the corpus into executable outputs. QNote stops being a note tool and becomes a thinking partner that produces actual decisions and plans.

---

### 13.1 Multi-Note Synthesis (Must Have)

**User flow**: "Summarize my thinking on X"
- User selects a topic, project, or manual set of notes
- AI analyzes all matching notes (up to 30)
- Output:
  - Core ideas (3–5 recurring themes with evidence)
  - Repeated unresolved questions
  - Contradictions detected
  - Suggested next steps

API: `POST /api/synthesis`
- Input: `{ query: string, noteIds?: string[] }`
- Output: structured synthesis with cited note IDs per claim

UI:
- Modal triggered from search page, topic page, or project/collection page
- Synthesis output with citation chips linking back to source notes
- "Turn into project" action at bottom of synthesis output

---

### 13.2 Auto-Project from Synthesis

When synthesis output meets threshold (3+ distinct tasks, coherent goal):
- Suggestion: "This looks like a project — create one?"
- Accept → create Collection, link all source notes, use synthesis title as collection name

---

### 13.3 Planning Mode

Convert note clusters into structured executable plans.

Input: set of notes around a goal
Output:
- Ordered task list with priority
- Dependency suggestions ("do X before Y")
- Time estimate prompts
- Milestone suggestions

API: `POST /api/notes/plan`
- Input: `{ noteIds: string[] }`
- Output: structured plan with task sequence

UI:
- "Plan this" button on project/collection pages
- Plan view: Now / Next / Later columns auto-populated from extracted tasks

---

### 13.4 Idea Expansion Mode

For IDEA-type notes:
- AI proposes 3 possible directions to develop the idea
- Each direction links to relevant existing notes in the corpus
- User selects a direction — new note created with lineage link to original

API: `POST /api/notes/[id]/expand`

UI:
- "Expand this idea" button on IDEA-type note cards and detail view
- Branching preview shown as 3 option cards
- Accept one branch → creates new note linked to parent

---

### 13.5 Review Mode

Daily/weekly reflection interface.

Shows:
- Unfinished extracted tasks from the past 7 days
- Repeated themes this week vs last week
- Notes with zero follow-up (low resolution rate)
- Cognitive patterns: "You tend to capture work tasks on Monday mornings"

UI: dedicated `/review` route
- Card-by-card flow with keyboard shortcuts
- Each item: mark done / snooze / create follow-up note

---

## 14. Phase 7 — Capture Ubiquity

**Goal**: Capture from anywhere. If QNote requires opening the app, people fall back to random notes, texts, and screenshots.

---

### 14.1 Keyboard-First Triage (Should Have — near term)

See Dump Mode section (10.2) for full keyboard shortcut spec.

---

### 14.2 Desktop Wrapper (Tauri)

- Cross-platform: Windows, Mac, Linux
- Global hotkey (e.g. `Ctrl+Shift+N`) → instant floating capture modal from any app
- System tray icon with note count badge and quick capture
- Non-intrusive resurfacing toast notifications in screen corner
- Optional clipboard monitoring (user-controlled in settings)

---

### 14.3 Browser Extension

- Capture highlighted text from any webpage with one click
- Auto-captures URL and page title as context fields on the note
- Quick annotation panel before saving
- Badge shows count of unprocessed notes

---

### 14.4 Email-to-Note

- Dedicated forwarding address: `inbox@qnote.app` or user-specific subdomain
- Email body → rawContent, subject → title hint
- AI organizes on arrival same as normal capture
- Works from any device that has email

---

### 14.5 Clipboard Capture

Optional setting: monitor clipboard for meaningful text.

Behavior:
- Threshold: copied text over N characters not originating from QNote
- Toast prompt: "Save this to QNote?"
- Silent capture mode option: auto-saves to unprocessed inbox without prompt

---

### 14.6 Mobile (Capacitor)

- iOS and Android wrapper
- Offline-first: capture always works, syncs when connection restored
- Share sheet integration: share text or URL from any app into QNote
- Voice note → transcribed by Whisper and organized on sync

---

### 14.7 Contextual Capture

Enrich capture with source context automatically:
- Source app name (desktop only)
- URL (if from browser or extension)
- Timestamp + active window title
- QNote uses context at organization time: "This looks like a web research note" → category REFERENCE

---

## 15. Platform Maturity

### 15.1 OAuth Login (Should Have)

Add Google and GitHub providers via NextAuth to reduce signup friction.

Steps:
- Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` to env
- Add `GITHUB_ID`, `GITHUB_SECRET` to env
- Add providers to `src/auth.ts`
- Update login page to show provider buttons alongside email form

---

### 15.2 Multi-User / Team Features (Nice to Have)

Current: fully isolated single-user per account.

Planned:
- Workspace model with owner and members
- Shared collections and projects with permission levels (view / edit)
- Team-level entity graph
- Activity feed for shared project updates
- Comment threads on notes

Database changes required: Workspace model, Membership model, permission columns on Collection and Note.

---

### 15.3 Billing Integration (Should Have for paid)

Stripe scaffolded in `src/lib/stripe.ts`. Remaining:
- Define pricing tiers
- Complete checkout session at `POST /api/billing/checkout`
- Webhook handler for subscription events
- Feature gates per plan level

---

## 16. Complete Gap Map

### A. Immediate (explicit remaining Phase 3)
1. Organize This Dump dedicated flow
2. Dump Mode UX + keyboard-first triage
3. Instrumentation dashboard

### B. Surface completeness
1. Cards view
2. Projects view
3. Topics view
4. Timeline view
5. Favorites view (filter + pin management)
6. Archive view (filter + restore)
7. Search UX depth, filters, and ranking tuning

### C. Memory payoff
1. Project/topic cluster detection
2. Forgotten-note resurfacing
3. Pattern surfacing
4. Context-aware resurfacing
5. Duplicate/overlap detection

### D. Synthesis
1. Multi-note synthesis with cited evidence
2. Auto-project from synthesis
3. Planning mode
4. Idea expansion mode
5. Review mode habit loop

### E. Capture surfaces
1. Keyboard-first triage shortcuts
2. Desktop wrapper + global hotkey (Tauri)
3. Browser extension
4. Email-to-note
5. Clipboard capture
6. Mobile (iOS/Android)
7. Voice capture
8. OCR/screenshot capture

### F. Platform maturity
1. OAuth providers
2. Multi-user / team features
3. Offline sync
4. Billing tier enforcement

### G. Trust and learning infra (see AI training doc)
1. Training consent UI
2. Deletion request flow
3. De-identification pipeline
4. Evaluation scorecard and rollback governance

---

## 17. Priority Tiers

### Must Have — fastest path to undeniable value
1. Organize This Dump
2. Semantic search UX
3. Project/topic clustering
4. Resurfacing engine (forgotten + pattern)
5. Multi-note synthesis

### Should Have
1. Dump Mode + keyboard-first triage
2. RightPanel depth upgrades
3. Instrumentation dashboard
4. Training-consent foundation
5. OAuth login

### Nice to Have
1. Capture-from-anywhere stack
2. Desktop/global hotkey
3. Mobile/offline
4. Voice and OCR
5. Team features

---

## 18. Recommended Execution Sequence

1. Organize This Dump — highest leverage, ships the differentiated UX today
2. Search UX + relevance tuning — unblocks discoverability
3. Cluster detection — first memory payoff moment
4. Resurfacing — deepens memory payoff
5. Multi-note synthesis — completes thinking-partner loop
6. Instrumentation + training foundation — enables measurable iteration
7. Capture surfaces — extends reach after core value is proved

---

## 19. Success Metrics

### Primary (product health)
1. % of notes resolved without manual edit after first AI pass
2. Clarification-rate trend per active user cohort — should fall over time
3. Average confidence lift after hint interaction — should stay positive
4. Resurfaced-note reopen rate — target above 20%
5. Synthesis-to-action conversion rate — user acts on synthesis output

### Operational
1. Enrichment queue latency P95 — target under 5 seconds
2. Enrichment retry rate — target under 5%
3. Search relevance CTR — result opened vs shown
4. Bulk triage session duration — target under 10 minutes for 20 notes

### Release gates per phase
- All primary workflow paths pass manual test
- Automated regression suite green
- Build clean
- Primary metrics non-regressing vs prior phase baseline

---

## 20. Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Over-automation erodes trust | Confidence-aware behavior: high = auto, medium = suggest, low = ask |
| Prompt drift breaks quality | Stable eval set with scorecard checks before any prompt or model change |
| Resurfacing feels like noise | Heavy relevance filtering; opt-in initially; always dismissible |
| Synthesis outputs are generic | Ground strictly in cited note content — no hallucinated summaries |
| Surface expansion before core is proved | Ship in execution sequence order — not by channel popularity |
| Users unsure what trains the model | Opt-in only, visible consent, delete flow (see training doc) |

---

## 21. Database Migrations Needed (Upcoming)

For Dump Mode:
```sql
ALTER TABLE "Note" ADD COLUMN "dumpMode" BOOLEAN NOT NULL DEFAULT false;
```

For resurfacing tracking:
```sql
ALTER TABLE "Note" ADD COLUMN "lastOpenedAt" TIMESTAMP;
ALTER TABLE "Note" ADD COLUMN "viewCount" INT NOT NULL DEFAULT 0;
```

For cluster tracking:
```prisma
model NoteCluster {
  id        String   @id @default(cuid())
  userId    String
  label     String
  kind      String
  noteCount Int      @default(0)
  strength  Float    @default(0)
  dismissed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Always run `npx prisma migrate dev --name <description>` to generate and apply migrations properly.

---

## 22. Files to Create or Update Per Phase

### Phase 3 remaining

New:
- `src/app/api/notes/analyze-dump/route.ts`
- `src/app/api/notes/analyze-dump/confirm/route.ts`
- `src/app/api/user/stats/route.ts`
- `src/components/notes/DumpModal.tsx`

Modify:
- `src/components/layout/CaptureBar.tsx` — Dump Mode toggle + Organize Dump button
- `src/app/(app)/settings/page.tsx` — instrumentation section
- `src/app/api/notes/route.ts` — accept dumpMode param

### Phase 4

New:
- `src/app/api/clusters/route.ts`
- `src/app/api/clusters/accept/route.ts`
- `src/app/api/topics/[entity]/page/route.ts`
- `src/app/(app)/topics/[slug]/page.tsx`

Modify:
- `src/app/(app)/search/page.tsx` — full semantic search UX
- `src/components/layout/RightPanel.tsx` — unresolved threads + conversion actions
- `src/components/search/SearchClient.tsx` — filters, typeahead, results

### Phase 5

New:
- `src/app/api/resurface/forgotten/route.ts`
- `src/app/api/resurface/patterns/route.ts`

Modify:
- `src/components/notes/InboxStream.tsx` — "From the past" section
- `src/components/layout/RightPanel.tsx` — resurfacing sections

### Phase 6

New:
- `src/app/api/synthesis/route.ts`
- `src/app/api/notes/plan/route.ts`
- `src/app/api/notes/[id]/expand/route.ts`
- `src/app/(app)/review/page.tsx`

---

## 23. Known Limitations (Current)

- Single-user only — no team sharing
- Credential auth only — no Google/GitHub OAuth
- No offline support
- Semantic search scored in application layer, not native pgvector ORDER BY — to be optimized at scale
- No voice note support
- No screenshot/image OCR
- No duplicate detection
- No mobile app

---

## 24. Troubleshooting

**"Failed to create note"**
- Check `DATABASE_URL` in `.env.local`
- Run `npm run db:migrate`
- Confirm pgvector extension is enabled on the database

**"Invalid OpenAI API key"**
- Check `OPENAI_API_KEY` in `.env.local`
- Validate key at https://platform.openai.com

**AI enrichment not running**
- Check worker endpoint: `POST /api/worker/enrich`
- Check `NoteJob` table for FAILED records
- Read `lastError` field for specific failure reason

**Prisma client errors**
- Run `npx prisma generate`
- Delete `node_modules/.prisma` and regenerate if client is stale

**Semantic search returning nothing**
- Verify `Note.embedding` column is populated after enrichment
- Confirm pgvector extension is enabled
- Check that `OPENAI_API_KEY` is valid — embedding calls use the same key
