# Phase 3 Implementation Plan: Thinking Modes Foundation

Related docs:
- [Implementation Summary](IMPLEMENTATION.md)
- [AI Training Opt-In Plan](AI_TRAINING_OPTIN_IMPLEMENTATION_PLAN.md)
- [Intended User Workflow](USE_CASE_WORKFLOW.md)

**Goal**: Transform QNote from note storage into a thinking partner.

**Timeline**: 3–4 weeks (if working full-time)

## Status Update (2026-03-30)

- [x] Added `POST /api/notes/[id]/split` with `preview` and `create` modes
- [x] Added split review modal UI and wired split actions into note detail and inbox cards
- [x] Added targeted tests for split route behavior
- [x] Persist `Note.embedding` values to pgvector column during enrichment
- [x] Added `POST /api/notes/[id]/summary` to regenerate weak summaries on demand
- [x] Added one-click summary regeneration on inbox note cards
- [x] Added confidence-state badges (`Auto-applied`, `Suggested`, `Needs review`) in note UI
- [x] Tuned organizer prompt to produce clearer action-oriented extracted tasks
- [x] Switched semantic search to use stored vectors directly with on-the-fly fallback
- [x] Added user-memory-aware organization context (projects/contexts/entities)
- [x] Upgraded core reasoning model for organization and splitting
- [x] Added clarification chips to inbox low-confidence notes
- [x] Added clarification chips to note detail low-confidence notes
- [x] Added bulk clarify + regenerate actions in inbox
- [x] Added contextual RightPanel section for note detail routes
- [x] Added hint-effectiveness analytics in settings

---

## Remaining Phase 3 Focus

- [ ] Organize This Dump dedicated modal flow (analyze + confirm create)
- [ ] Dump mode capture variant with keyboard-first triage shortcuts
- [ ] End-to-end instrumentation dashboard for clarification conversion and time-to-resolution

---

## 3A: Split Notes into Multiple Cards (PRIORITY 1)

**Dependencies**: Already have `splitNote()` logic in [src/lib/ai.ts](src/lib/ai.ts)

### Database Changes
- Add `originNoteId` field to `Note` model (optional, for tracking splits)
- Track when splits occur in audit

```prisma
model Note {
  // ... existing fields
  originNoteId    String?        // If this note was split from another
  splitFrom       Note?          @relation("SplitNotes", fields: [originNoteId], references: [id], onDelete: SetNull)
  splitInto       Note[]         @relation("SplitNotes")
}
```

### API Changes
- **New endpoint**: `POST /api/notes/[id]/split`
  - Input: note ID, user confirmation of which splits to create
  - Output: array of new note IDs created
  - Rolls back if any creation fails

### UI Changes
- **Modal**: "Review split suggestions"
  - Show each potential note:
    - Auto-title
    - Preview (first 100 chars)
    - Category + type
    - Checkbox: "Create this note"
  - Actions: "Create All", "Create Selected", "Cancel"

- **Post-split card**: 
  - Show all new notes created
  - Buttons: "Undo split", "View all"
  - Auto-close after 3 seconds or click

### Testing
- Test with messy multi-topic notes
- Verify confidence scores are reasonable
- Ensure rollback works if some creations fail

---

## 3B: RightPanel with Real Insights (PRIORITY 2)

**Dependencies**: Need pgvector embeddings stored + semantic search

### Database Check
- Verify `Note.embedding` field is populated after creation
- Test that embeddings are being stored

### API Changes
- **New endpoint**: `GET /api/notes/[id]/insights`
  - Returns:
    ```json
    {
      "relatedNotes": [
        { "id": "...", "title": "...", "similarity": 0.92 }
      ],
      "extractedTasks": [
        { "text": "...", "priority": "high", "extracted": true }
      ],
      "entities": [
        { "text": "Jim", "type": "PERSON", "occurrences": 3 },
        { "text": "Invoices", "type": "TOPIC", "occurrences": 2 }
      ]
    }
    ```

