-- =============================================================================
-- Frequency Community Platform — Hierarchy v3
-- Phase 3.1: Topical Channels + bottom-up emergence foundation
-- =============================================================================
-- Changes:
--   1. Create a NEW `topical_channels` table for the global topical layer
--      (Spirituality, Activism, Holistic Health, etc.). Existing `channels`
--      table is left untouched and now means "hub/nexus-scoped focus groups."
--   2. Create `topical_channel_memberships` so users can "tune in" worldwide.
--   3. Add `circles.topical_channel_id` so every Circle declares one topic.
--   4. Relax `circles.hub_id` and `hubs.nexus_id` to NULL so Circles can
--      exist before a Hub/Nexus crystallises (bottom-up emergence).
--   5. Add location fields to `circles` so an in-person Circle is anchored
--      to a place before a Hub forms.
--   6. Update the hub-circle-limit trigger to skip orphan Circles.
--   7. Seed the initial v1 topical Channels.
--
-- See Notion: "Hierarchy v3 · Channels, Circles, Hubs & Nexuses"
-- https://www.notion.so/36efb0d4b94181a68c9dd2695fb3a3a0
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 1: Create `topical_channels` table — GLOBAL TOPICAL layer
-- ---------------------------------------------------------------------------
-- Topical Channels are the worldwide topical online forum. Anyone can read,
-- anyone can join. The seasonal curriculum (added in a later migration)
-- lives on the Channel. Each Circle declares exactly one Channel as its
-- topic.

CREATE TABLE topical_channels (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text         NOT NULL,
  slug          text         NOT NULL UNIQUE,
  category      text         NOT NULL,
  description   text,
  cover_image   text,
  display_order integer      NOT NULL DEFAULT 0,
  is_active     boolean      NOT NULL DEFAULT true,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX idx_topical_channels_category     ON topical_channels (category);
CREATE INDEX idx_topical_channels_active_order ON topical_channels (is_active, display_order);


-- ---------------------------------------------------------------------------
-- STEP 2: Create `topical_channel_memberships`
-- ---------------------------------------------------------------------------
-- A user "tunes in" to a Topical Channel. No cap, no scope. Used for the
-- feed and for surfacing relevant Circles to the member.

CREATE TABLE topical_channel_memberships (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  topical_channel_id uuid        NOT NULL REFERENCES topical_channels (id) ON DELETE CASCADE,
  profile_id         uuid        NOT NULL REFERENCES profiles          (id) ON DELETE CASCADE,
  joined_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (topical_channel_id, profile_id)
);

CREATE INDEX idx_tcm_channel ON topical_channel_memberships (topical_channel_id);
CREATE INDEX idx_tcm_profile ON topical_channel_memberships (profile_id);


-- ---------------------------------------------------------------------------
-- STEP 3: Link Circles to Topical Channels
-- ---------------------------------------------------------------------------
-- Every Circle declares one Topical Channel topic. Nullable for now during
-- data migration; a follow-up migration enforces NOT NULL once existing
-- Circles are backfilled.

ALTER TABLE circles
  ADD COLUMN topical_channel_id uuid REFERENCES topical_channels (id) ON DELETE SET NULL;

CREATE INDEX idx_circles_topical_channel_id ON circles (topical_channel_id);


-- ---------------------------------------------------------------------------
-- STEP 4: Bottom-up emergence — relax NOT NULL on parent FKs
-- ---------------------------------------------------------------------------
-- A Circle can be founded before a Hub exists; a Hub can be named before a
-- Nexus crystallises. Parent linkage is set later when clusters form.

ALTER TABLE circles ALTER COLUMN hub_id   DROP NOT NULL;
ALTER TABLE hubs    ALTER COLUMN nexus_id DROP NOT NULL;


-- ---------------------------------------------------------------------------
-- STEP 5: Location anchoring on Circles
-- ---------------------------------------------------------------------------
-- For in-person Circles existing before a Hub crystallises, a location is
-- needed so members can find them and so a Hub can later be auto-clustered
-- by proximity.

ALTER TABLE circles
  ADD COLUMN city          text,
  ADD COLUMN neighborhood  text,
  ADD COLUMN latitude      numeric(9,6),
  ADD COLUMN longitude     numeric(9,6),
  ADD COLUMN timezone      text;


-- ---------------------------------------------------------------------------
-- STEP 6: Update Hub-Circle limit trigger to skip orphan Circles
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_hub_circle_limit()
RETURNS TRIGGER AS $$
DECLARE v_count integer;
BEGIN
  -- Skip the check when the Circle has no Hub yet (bottom-up mode)
  IF NEW.hub_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM   circles
  WHERE  hub_id = NEW.hub_id AND status != 'archived';

  IF v_count >= 5 THEN
    RAISE EXCEPTION 'Hub has reached maximum Circle capacity (5)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------------
-- STEP 7: RLS for topical_channels + topical_channel_memberships
-- ---------------------------------------------------------------------------

ALTER TABLE topical_channels             ENABLE ROW LEVEL SECURITY;
ALTER TABLE topical_channel_memberships  ENABLE ROW LEVEL SECURITY;

-- ── topical_channels ── (global, public read; janitor-only write for v1)
CREATE POLICY "topical_channels: public read active"
  ON topical_channels FOR SELECT
  USING (is_active = true OR get_my_role() = 'janitor');

CREATE POLICY "topical_channels: janitor insert"
  ON topical_channels FOR INSERT
  WITH CHECK (get_my_role() = 'janitor');

CREATE POLICY "topical_channels: janitor update"
  ON topical_channels FOR UPDATE
  USING (get_my_role() = 'janitor');

CREATE POLICY "topical_channels: janitor delete"
  ON topical_channels FOR DELETE
  USING (get_my_role() = 'janitor');

-- ── topical_channel_memberships ── (anyone joins/leaves their own)
CREATE POLICY "tcm: read own"
  ON topical_channel_memberships FOR SELECT
  USING (
    profile_id = get_my_profile_id()
    OR get_my_role() = 'janitor'
  );

CREATE POLICY "tcm: anyone authenticated joins own"
  ON topical_channel_memberships FOR INSERT
  WITH CHECK (profile_id = get_my_profile_id());

CREATE POLICY "tcm: leave own"
  ON topical_channel_memberships FOR DELETE
  USING (profile_id = get_my_profile_id());


-- ---------------------------------------------------------------------------
-- STEP 8: Seed v1 Topical Channels
-- ---------------------------------------------------------------------------

INSERT INTO topical_channels (name, slug, category, description, display_order) VALUES
  ('Spirituality',     'spirituality',     'spirituality',     'Practice, presence, and the path within.',                       1),
  ('Movement',         'movement',         'movement',         'Embodied practice — breath, body, dance, yoga.',                 2),
  ('Holistic Health',  'holistic-health',  'holistic-health',  'Whole-being wellness — nutrition, sleep, healing.',              3),
  ('Human Relating',   'human-relating',   'human-relating',   'Conscious communication, intimacy, conflict, repair.',           4),
  ('Activism',         'activism',         'activism',         'Engaged practice for the world we''re building.',                5),
  ('Creative',         'creative',         'creative',         'Art, music, writing, expression as practice.',                   6),
  ('Business Support', 'business-support', 'business-support', 'Soulful work — entrepreneurship, livelihood, mission.',          7)
ON CONFLICT (slug) DO NOTHING;
