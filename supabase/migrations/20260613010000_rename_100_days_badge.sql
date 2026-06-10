-- =============================================================================
-- Rename the 100-day practice-streak badge: "Hundred Days Deep" → "100 Days"
-- (owner decision, June 2026; NAMING.md). The old name carried the retired tier
-- word "Deep"; "100 Days" is plain and on-voice (CONTENT-VOICE: numbers over
-- adjectives). slug `practice-streak-100` is the stable id and is UNCHANGED, so
-- no member's earned badge is affected. Idempotent (guarded by the old name).
-- =============================================================================

UPDATE public.achievements
   SET name = '100 Days'
 WHERE slug = 'practice-streak-100'
   AND name = 'Hundred Days Deep';
