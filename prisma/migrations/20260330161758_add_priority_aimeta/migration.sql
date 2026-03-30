-- Add AI-enriched priority and metadata fields to Note
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "priority" VARCHAR;
ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "aiMeta" JSONB;