- **New endpoint**: `GET /api/search/semantic`
  - Input: note embedding + limit
  - Returns: array of similar notes with similarity scores

### UI Changes (RightPanel)

Replace current placeholder with:

1. **Section 1: Related Notes**
   - Header: "You've mentioned this before"
   - List:
     - Show up to 3 related notes
     - Small card: title + date + similarity %
     - Click to view in main panel

2. **Section 2: Quick Tasks**
   - Header: "Tasks in this note"
   - List:
     - Checkbox for each task
     - Priority indicator (high/medium/low)
     - Icon: extraction confidence
   - Add task button

3. **Section 3: Entities**
   - Header: "People, projects, topics mentioned"
   - Grouped by type (PERSON, PROJECT, TOPIC)
   - Each shows:
     - Entity name
     - Number of times mentioned
     - Avatar/icon for people
   - Click to filter notes by entity

4. **Section 4: Quick Actions**
   - Button: "Split this note"
   - Button: "Create project from related"
   - Button: "Add to collection"

### Testing
- Verify semantic search returns reasonable results
- Check that confidence scores appear visually
- Test with various note types

---

## 3C: Semantic Search (PRIORITY 3)

**Dependencies**: Embeddings stored + API endpoint from 3B

### API Changes
- **New endpoint**: `GET /api/search/semantic?q=<query>&limit=10`
  - Generate embedding for query
  - Find similar notes using pgvector
  - Return top N results with similarity score

### UI Changes
- **Search page** ([src/app/(app)/search/page.tsx](src/app/(app)/search/page.tsx))
  - Currently exists as placeholder
  - Replace with:
    - Search input at top
    - Tabs: "Semantic", "Full-text" (for now, just semantic)
    - Results list:
      - Note card with:
        - Title
        - Preview (highlight query match area)
        - Category + date
        - Similarity % on right
        - Click to view full note
    - "No results" state with tips

- **Typeahead search** (in CaptureBar?)
  - As user types in search, show top 3 suggestions
  - Optional: integrate into Sidebar navigation

### Testing
- Search for abstract concepts: "how to price", "team dynamics", "technical debt"
- Verify results are semantically related, not just keyword matches
- Test with empty database, single note, many notes

---

## 3D: "Organize This Dump" Button (PRIORITY 4)

**Dependencies**: `splitNote()` + `organizeNote()` already exist

### UI Changes
- **New button** in CaptureBar or Sidebar: "📥 Organize This Dump"
  - Opens modal

- **Modal: "Paste anything"**
  - Large textarea: "Paste meeting notes, brain dump, email, anything..."
  - Button: "Analyze"
  - Show loading state during AI processing

- **Results modal**
  - Title: "1 → 4 notes"
  - JSON preview of what will be created:
    ```
    📌 Note 1: "Fix database bug"
       Category: Work | Type: TASK
       Priority: High
       
    💡 Note 2: "Brainstorm feature X"
       Category: Work | Type: IDEA
       
    🛒 Note 3: "Buy groceries"
       Category: Personal | Type: TODO
       
    📞 Note 4: "Call client about timeline"
       Category: Work | Type: TASK
       Priority: Medium
    ```
  - Buttons: "Create All", "Edit & Create", "Cancel"

- **With "Edit & Create"**
  - Let user modify titles, categories, priorities before creating
  - Quick editor for each note

### API Changes
- **New endpoint**: `POST /api/notes/analyze-dump`
  - Input: raw text
  - Runs `splitNote()` then `organizeNote()` on each split
  - Returns preview (no creation yet, user confirms)
  - Second endpoint to actually create: `POST /api/notes/analyze-dump/confirm`

### Testing
- Test with:
  - Meeting transcript
  - Email forward
  - Slack message dump
  - Random brain dump
- Verify splits are reasonable
- Check that each gets proper organization

---

## 3E: Dump Mode

**Dependencies**: CaptureBar exists + note creation works

