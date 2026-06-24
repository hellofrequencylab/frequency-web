-- =====================================================================
-- Starter Circles, part 1 of 3: schema.
-- =====================================================================
-- A Starter Circle is a staff-authored, reusable BLUEPRINT for an ongoing
-- club. A would-be leader browses the gallery, adopts one ("Make it yours"),
-- gets a private draft they own, edits it, and publishes a COMPLETELY ORIGINAL
-- live Circle (no link back, no template badge). Pillars are NOT how Circles
-- are sorted — each Circle leans ONE primary Pillar and carries the other three
-- inside it. Channels are intentionally omitted (the Channel taxonomy is being
-- reworked): bind to a primary Pillar only.
--
-- Two new tables + a thin extension of `circles`:
--   1. circle_templates  — the 12 blueprints (the catalog). Operator-managed.
--   2. circle_profiles    — 1:1 companion to `circles` holding the rich adopted
--      content (Pillars-inside, agreements, rhythm, remix ideas, edit-mode
--      callouts). Kept OFF `circles` so the hot table stays lean and the live
--      page-overhaul queries are untouched.
--   3. circles.primary_pillar + circles.origin_template_id (first-class because
--      they are queried/filtered: "circles by Pillar", provenance analytics).
--
-- Toggle model mirrors the demo system: a per-template `is_active` switch plus a
-- global `platform_flags` master key. Writes go through the service-role admin
-- client (staff-gated server actions); RLS only governs reads. Idempotent.
-- =====================================================================

-- ── 1. circle_templates — the blueprint catalog ──────────────────────
CREATE TABLE IF NOT EXISTS circle_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,
  name          text        NOT NULL,
  -- The lean. One of the four Pillars; carries the other three inside it.
  primary_pillar text       NOT NULL
    CHECK (primary_pillar IN ('mind','body','spirit','expression')),
  identity      text        NOT NULL,                 -- one line: what it is / who for
  audience      text        NOT NULL,                 -- "who it is for"
  card          text        NOT NULL,                 -- skeptic-proof hook, <~12 words
  one_liner     text        NOT NULL,                 -- ~25 words
  about         text,                                  -- fuller intro (optional)
  -- One concrete line each for Mind/Body/Spirit/Expression. Primary derives
  -- from primary_pillar. Shape: { mind, body, spirit, expression }.
  pillars_inside jsonb      NOT NULL DEFAULT '{}'::jsonb,
  -- Standing rhythm. Shape: { text, length } / { text }.
  meetup        jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- midweek Circle Meetup
  gathering     jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- Weekend Gathering
  thread        text,                                  -- the always-on online space
  format        text,                                  -- in person / virtual / hybrid guidance
  size_label    text,                                  -- e.g. "5 to 10"
  agreements    jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- 3-4 plain norms (string[])
  -- The Pillar Journey this Circle runs as a Run; null = any (Expression).
  recommended_journey_pillar text
    CHECK (recommended_journey_pillar IN ('mind','body','spirit','expression')),
  remix_options jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- Host variations (string[])
  -- Edit-mode-only best-practice instruction boxes carried by THIS template.
  -- Shape: [{ anchor, title, body }]. The standard library lives in code.
  callouts      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  image_url     text,
  is_active     boolean     NOT NULL DEFAULT false,    -- per-template on/off
  display_order integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_circle_templates_active
  ON circle_templates (display_order) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_circle_templates_pillar
  ON circle_templates (primary_pillar);

ALTER TABLE circle_templates ENABLE ROW LEVEL SECURITY;

-- Public read of ACTIVE templates (anon + authed) feeds the member gallery.
-- Inactive/draft templates are read by the operator admin via the service-role
-- admin client (RLS-bypassing), so there is no client read path to them. No
-- INSERT/UPDATE/DELETE policy => clients cannot write (service role only).
DROP POLICY IF EXISTS "circle_templates: read active" ON circle_templates;
CREATE POLICY "circle_templates: read active"
  ON circle_templates FOR SELECT USING (is_active);

