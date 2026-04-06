# QNote — AI-Assisted Note Inbox

A capture-first, auto-organizing note inbox app that helps you store thoughts fast and resurface them intelligently.

## Planning Docs

- [Master Phase Implementation Plan](docs/MASTER_PHASE_IMPLEMENTATION_PLAN.md)
- [AI Training Opt-In Plan](docs/AI_TRAINING_OPTIN_IMPLEMENTATION_PLAN.md)
- [Intended User Workflow](docs/USE_CASE_WORKFLOW.md)
- Historical planning snapshots live under `docs/archive/`

## Features

### Phase 1 ✅ (Complete)
- **Foundation**: Next.js 14 + TypeScript + Tailwind CSS
- **Database**: Prisma ORM + Vercel Postgres with pgvector
- **Auth**: NextAuth.js with email/password
- **AI**: OpenAI SDK + GPT-5.4 organization pipeline

### Phase 2 ✅ (Implemented)
- **Capture**: Universal capture bar at top of app
- **Quick save**: One-click note creation with optional tags
- **Inbox view**: Stream of new/recent notes
- **Basic actions**: Archive, pin, delete notes

### Phase 3 ✅ (Core shipped)
- **AI organization**: Auto-generate titles, summaries, categories, tags
- **Task extraction**: Pull actionable items from notes
- **Entity detection**: Identify people, projects, topics
- **Confidence scoring**: Confidence badges in note views + tracked confidence lift
- **Split workflow**: Split messy notes into multiple cards with review modal
- **Summary refresh**: Regenerate weak summaries from detail and inbox cards
- **Semantic search**: Uses stored pgvector embeddings with on-the-fly fallback
- **Clarification loop**: Conversational follow-up answers plus quick project/context hints in inbox and note detail
- **Clarification feedback**: Low-value clarification prompts can be marked `Not useful`, tracked in Settings, restored later if over-suppressed, and filtered from future follow-up question sets
- **Bulk clarify**: Apply project/context hints to selected notes and regenerate
- **Contextual RightPanel**: Intent, next action, contextual tasks, related notes on note detail routes
- **Hint effectiveness analytics**: Settings view tracks per-hint usage and average confidence lift
- **Organize This Dump**: Analyze a raw dump, review structured previews, and create selected notes
- **Dump Mode**: Zero-friction background organization path with keyboard-first inbox triage
- **AI performance dashboard**: Settings page shows confidence, clarification rate, trend deltas, and 30-day sparkline history
- **Clarification-noise trend**: AI performance now includes clarification dismiss-rate trends plus down-ranked and suppressed question-style counts
- **Note health**: Notes now carry a health score based on confidence, staleness, missing structure, and unresolved clarification pressure
- **Multi-note synthesis**: Selected cards, timeline notes, and contextual note clusters can be synthesized into one shared summary, themes, and next actions
- **Planning outputs**: Synthesis now also returns a concrete plan with objective, first move, ordered steps, risks, and a success signal
- **Project/topic planning**: Projects and Topics now let you synthesize a cluster directly into a brief and execution plan from the cluster page itself
- **Broader resurfacing**: Forgotten-note and recurring-pattern signals now surface in Inbox and the shared RightPanel, not only in Review
- **Recurring idea detection**: Repeated language across recent notes now forms recurring idea threads even without explicit entities or tags
- **Cards and Timeline depth**: Both views now support health-aware filtering, selection, and synthesis workflows
- **Favorites and Archive depth**: Saved-note views now support health-aware filtering, selection, synthesis, and revisit or restore candidates
- **Reclassification queue**: Background-rescored after enrichment, surfaces notes whose project/category meaning changed based on newer linked context, and lets you apply suggestions in batches
- **Review page**: Dedicated workflow surface for low-confidence clarification, changed-meaning regrouping, forgotten-note resurfacing, and repeated-pattern review
- **Review planning workflows**: Review can now turn clarification, regrouping, and resurfacing queues into concrete plans without leaving the review page
- **Capture-from-anywhere foundation**: Settings now generates a browser bookmarklet and `/capture` provides a focused quick-capture landing page for short external clips
- **Installed-browser share target**: QNote now ships a minimal PWA/share-target foundation so supported browsers can share titles, URLs, and text into the same capture flow
- **Structured capture source metadata**: External clips now preserve source title, URL, and capture origin, and note detail surfaces that context directly
- **File and screenshot intake**: The external capture page now accepts pasted screenshots and attached files; small text files are inlined for AI organization while binaries remain structured metadata in note detail
- **Screenshot OCR**: Attached or pasted images on `/capture` now attempt text extraction so screenshots can contribute real text to AI organization
- **Desktop helper foundation**: A Tauri-based desktop capture helper is scaffolded under `src-tauri/`, runs from the system tray, and registers a global shortcut that launches the browser capture flow
- **Review-state persistence**: Forgotten-note and pattern review cards can be snoozed or dismissed so they stay out of the queue for a time window
- **Suppressed review recovery**: Review shows suppressed-item counts and lets you restore snoozed or dismissed resurfacing items immediately
- **Review telemetry in Settings**: Settings now shows active suppressions plus snooze/dismiss/restore history so resurfacing noise is visible and manageable
- **Feedback-aware resurfacing**: Repeated dismisses and snoozes now automatically down-rank or suppress noisy forgotten-note and pattern signals
- **Feedback-aware regrouping**: Reclassification suggestions now support lightweight `Not useful` feedback and repeated dismisses down-rank or suppress the same regrouping suggestion later

