-- =============================================================================
-- Circle challenge adoptions — a circle takes on a global season challenge,
-- together (THE-QUEST.md; circle-scoped, collaborative).
--
-- WHY: season_challenges are GLOBAL (every member can progress one individually),
-- but there was no way for a circle to say "let's do THIS one as a group". The
-- CircleQuest module had a permanently-empty "Challenges" column as a result. This
-- models the missing link: a host adopts an existing global challenge for the
-- circle, and the module shows the circle's COLLECTIVE progress on it (how many
-- members have completed / are working on it). It reuses the existing per-member
-- challenge_progress engine wholesale — adoption only adds the circle framing.
--
-- COLLABORATIVE, NOT COMPETITIVE: this is the same ethos as Circle Field
-- (20260610000000_circle_field) — a circle's progress is a shared goal its members
-- pursue together, never an inter-circle ranking. As members of an adopting circle
-- complete the challenge, the circle's Circle Field is credited
-- (lib/events/circle-field.ts → awardCircleFieldForChallengeCompletion), so the
-- group's effort rolls up into the same shared standing as showing up to events.
--
-- RLS: SELECT for circle members (get_my_circle_ids(), SECURITY DEFINER helper) and
-- for anyone when the circle has opted into a public standing (resonance_public).
-- Writes are service-role-only (NO insert/update/delete policy) — the adopt/drop
-- server actions in app/(main)/circles/admin-actions.ts gate on circle.editSettings
-- via the admin client, exactly like every other circle mutation here. Capabilities
-- are the authority, not RLS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.circle_challenge_adoptions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    uuid        NOT NULL REFERENCES public.circles          (id) ON DELETE CASCADE,
  challenge_id uuid        NOT NULL REFERENCES public.season_challenges (id) ON DELETE CASCADE,
  -- WHO adopted it (a host). Kept for attribution; null-ok so the adoption survives
  -- the adopter leaving / being deleted.
  adopted_by   uuid        REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- A circle adopts a given challenge at most once.
  UNIQUE (circle_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_circle_challenge_adoptions_circle    ON public.circle_challenge_adoptions (circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_challenge_adoptions_challenge ON public.circle_challenge_adoptions (challenge_id);

ALTER TABLE public.circle_challenge_adoptions ENABLE ROW LEVEL SECURITY;

-- Read: members of the circle, OR anyone when the circle's standing is public.
-- Mirrors circle_field_transactions' read policy exactly.
DROP POLICY IF EXISTS "circle_challenge_adoptions: members or public read" ON public.circle_challenge_adoptions;
CREATE POLICY "circle_challenge_adoptions: members or public read"
  ON public.circle_challenge_adoptions FOR SELECT
  USING (
    circle_id = ANY (get_my_circle_ids())
    OR EXISTS (
      SELECT 1 FROM public.circles c
      WHERE c.id = circle_challenge_adoptions.circle_id
        AND c.resonance_public = true
    )
  );

-- No INSERT/UPDATE/DELETE policy: writes go through the admin client only, gated by
-- the circle.editSettings capability in the adopt/drop server actions.

COMMENT ON TABLE public.circle_challenge_adoptions IS
  'A circle taking on a global season_challenge together (collaborative). Per-member progress still lives in challenge_progress; this row only adds the circle framing the CircleQuest module reads. Writes are capability-gated in admin-actions.ts (service-role only).';
