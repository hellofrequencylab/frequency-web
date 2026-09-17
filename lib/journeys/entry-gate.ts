// WHO MAY OPEN A JOURNEY'S LESSONS (ADR-1397). PURE — no Supabase, no Next, no IO. The caller
// resolves the facts and passes plain data, matching journey-access.ts and run-gate.ts.
//
// ── WHY THIS EXISTS AT ALL ───────────────────────────────────────────────────────────────────────
//
// 🔴 UNTIL THIS SHIPPED, ENROLMENT GRANTED NOTHING. `/journeys/<slug>/learn` had exactly one gate —
// `visibility === 'private'` — so any signed-in member could read every lesson body, video and
// exercise of any public Journey without enrolling, and `journey_enrollments` was a progress record
// that no read path consulted. `journeyHasRoom` and `enroll_cap` had zero callers, so the seats an
// author set were decorative. You cannot sell access to a room with no door.
//
// So the owner ruled (2026-09-17) that EVERY Journey checks enrolment, not only priced ones. The
// wider rule is the one that makes enrolment mean something everywhere, and it is what makes
// `enroll_cap` real.
//
// ── THE FOUR WAYS IN, AND WHY EACH ONE ───────────────────────────────────────────────────────────
//
//   1. ENROLLED — the ordinary member. The thing enrolment now buys.
//   2. THE AUTHOR — you can always read what you wrote, published or not. Without this an author
//      would have to enrol in their own Journey to proof-read it.
//   3. A MANAGER — `journey.editSettings`, which getJourneyCapabilities resolves to platform staff
//      and to a manager of the owning Space. An operator answering a support ticket about lesson 4
//      must be able to open lesson 4.
//   4. NOBODY ELSE. Not "signed in", which is what the old rule effectively meant.
//
// ⚠️ A REFUSAL IS A REDIRECT, NEVER A 404. The Journey's own page IS its sales page: it carries the
// cover, the summary, the phase outline, the facts and the enrol control. Sending a refused visitor
// to `notFound()` would hide the one page built to convert them. `notFound()` stays for the case it
// was always for — a PRIVATE Journey that is not yours, which should not admit it exists.
//
// This module deliberately says nothing about PRICE. Whether the way in costs money is a question for
// the enrol control on the detail page; the lesson player only ever asks "are you in".

/** What the caller must know to answer "may this viewer open the lessons". */
export interface JourneyEntryFacts {
  /** The viewer's profile id, or null when signed out. */
  viewerProfileId: string | null
  /** The Journey's author (`journey_plans.author_id`), or null. */
  authorId: string | null
  /** `journey.editSettings` — platform staff or a manager of the owning Space. */
  canManage: boolean
  /** A live `journey_enrollments` row (or the legacy active adoption) for this viewer. */
  enrolled: boolean
}

/** May this viewer open the Journey's lessons? FAIL-CLOSED on a missing viewer. PURE. */
export function canEnterJourney(facts: JourneyEntryFacts): boolean {
  if (!facts.viewerProfileId) return false
  if (facts.canManage) return true
  if (facts.authorId && facts.authorId === facts.viewerProfileId) return true
  return facts.enrolled
}

/** Whether the viewer is inside on their OWN standing rather than on a manager's override. Kept
 *  separate because the two answer different questions: `canEnterJourney` decides the door, this
 *  decides whether to show a learner their progress or an operator a preview. PURE. */
export function entersAsLearner(facts: JourneyEntryFacts): boolean {
  return !!facts.viewerProfileId && facts.enrolled
}