### Phase 4 🚧 (Knowledge browsing foundation shipped)
- Search, Projects, and Topics now have real cluster/search/planning behavior
- Semantic search UX with filters, snippets, and typeahead
- Project/topic clustering with browsable grouped notes, cluster planning, and reorganization suggestions
- Reclassification queue for changed-meaning notes in inbox and right panel
- Cards, Timeline, Favorites, and Archive now support deeper health-aware browsing and synthesis workflows

### Phase 5+ 📋
- Resurface old notes
- Review and resurfacing workflows
- Deeper desktop packaging and mobile capture wrappers

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Rust + Windows Tauri prerequisites only if you want to build the desktop helper

### Setup

```bash
# Install dependencies
npm install

# Configure environment
# Copy .env.example to .env.local and fill in:
# - DATABASE_URL (Vercel Postgres connection string)
# - NEXTAUTH_SECRET (generate with `openssl rand -base64 32`)
# - OPENAI_API_KEY
# - WORKER_SECRET (recommended for protected worker endpoints)

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Start dev server
npm run dev
```

Visit `http://localhost:3000/login` to sign up and start capturing notes.

## Environment Variables

```
# .env.local

# Database (get from Vercel Postgres or local Neon)
DATABASE_URL="postgresql://user:pass@localhost:5432/qnote"

# Auth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"

# AI
OPENAI_API_KEY="sk-..."

# Optional desktop helper target
QNOTE_DESKTOP_CAPTURE_URL="http://127.0.0.1:3000/capture"

# Workers (recommended)
WORKER_SECRET="your-worker-secret"
CRON_SECRET="your-cron-secret"
```

## Desktop Helper

The repo now includes a lightweight Tauri desktop helper that runs from the system tray, keeps a global hotkey registered, and opens the same browser capture flow used by `/capture`.

Typical local usage:

```bash
npm run desktop:dev
```

By default it targets `http://127.0.0.1:3000/capture?source=desktop-hotkey`. Override that by setting `QNOTE_DESKTOP_CAPTURE_URL` before running a desktop build or dev session. See `docs/DESKTOP_CAPTURE_HELPER.md` for setup notes and Windows prerequisites.

## Project Structure

