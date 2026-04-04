# QNote Intended Workflow (Current Product Use Case)

This document describes the intended end-to-end workflow of QNote as implemented now, and how users should interact with the system for best results.

## Core Product Intent

QNote is not intended to be a passive note archive. It is intended to be a capture-first thinking assistant that:

- accepts messy input quickly,
- infers intent and structure,
- asks for clarification only when needed,
- learns from user feedback over time,
- and improves future organization quality.

## Primary User Journey

### Step 1: Fast Capture And Dump Entry Points

User enters raw thought in Capture Bar.

Optional hints:

- Project hint (if known)
- Context hint (if known)
- Tags (optional)

Alternate capture paths:

- Dump Mode for zero-friction background organization
- Organize This Dump modal for large pasted brain dumps, meeting notes, or copied text that should be reviewed before creation

Expected behavior:

- Note is created immediately.
- AI organization runs in background.

### Step 2: First-Pass AI Organization

AI produces:

- title,
- interpretive summary,
- intent,
- next action,
- priority,
- extracted tasks,
- entities,
- confidence score.

Expected behavior:

- High-confidence notes are effectively auto-applied.
- Medium-confidence notes are usable but still reviewable.
- Low-confidence notes surface clarification questions.

### Step 3: Clarification Loop (When Ambiguous)

If confidence is low:

- inbox cards and note detail show clarification questions,
- quick project/context chips appear,
- user can answer the question directly in natural language,
- user can click one hint,
- note is regenerated immediately using the selected hint or answer,
- follow-up questions narrow based on the conversation so far.

Expected behavior:

- confidence should increase,
- intent/next action should sharpen,
- category/project assignment should improve,
- the same clarification should not need to be asked repeatedly once it has been answered.

### Step 4: Bulk Clarify During Triage

For batches of related notes:

- user selects multiple notes in inbox,
- picks shared project/context hints,
- runs "Clarify + Regenerate".

Expected behavior:

- rapid triage of many notes,
- consistent classification across a cluster,
- less repetitive manual editing.

### Step 4.5: Reclassification Queue When Context Changes

When later notes reveal stronger context for older notes:

- background enrichment re-scores the changed-meaning queue,
- inbox surfaces a reclassification queue,
- right panel surfaces top changed-meaning notes,
- user can apply one or many suggested regroupings,
- affected notes are regenerated with the newer project/category context.

Expected behavior:

- older notes move toward the project/topic they actually belong to,
- context improvements can be applied in batches,
- QNote becomes less static and more self-correcting over time.

### Step 4.75: Dedicated Review Surface

When the user wants one place to process system-generated work:

- `/review` combines low-confidence notes and changed-meaning suggestions,
- forgotten-note resurfacing appears there when older notes still overlap with recent work,
- repeated-pattern cards show when recent notes keep circling the same theme,
- clarification can happen directly from the review page,
- regrouping suggestions can be applied in batches,
- forgotten-note and pattern cards can be snoozed or dismissed for a time window,
- suppressed review items remain visible as a recoverable count and can be restored directly from Review,
- Settings shows active suppressions and the snooze/dismiss/restore history for review items,
- this becomes the foundation for deeper resurfacing and synthesis.

### Step 5: Contextual Review in Note Detail + RightPanel

On note detail routes:

- main content shows summary, intent, next action, tasks, clarifications,
- RightPanel shows contextual related notes, inferred topic/project clusters, and note-level reorganization suggestions.

Expected behavior:

- user understands why the note matters,
- user sees what to do next,
- user can quickly navigate to relevant prior notes,
- user can apply better project/category context when new notes reveal a stronger grouping.

### Step 6: Learning Feedback Visibility

In Settings:

- AI Performance cards show current confidence, clarification rate, time-to-resolution, and queue health,
- 7d vs 30d trend arrows show whether behavior is improving,
- 30-day sparkline history shows month-shape movement over time,
- hint effectiveness table shows per-hint uses,
- average confidence lift is tracked,
- low-value hints can be identified and avoided.

Expected behavior:

- user can see if the system is actually learning,
- product team can monitor learning quality trends.

## Day-to-Day Workflow Example

Morning:

- user captures 10–20 mixed notes quickly,
- user uses Organize This Dump for any large multi-topic paste,
- AI organizes in background.

Midday triage:

- user opens inbox,
- user can switch to Review when they want a dedicated queue for clarification and regrouping,
- resolves low-confidence notes with chips or direct answers,
- applies any changed-meaning regrouping suggestions from the reclassification queue,
- bulk clarifies any grouped cluster.

Execution:

- user opens high-priority notes,
- follows next-action guidance,
- browses project/topic clusters when trying to reconnect fragmented conversations,
- works through extracted tasks.

Reflection:

- user checks related/contextual notes in RightPanel,
- user searches by meaning or exact wording to reconnect older notes quickly,
- revisits unresolved low-confidence items.

## Confidence-State Handling

### High confidence

- Auto-applied behavior is expected.
- Minimal user intervention.

### Medium confidence

- Suggestive behavior is expected.
- Quick review recommended.

### Low confidence

- Clarification behavior is required.
- User should provide project/context hints or answer directly in natural language.

## Product Boundaries (Current)

In scope now:

- capture,
- dump capture,
- dump analysis and review,
- organize,
- clarify,
- regenerate,
- semantic and keyword search with filters and typeahead,
- projects and topics cluster browsers,
- inferred project/topic clustering,
- note-level reorganization suggestions,
- changed-meaning reclassification queue,
- keyboard-first inbox triage,
- AI performance visibility,
- learn from hint interactions.

Planned next:

- resurfacing forgotten thinking,
- deeper workflow synthesis across notes,
- optional opt-in global training pipeline with strict privacy controls.

## Success Criteria for This Workflow

The current workflow is successful when:

- low-confidence notes trend downward over time,
- average confidence lift from hints stays positive,
- time-to-resolution trends downward over time,
- manual correction time decreases,
- users can triage notes quickly without losing nuance.