### UI Changes
- **Dropdown in CaptureBar** or **Settings**:
  - "Dump Mode" toggle checkbox
  - When ON:
    - "Save" button becomes "💭 Dump It"
    - Hide "Tags" field
    - Hide "Category" suggestions
    - Larger textarea
    - Placeholder: "Brain dump here. We'll organize it."

- **After save in Dump Mode**:
  - Show toast: "📥 Organizing your dump..."
  - After organization completes: "✅ Done. 3 notes created"
  - Option to open organized notes

### Database Changes
- Add `dumpMode: Boolean` to Note model (optional, for tracking)

### API Changes
- Modify `POST /api/notes` to accept `dumpMode: true` parameter
- When true:
  - Skip upfront validation (just validate not empty)
  - Run organization in background without blocking response
  - Return immediately

### Testing
- Test with messy, multiple-topic input
- Verify organization runs in background
- Check that user sees organized result

---

## Implementation Sequence

1. **Week 1**: 3A (Split Notes UI) + 3E (Dump Mode)
   - Both use existing backend logic
   - Relatively quick UI work

2. **Week 2**: 3C (Semantic Search)
   - Verify embeddings are stored
   - Build search endpoint + UI
   - Test accuracy

3. **Week 2–3**: 3B (RightPanel)
   - Depends on 3C (semantic search)
   - Build insights endpoint
   - Integrate into RightPanel component

4. **Week 3**: 3D ("Organize This Dump")
   - Depends on 3C (search) to show related notes
   - Build analyze endpoint
   - Polish UX

---

## Database Migrations Needed

```sql
-- Add to User model (optional, for preferences)
ALTER TABLE "UserPreferences" ADD COLUMN "dumpModeDefault" BOOLEAN DEFAULT false;

-- Add to Note model
ALTER TABLE "Note" ADD COLUMN "originNoteId" VARCHAR;
ALTER TABLE "Note" ADD CONSTRAINT "fk_Note_originNoteId" 
  FOREIGN KEY ("originNoteId") REFERENCES "Note"("id") ON DELETE SET NULL;

-- Ensure pgvector extension enabled
-- (run manually on your database, outside Prisma)
```

---

## Files to Create/Modify

### New Files
- `src/components/notes/SplitModal.tsx`
- `src/components/notes/RightPanelInsights.tsx`
- `src/components/search/SemanticSearch.tsx`
- `src/components/modals/DumpModal.tsx`
- `src/app/api/notes/[id]/split/route.ts`
- `src/app/api/notes/[id]/insights/route.ts`
- `src/app/api/search/semantic/route.ts`
- `src/app/api/notes/analyze-dump/route.ts`

### Modify
- `src/components/layout/RightPanel.tsx` → integrate insights
- `src/app/(app)/search/page.tsx` → semantic search UI
- `src/components/layout/CaptureBar.tsx` → add Dump Mode toggle
- `src/lib/ai.ts` → verify embeddings are working

---

## Success Criteria

✅ Split Notes:
- User can split messy note into 3+ structured cards
- All created notes have titles, categories, types

✅ RightPanel Insights:
- Shows 3 related notes with similarity scores
- Lists tasks extracted from current note
- Shows entities mentioned

✅ Semantic Search:
- Search "billing issues" finds notes about payments
- Search "team" finds notes about people collaboration
- Results ranked by similarity

✅ Organize This Dump:
- Paste 5-line brain dump → 2-3 structured notes
- User can review before creating
- All notes get auto-organized

✅ Dump Mode:
- User checks "Dump Mode", captures messy note
- Note gets split + organized automatically
- User sees organized result in toast

---

## Notes

- All of this uses existing AI infrastructure (`organizeNote`, `splitNote`, embeddings)
- The work is mostly UI + wiring endpoints together
- No new AI models needed
- Database schema is mostly ready (just add `originNoteId` for tracking)
- Phase 3 = foundation for everything that comes next (Focus Mode, Planning Mode, etc.)