```
desktop-shell/
  index.html              # Local helper UI for the Tauri desktop capture shell

src/
  app/
    (app)/                  # Protected routes with layout
      layout.tsx            # App shell (sidebar, capture bar, right panel)
      inbox/page.tsx        # Main inbox view
      cards/page.tsx        # Card grid with health, selection, and synthesis
      projects/page.tsx     # Project cluster browser with planning
      review/page.tsx       # Dedicated review workflow
      topics/page.tsx       # Topic cluster browser with planning
      search/page.tsx       # Search & Ask experience
      ... (other views)
    capture/page.tsx        # Top-level external capture page with auth-preserving redirect
    capture/share/route.ts  # Share-target POST handoff into the capture flow
    api/
      notes/route.ts        # CRUD endpoints for notes
      notes/[id]/route.ts   # Single note operations
      notes/[id]/clarify/route.ts  # Conversational clarification for one note
      notes/[id]/clarify-feedback/route.ts  # Dismiss low-value clarification prompts
      notes/[id]/insights/route.ts # Related/contextual note intelligence
      notes/[id]/split/route.ts    # Split single note into multiple cards
      notes/[id]/summary/route.ts  # Regenerate AI summary for a note
      notes/analyze-dump/route.ts  # Analyze raw dump into note previews
      notes/analyze-dump/confirm/route.ts  # Create reviewed dump notes
      synthesis/route.ts  # Synthesize selected notes and return a structured plan
      search/semantic/route.ts  # Semantic + keyword search
      search/ask/route.ts       # Ask across note corpus
      review/state/route.ts     # Persist snooze/dismiss review actions
      user/clarification-feedback/route.ts # Restore over-suppressed clarification styles
      user/stats/route.ts   # AI performance dashboard metrics
      user/hint-stats/route.ts # Hint effectiveness analytics
      worker/metric-snapshots/route.ts  # Metric snapshot backfill worker
      auth/signup/route.ts  # User signup
    login/page.tsx          # Login page
    signup/page.tsx         # Signup page
    layout.tsx              # Root layout with NextAuth provider

  components/
    layout/
      PwaRegistration.tsx   # Minimal service worker registration for installed-browser capture
      Sidebar.tsx           # Navigation sidebar
      CaptureBar.tsx        # Universal capture input
      RightPanel.tsx        # AI insights panel
      RightPanelContextual.tsx # Note-detail context widgets
    notes/
      CardsClient.tsx      # Cards filters, selection, synthesis
      ExternalCaptureClient.tsx # Focused quick-capture form for external clips, files, and screenshots
      KnowledgeClustersClient.tsx # Shared Projects and Topics planning surface
      NoteCard.tsx          # Individual note display
      InboxStream.tsx       # Note list view
      ClarificationLoop.tsx # Shared conversational clarification UI
      MultiNoteSynthesisPanel.tsx # Shared synthesis UI for selected notes
      NoteHealthBadge.tsx  # Compact note health state badge
      NoteHealthPanel.tsx  # Detailed note health widget
      SavedNotesClient.tsx # Shared Favorites and Archive deep-list surface
      ReclassificationQueue.tsx # Batch apply changed-meaning regrouping
      ResurfacingRail.tsx  # Forgotten-note and recurring-pattern surface
      SplitNoteModal.tsx    # Split preview/create modal
      TimelineClient.tsx   # Timeline filters, selection, synthesis
      DumpModal.tsx         # Organize This Dump modal
    review/
      ReviewPlanningPanels.tsx # Queue-level planning surfaces for Review
    settings/
      CaptureFromAnywherePanel.tsx # Bookmarklet and external capture setup
      SettingsClient.tsx    # Settings page client shell
      HintEffectivenessPanel.tsx # Per-hint lift table
      AIPerformancePanel.tsx  # AI instrumentation dashboard cards
      ClarificationFeedbackPanel.tsx  # Clarification question feedback telemetry

  lib/
    db.ts                   # Prisma client singleton
    ai.ts                   # AI utilities (organize, embed, split)
    clarification.ts        # aiMeta clarification parsing + feedback-aware question filtering
    clusters.ts             # Project/topic clustering + reclassification ranking
    externalCapture.ts      # External capture parsing + safe callback helpers
    noteHealth.ts           # Note-health scoring and workspace summaries
    userMemory.ts           # Per-user memory profile, review telemetry, and clarification feedback stats
    searchRanking.ts        # Keyword/semantic ranking helpers
    userStats.ts            # AI performance metrics + snapshot history

  prisma/
    schema.prisma           # Data model

src-tauri/
  Cargo.toml                # Tauri desktop helper crate
  build.rs                  # Tauri build script
  src/main.rs               # Global-hotkey desktop helper entrypoint
  tauri.conf.json           # Desktop helper window + build config

  public/
    manifest.webmanifest   # Installed-browser capture/share target manifest
    sw.js                  # Minimal service worker for PWA registration

  auth.ts                   # NextAuth configuration
```

## Data Model

### Core Tables

- **Note**: Raw notes with AI-generated metadata
- **User**: Authentication & user data
- **UserPreferences**: Per-user memory and preferences
- **NoteJob**: Durable enrichment queue
- **UserMetricSnapshot**: Daily AI performance history for dashboard sparklines
- **Collection**: User-created containers (Work, Personal, etc.)
- **Entity**: AI-detected people, projects, topics
- **NoteEntity**: Junction table linking notes to entities
- **NoteRelation**: Related notes with similarity scores

### Key Fields

- `rawContent`: Original note (never mutated)
- `title`, `summary`, `category`, `type`: AI-generated
- `tags`, `extractedTasks`, `extractedDates`: Extracted by AI
- `confidenceScore`: How confident the AI is (0-1)
- `status`: UNPROCESSED → PROCESSING → PROCESSED
- `embedding`: Vector for semantic search (pgvector)
- `aiMeta`: Intent, next action, clarification questions/history, dump-mode capture hints

## Phase Breakdown

### Phase 1: Foundation ✅
- [x] Next.js + TypeScript + Tailwind setup
- [x] Prisma schema + migrations
- [x] NextAuth.js implementation
- [x] Basic layout shell
- [x] Signup/login pages

