// The go-live map of quantities, split out of feature-meters.ts so a module can read a NUMBER
// without pulling that file's copy into its chunk. `lib/admin/modules/space-modules.ts` is a static
// import of the app shell (components/layout/settings-panel.tsx), so an edge from there into
// feature-meters puts ALLOWANCE_NUDGE and the whole meter config in every member's first-load JS —
// the regression dc47b89 fixed and `check:shell-weight` guards. Still ONE source of quantities
// (ADR-837): feature-meters.ts re-exports both symbols, so every existing import site is unchanged.

/** The sentinel for an UNLIMITED allowance (a tier with no cap on this dimension). PURE data, so the
 *  ladder + `withinAllowance` treat `null` as "never blocked". */
export type Allowance = number | null // a numeric cap, or null = unlimited


// ── THE ONE GO-LIVE MAP OF QUANTITIES (ADR-837) ─────────────────────────────────────────────────────

/** @placeholder THE single per-feature, per-tier allowance map — every metered quantity in the product
 *  lives HERE and nowhere else, so the go-live edit is ONE map (the quantities sibling of the
 *  PLACEHOLDER_*_PRICE_CENTS maps in feature-tiers.ts). Number = cap, null = unlimited; keys are tiers on
 *  the feature's axis. EVERY value is a PREVIEW while PLACEHOLDER_ALLOWANCES is true: meters inform, and
 *  `withinAllowance` never hard-blocks (ADR-782 beta-soft). The real limits are the owner's go-live call.
 *
 *  Sources per row (mirrored, not invented, wherever the codebase already carries a number):
 *   - space_crm 200 free            — docs/VALUE-LADDER.md §3 (lowered from 250 by ADR-914).
 *   - space_email 300/mo free       — §2; Business 5,000 and Collective 25,000 are the §2 "5k → 25k
 *                                     steps". Separately, lib/spaces/email.ts DAILY_SEND_CAP = 500/day is
 *                                     a LIVE per-day throttle on every plan (deliverability, not pricing).
 *   - space_qr 3 free / 500 Business — MIRRORS the LIVE cap in lib/qr/space-codes.ts PLAN_CODE_CAPS
 *                                     (free 3, business 500). Collective unlimited is a placeholder; the
 *                                     live map has no collective row yet (it falls to the free cap).
 *   - space_automation 1,000 runs/mo on Business — placeholder included volume (the feature itself is
 *                                     the Business on/off, FEATURE_GATES.space_automation).
 *   - space_team 1 free             — MIRRORS lib/spaces/seats.ts BASE_SEAT_ALLOWANCE (the owner's seat,
 *                                     ADR-799). Collective 3 = placeholder INCLUDED seats; more seats
 *                                     stay the ADR-799 per-seat add-on, never blocked by this meter.
 *   - space_vera 10/day free        — mirrors PRICING_DEFAULTS.vera_free_daily_cap (§2 "~10 msgs / day").
 *   - bookings 15/mo, journey 10, memberships 10, tickets 50, pipelines 1 — the §2 free-cap table.
 *   - space_journey_publish 1 free  — MIRRORS the LIVE free-space publish cap (owner decision
 *                                     2026-07-18; was FREE_PUBLISHED_JOURNEY_LIMIT). Business/
 *                                     Collective unlimited mirrors the live paid-unlimited behavior.
 *   - journey_publish 1 free        — the SAME live personal cap on the tier axis; publish-limits.ts
 *                                     now reads FREE_PUBLISHED_JOURNEY_LIMIT from this row (ADR-838).
 *                                     Crew 25 is a placeholder "higher cap" (was unlimited pre-838).
 *   - journey_enrollees 10 free     — mirrors space_journey's free 10 on the personal axis (ADR-838). */
export const PLACEHOLDER_METER_LIMITS: Record<string, Record<string, Allowance>> = {
  space_crm: { free: 200, business: null },
  space_email: { free: 300, business: 25_000 },
  space_bookings: { free: 15, business: null },
  space_journey: { free: 10, business: null },
  space_journey_publish: { free: 1, business: null },
  space_tickets: { free: 50, business: null },
  space_qr: { free: 3, business: null },
  space_automation: { free: 50, business: 1_000 },
  space_team: { free: 1, business: 2 },
  space_multi_pipeline: { free: 1, business: null },
  space_vera: { free: 10, business: 200 },
  space_crm_playbooks: { free: 100, business: 5_000 },
  space_crm_resonance_ai: { free: 10, business: 2_000 },
  space_collaborators: { free: 1, business: null },
  space_membership_tiers: { free: 1, business: null },
  space_member_benefits: { free: 1, business: null },
  vera_unlimited: { free: 10, crew: null },
  // FIRST ONE FREE — the personal leadership allowances. A free Member leads at one of each; Crew leads
  // at scale. Nothing here is a wall: a free Member still hosts a real Circle and is still made a Host
  // (community_role stays earned, never billing — ADR-207).
  journey_publish: { free: 1, crew: null },
  journey_enrollees: { free: 10, crew: null },
  circle_host: { free: 1, crew: null },
  // FREE 3 (LIVE-225 / ADR-908's original number, restored). Authoring is no longer a door:
  // `practice.create` is open to any signed-in member (lib/core/capabilities.ts), so the free rung is
  // a real quantity again rather than a mirror of a gate. This row read `free: 0` while the capability
  // gate stood, on the rule that the map must never contradict shipped behavior. That rule still holds
  // and is why the two moved together: the gate opened in the same change this number did.
  practice_publish: { free: 3, crew: null },
  event_create: { free: 2, crew: null },
}
