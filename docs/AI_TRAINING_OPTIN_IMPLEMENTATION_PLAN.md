# AI Training Opt-In Implementation Plan

Related docs:
- [Implementation Summary](IMPLEMENTATION.md)
- [Phase 3 Plan](PHASE3_IMPLEMENTATION_PLAN.md)
- [Intended User Workflow](USE_CASE_WORKFLOW.md)

Goal: enable optional, privacy-safe learning from user interactions to improve global AI quality while preserving account-level personalization boundaries.

## Product Policy

- Training participation is strictly opt-in.
- Default experience remains fully functional with no training contribution.
- Users can opt out at any time.
- Users can request deletion of contributed training records.
- Personalization memory remains user-scoped and is never directly shared across users.

## Architecture Model

Two-layer learning:

1. Per-user personalization layer
- Uses per-account memory (projects, contexts, entities, hint behavior).
- Applies only to that user at inference time.
- Not used as raw cross-user training data by default.

2. Global model improvement layer (opt-in only)
- Uses de-identified aggregate events and labels.
- Improves ranking/classification components and prompt priors.
- Can later support fine-tuning for bounded tasks.

## Data Collection (Opt-In Only)

Collect only what is necessary for model improvement:

- Input shape metadata
- task type, note length bucket, ambiguity bucket
- AI output metadata
- predicted category/type/priority, confidence score
- User correction signals
- chip clicks, manual project/context/category edits, regenerate actions, acceptance/rejection patterns
- Outcome signal
- confidence lift, reduction in clarification count, time-to-resolution

Avoid collecting unnecessary raw note text unless explicitly included in consent scope.

## Data Safety Requirements

- De-identification pipeline before training export:
  - remove direct identifiers (email, phone, obvious names when possible)
  - hash stable IDs
  - redact high-risk patterns
- Region-aware handling for privacy regimes.
- Consent ledger with timestamp and policy version.
- Auditable inclusion/exclusion in training exports.

## Schema and API Changes (Planned)

1. User preferences
- Add fields to UserPreferences:
  - aiTrainingOptIn: Boolean (default false)
  - aiTrainingConsentVersion: String?
  - aiTrainingOptedInAt: DateTime?
  - aiTrainingOptedOutAt: DateTime?

2. Event storage
- Add TrainingEvent table (or event stream sink) for opt-in users.
- Store de-identified event payload, event type, createdAt, source model version.

3. Settings APIs
- PATCH /api/user/training-consent
- GET /api/user/training-consent
- POST /api/user/training-data-delete (user-requested deletion)

## Rollout Plan

Phase 1: Consent foundation
- Implement opt-in toggle and consent metadata storage.
- Gate all training-event writes behind opt-in flag.
- Add policy text and explicit consent confirmation UX.

Phase 2: Training event pipeline
- Emit training events from:
  - hint chip usage
  - note edits after AI output
  - regeneration actions
  - split acceptance/rejection decisions
- Build de-identification transform and retention policy.

Phase 3: Evaluation and model updates
- Build offline evaluation set and scorecards:
  - intent accuracy
  - project assignment quality
  - task extraction precision
  - confidence calibration error
- Train lightweight components first (classifiers/rankers), not full model replacement.
- Deploy in shadow mode and compare against control.

Phase 4: Controlled production rollout
- Feature flag by cohort.
- Monitor regressions and rollback thresholds.
- Report quality deltas and opt-in participation metrics.

## Evaluation Metrics

Primary quality metrics:
- Clarification rate per processed note
- Confidence lift after user interaction
- Manual correction rate after AI organization
- Time-to-resolved classification

Safety metrics:
- PII leakage checks in export samples
- False-positive redaction rate
- Data deletion SLA compliance

## Governance Checklist

Before enabling any training job:
- Consent text approved and versioned.
- Opt-in/off and delete flows functional.
- De-identification tests passing.
- Exports include only opted-in users.
- Evaluation gates configured with rollback criteria.

## Non-Goals (Initial)

- Training a frontier model from scratch.
- Mixing raw user notes across accounts without de-identification.
- Enabling training by default.

## Implementation Notes for QNote

  - project/context suggestion ranking
n  - confidence calibration model
  - split-vs-no-split classifier