### Phase 2: Capture & Inbox ✅
- [x] CaptureBar component
- [x] POST /api/notes endpoint
- [x] InboxStream view
- [x] NoteCard with actions
- [x] PATCH/DELETE note endpoints

### Phase 3: AI Organization ✅
- [x] AI service functions (organizeNote, splitNote, embedNote)
- [x] Background organization trigger
- [x] Split-note API + review modal flow
- [x] Embedding persistence into pgvector column
- [x] Summary regeneration endpoint + UI actions
- [x] Confidence state badges in note UI
- [x] User-memory-aware organization hints
- [x] Conversational clarification loop in inbox and note detail
- [x] Clarification question feedback with `Not useful` dismissal + settings telemetry
- [x] Bulk clarify + regenerate actions
- [x] Right panel contextual insights for note detail
- [x] Hint effectiveness analytics in settings
- [x] Organize This Dump analyze + confirm flow
- [x] Dump Mode capture path + keyboard-first inbox triage shortcuts
- [x] AI performance dashboard with trend deltas and 30-day sparkline history
- [x] Clarification-noise trend in AI performance dashboard
- [x] Daily metric snapshots + snapshot backfill worker

### Phase 4: Knowledge Browsing & Search ✅
- [x] Semantic search UX with filters, snippets, and typeahead
- [x] Projects view backed by inferred project clusters
- [x] Topics view backed by inferred topic clusters
- [x] Dedicated Review page for clarification and changed-meaning queues
- [x] Project/topic clustering with browsable grouped notes
- [x] Note-level reorganization suggestions from shared topic/project context
- [x] Background-rescored reclassification queue with batch apply for changed-meaning notes
- [x] Reclassification queue feedback loop with `Not useful` dismissal and telemetry-aware downranking
- [x] Implement deeper Cards and Timeline views
- [x] Deepen Favorites and Archive views
- [x] Broader RightPanel guidance and cluster actions

### Phase 5: Resurface ⏳
- [x] Forgotten-note resurfacing in Review
- [x] Repeated-pattern review cards in Review
- [x] Snooze/dismiss review-state persistence for resurfacing items
- [x] Suppressed-item counts and restore actions in Review
- [x] Settings visibility for active suppressions and review action history
- [x] Automatic downranking and suppression of noisy resurfacing signals from review feedback
- [x] Note health widget
- [x] Recurring idea detection beyond review heuristics
- [x] Broader resurfacing across inbox, right panel, and notifications

### Phase 6: Synthesis & Planning 📋
- [x] Multi-note synthesis
- [x] Planning outputs
- [x] Projects and Topics planning surfaces
- [x] Review workflows

### Phase 7: Capture From Anywhere 📋
- [x] Browser bookmarklet capture foundation
- [ ] Native desktop and mobile capture wrappers

### Phase 7: Desktop (Tauri) 📋
- [ ] Tauri integration
- [ ] Global hotkey
- [ ] System tray

### Phase 8: iOS (Capacitor) 📋
- [ ] Capacitor setup
- [ ] Share extension

## Development Notes

### Database

**Option 1: Vercel Postgres (Recommended for v1)**
1. Create project on Vercel
2. Add Postgres database
3. Copy connection string to `.env.local`

**Option 2: Local Neon**
```bash
npm install -D @neondatabase/serverless
```

**Option 3: Local PostgreSQL**
```bash
# Install PostgreSQL locally
# Create database: createdb qnote
# Update .env.local: DATABASE_URL="postgresql://localhost/qnote"
```

### Enable pgvector

```sql
-- Run in your database
CREATE EXTENSION IF NOT EXISTS vector;
```

### Cost Estimates (v1)

- **Database**: Vercel Postgres free tier (3GB)
- **OpenAI API**: ~$0.15-0.50/month for typical usage
- **Hosting**: Vercel Hobby tier or equivalent

### Testing AI Organization

```bash
# See how AI organizes a messy note
node -e "
const { organizeNote } = require('./src/lib/ai');
organizeNote('call jim about invoices, look into unreal plugin crash, daughter needs school form friday').then(console.log);
"
```

## Roadmap

- [ ] Phase 5: Build resurfacing and deeper review workflows
- [ ] Phase 6: Add synthesis, planning, and multi-note outputs
- [ ] Phase 7: Desktop app via Tauri
- [ ] Phase 8: iOS app via Capacitor
- [ ] Phase 9: Team sharing & multi-user
- [ ] Phase 10: Offline-first with local sync
- [ ] Phase 11: Knowledge graph & visualization

## Contributing

This is a personal project. Feel free to fork and adapt!

## License

MIT