-- ── 2. circle_profiles — rich content for a live/draft Circle ─────────
CREATE TABLE IF NOT EXISTS circle_profiles (
  circle_id     uuid        PRIMARY KEY REFERENCES circles (id) ON DELETE CASCADE,
  pillars_inside jsonb      NOT NULL DEFAULT '{}'::jsonb,
  meetup        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  gathering     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  thread        text,
  format        text,
  size_label    text,
  agreements    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  recommended_journey_pillar text
    CHECK (recommended_journey_pillar IN ('mind','body','spirit','expression')),
  remix_options jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- Edit-mode-only callouts copied from the template on adopt. Travel into the
  -- draft, render only while editing, vanish on publish/preview.
  editor_notes  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE circle_profiles ENABLE ROW LEVEL SECURITY;

-- A profile is readable exactly when its parent Circle is: live to all authed,
-- drafts to the owner + guide+ oversight, archived to host+ (mirrors the circle
-- policy below so draft content never leaks). Writes go through the service
-- role only (no write policy).
DROP POLICY IF EXISTS "circle_profiles: read when circle visible" ON circle_profiles;
CREATE POLICY "circle_profiles: read when circle visible"
  ON circle_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM circles c
      WHERE c.id = circle_profiles.circle_id
        AND (
          (c.status <> 'archived' AND c.status <> 'draft')
          OR (c.status = 'archived' AND get_my_role() >= 'host')
          OR (c.status = 'draft' AND (c.host_id = get_my_profile_id() OR get_my_role() >= 'guide'))
        )
    )
  );

-- ── 3. Extend circles: primary Pillar + template provenance ──────────
ALTER TABLE circles ADD COLUMN IF NOT EXISTS primary_pillar text
  CHECK (primary_pillar IN ('mind','body','spirit','expression'));
ALTER TABLE circles ADD COLUMN IF NOT EXISTS origin_template_id uuid
  REFERENCES circle_templates (id) ON DELETE SET NULL;

-- origin_template_id is INTERNAL analytics only — never surfaced, so a published
-- Circle reads as completely original. Partial indexes keep the common paths free.
CREATE INDEX IF NOT EXISTS idx_circles_origin_template
  ON circles (origin_template_id) WHERE origin_template_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_circles_draft
  ON circles (host_id) WHERE status = 'draft';

-- ── 4. Tighten the circles read policy to hide drafts ────────────────
-- Preserves prior semantics exactly for forming/active/inactive (all authed)
-- and archived (host+); ADDS drafts visible only to the owner or guide+.
DROP POLICY IF EXISTS "circles: authenticated read non-archived" ON circles;
CREATE POLICY "circles: authenticated read non-archived"
  ON circles FOR SELECT
  USING (
    (status <> 'archived' AND status <> 'draft')
    OR (status = 'archived' AND get_my_role() >= 'host')
    OR (status = 'draft' AND (host_id = get_my_profile_id() OR get_my_role() >= 'guide'))
  );

-- ── 5. Global master switch (mirrors demo_mode) ──────────────────────
INSERT INTO platform_flags (key, value)
VALUES ('circle_templates_enabled', false)
ON CONFLICT (key) DO NOTHING;

-- ── 6. updated_at touch triggers ─────────────────────────────────────
CREATE OR REPLACE FUNCTION circle_templates_touch_updated_at()
RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_circle_templates_touch ON circle_templates;
CREATE TRIGGER trg_circle_templates_touch
  BEFORE UPDATE ON circle_templates
  FOR EACH ROW EXECUTE FUNCTION circle_templates_touch_updated_at();

DROP TRIGGER IF EXISTS trg_circle_profiles_touch ON circle_profiles;
CREATE TRIGGER trg_circle_profiles_touch
  BEFORE UPDATE ON circle_profiles
  FOR EACH ROW EXECUTE FUNCTION circle_templates_touch_updated_at();
