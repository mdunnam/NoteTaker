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
- **Bulk clarify**: Apply project/context hints to selected notes and regenerate
- **Contextual RightPanel**: Intent, next action, contextual tasks, related notes on note detail routes
- **Hint effectiveness analytics**: Settings view tracks per-hint usage and average confidence lift
- **Organize This Dump**: Analyze a raw dump, review structured previews, and create selected notes
- **Dump Mode**: Zero-friction background organization path with keyboard-first inbox triage
- **AI performance dashboard**: Settings page shows confidence, clarification rate, trend deltas, and 30-day sparkline history
- **Reclassification queue**: Surfaces notes whose project/category meaning changed based on newer linked context and lets you apply suggestions in batches

### Phase 4 🚧 (Knowledge browsing foundation shipped)
- Search, Projects, and Topics now have real cluster/search behavior
- Semantic search UX with filters, snippets, and typeahead
- Project/topic clustering with browsable grouped notes and reorganization suggestions
- Reclassification queue for changed-meaning notes in inbox and right panel
- Cards, Timeline, Favorites, and Archive still need deeper product depth

### Phase 5+ 📋
- Resurface old notes
- Multi-note synthesis and planning outputs
- Review and resurfacing workflows
- Desktop (Tauri) and iOS (Capacitor) wrappers

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

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

# Workers (recommended)
WORKER_SECRET="your-worker-secret"
CRON_SECRET="your-cron-secret"
```

## Project Structure

```
src/
  app/
    (app)/                  # Protected routes with layout
      layout.tsx            # App shell (sidebar, capture bar, right panel)
      inbox/page.tsx        # Main inbox view
      cards/page.tsx        # Card grid view (still shallow)
      projects/page.tsx     # Project cluster browser
      topics/page.tsx       # Topic cluster browser
      search/page.tsx       # Search & Ask experience
      ... (other views)
    api/
      notes/route.ts        # CRUD endpoints for notes
      notes/[id]/route.ts   # Single note operations
      notes/[id]/clarify/route.ts  # Conversational clarification for one note
      notes/[id]/insights/route.ts # Related/contextual note intelligence
      notes/[id]/split/route.ts    # Split single note into multiple cards
      notes/[id]/summary/route.ts  # Regenerate AI summary for a note
      notes/analyze-dump/route.ts  # Analyze raw dump into note previews
      notes/analyze-dump/confirm/route.ts  # Create reviewed dump notes
      search/semantic/route.ts  # Semantic + keyword search
      search/ask/route.ts       # Ask across note corpus
      user/stats/route.ts   # AI performance dashboard metrics
      user/hint-stats/route.ts # Hint effectiveness analytics
      worker/metric-snapshots/route.ts  # Metric snapshot backfill worker
      auth/signup/route.ts  # User signup
    login/page.tsx          # Login page
    signup/page.tsx         # Signup page
    layout.tsx              # Root layout with NextAuth provider

  components/
    layout/
      Sidebar.tsx           # Navigation sidebar
      CaptureBar.tsx        # Universal capture input
      RightPanel.tsx        # AI insights panel
      RightPanelContextual.tsx # Note-detail context widgets
    notes/
      NoteCard.tsx          # Individual note display
      InboxStream.tsx       # Note list view
      ClarificationLoop.tsx # Shared conversational clarification UI
      ReclassificationQueue.tsx # Batch apply changed-meaning regrouping
      SplitNoteModal.tsx    # Split preview/create modal
      DumpModal.tsx         # Organize This Dump modal
    settings/
      SettingsClient.tsx    # Settings page client shell
      HintEffectivenessPanel.tsx # Per-hint lift table
      AIPerformancePanel.tsx  # AI instrumentation dashboard cards

  lib/
    db.ts                   # Prisma client singleton
    ai.ts                   # AI utilities (organize, embed, split)
    clarification.ts        # aiMeta clarification parsing + transcript helpers
    clusters.ts             # Project/topic clustering + reclassification ranking
    userMemory.ts           # Per-user memory profile and hint telemetry
    searchRanking.ts        # Keyword/semantic ranking helpers
    userStats.ts            # AI performance metrics + snapshot history

  prisma/
    schema.prisma           # Data model

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
- [x] Bulk clarify + regenerate actions
- [x] Right panel contextual insights for note detail
- [x] Hint effectiveness analytics in settings
- [x] Organize This Dump analyze + confirm flow
- [x] Dump Mode capture path + keyboard-first inbox triage shortcuts
- [x] AI performance dashboard with trend deltas and 30-day sparkline history
- [x] Daily metric snapshots + snapshot backfill worker

### Phase 4: Knowledge Browsing & Search 🚧
- [x] Semantic search UX with filters, snippets, and typeahead
- [x] Projects view backed by inferred project clusters
- [x] Topics view backed by inferred topic clusters
- [x] Project/topic clustering with browsable grouped notes
- [x] Note-level reorganization suggestions from shared topic/project context
- [x] Reclassification queue with batch apply for changed-meaning notes
- [ ] Implement deeper Cards and Timeline views
- [ ] Deepen Favorites and Archive views
- [ ] Broader RightPanel guidance and cluster actions

### Phase 5: Resurface ⏳
- [ ] Note health widget
- [ ] Recurring idea detection
- [ ] Forgotten-note resurfacing and pattern surfacing

### Phase 6: Desktop (Tauri) 📋
- [ ] Tauri integration
- [ ] Global hotkey
- [ ] System tray

### Phase 7: iOS (Capacitor) 📋
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

- [ ] Phase 5: Build resurfacing and review workflows
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
