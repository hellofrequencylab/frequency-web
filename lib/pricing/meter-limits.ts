// The go-live map of quantities, split out of feature-meters.ts so a module can read a NUMBER
// without pulling that file's copy into its chunk. `lib/admin/modules/space-modules.ts` is a static
// import of the app shell (components/layout/settings-panel.tsx), so an edge from there into
// feature-meters puts ALLOWANCE_NUDGE and the whole meter config in every member's first-load JS —
// the regression dc47b89 fixed and `check:shell-weight` guards. Still ONE source of quantities
// (ADR-837): feature-meters.ts re-exports both symbols, so every existing import site is unchanged.

/** The sentinel for an UNLIMITED allowance (a tier with no cap on this dimension). PURE data, so the
 *  ladder + `withinAllowance` treat `null` as "never blocked". */
export type Allowance = number | null // a numeric cap, or null = unlimited

/** Plans that share a rank with a ladder rung (Non Profit and Independent with Business, Non Profit
 *  Collective with Collective). A row MAY give one of them its own number, which wins for that plan;
 *  otherwise it reads its rung. They are never rungs of the displayed ladder themselves. */
export const SIBLING_PLAN_TIERS: readonly string[] = ['nonprofit', 'independent', 'nonprofit_collective']


// ── THE ONE GO-LIVE MAP OF QUANTITIES (ADR-837) ─────────────────────────────────────────────────────

/** @placeholder THE single per-feature, per-tier allowance map — every metered quantity in the product
 *  lives HERE and nowhere else, so the go-live edit is ONE map (the quantities sibling of the
 *  PLACEHOLDER_*_PRICE_CENTS maps in feature-tiers.ts). Number = cap, null = unlimited; keys are tiers on
 *  the feature's axis. While pricing_settings.beta_grace holds (until 2026-12-01) meters inform and
 *  `withinAllowance` never hard-blocks (ADR-782 beta-soft); from that date every count here enforces
 *  with no deploy.
 *
 *  THE NUMBERS ARE THE FIVE-TIER LADDER (ADR-1709, LIVE-748), from the owner's pricing ladder report of
 *  2026-10-06. Plan-axis rows carry three rungs: `free` (the free Space), `business` and `collective`.
 *  Non Profit and Independent rank with Business and Non Profit Collective ranks with Collective
 *  (PLAN_CAPABILITY_RANK), so they read those rungs with no column of their own. Tier-axis rows carry
 *  `free` (a Member) and `crew` (the Crew host kit).
 *
 *  A row may also name a SIBLING_PLAN_TIERS plan when the owner gave it its own number (space_qr).
 *
 *  Rows the ladder report does not name keep their earlier free and Business numbers, and Collective
 *  never gets LESS than Business: space_tickets, space_crm_playbooks, space_member_benefits.
 *
 *  Live mirrors that read a row here rather than keeping their own number:
 *   - space_qr     — lib/qr/space-codes.ts (the cap a Space hits IS this row).
 *   - space_team   — lib/spaces/seats.ts baseSeatAllowance (more seats stay the ADR-799 add-on).
 *   - vera_unlimited.free — PRICING_DEFAULTS.vera_free_daily_cap.
 *   - journey_publish / space_journey_publish — lib/journeys/publish-limits.ts (ADR-838).
 *  Separately, lib/spaces/email.ts DAILY_SEND_CAP is a per-day deliverability throttle on every plan,
 *  not pricing. */
export const PLACEHOLDER_METER_LIMITS: Record<string, Record<string, Allowance>> = {
  space_crm: { free: 250, business: 5_000, collective: 25_000 },
  space_email: { free: 1_000, business: 25_000, collective: 100_000 },
  space_bookings: { free: 20, business: null, collective: null },
  space_journey: { free: 25, business: null, collective: null },
  space_journey_publish: { free: 1, business: 10, collective: null },
  space_tickets: { free: 50, business: null, collective: null },
  // QR codes (owner ruling 2026-10-06, after the ladder report): a free Space gets its stock QR code,
  // downloadable and not editable, and no managed (dynamic) codes. Business 3. Collective and Non
  // Profit 5 per entity: per Space, so each member Space of a Collective carries its own 5.
  space_qr: { free: 0, business: 3, collective: 5, nonprofit: 5, nonprofit_collective: 5 },
  space_automation: { free: 100, business: 2_000, collective: 10_000 },
  space_team: { free: 1, business: 2, collective: 5 },
  space_multi_pipeline: { free: 1, business: 5, collective: null },
  space_vera: { free: 10, business: 200, collective: null },
  space_crm_playbooks: { free: 100, business: 5_000, collective: 5_000 },
  space_crm_resonance_ai: { free: 10, business: 2_000, collective: 10_000 },
  space_collaborators: { free: 0, business: 3, collective: null },
  space_membership_tiers: { free: 1, business: 5, collective: null },
  space_member_benefits: { free: 1, business: null, collective: null },
  // New Space meters (LIVE-750, ADR-1709). The Space Circle counts toward space_circles; events count
  // while upcoming; guests are per Event; shop listings on free are inquiries only (selling is LIVE-753).
  space_circles: { free: 3, business: 10, collective: null },
  space_events: { free: 5, business: null, collective: null },
  space_event_guests: { free: 100, business: null, collective: null },
  space_practice_publish: { free: 5, business: null, collective: null },
  space_services: { free: 1, business: null, collective: null },
  space_shop_listings: { free: 5, business: null, collective: null },
  vera_unlimited: { free: 10, crew: null },
  // FIRST ONE FREE — the personal leadership allowances. A free Member leads at one of each; Crew gets
  // the host kit (ADR-1709): 5 Circles, 10 Events, 5 Journeys, 50 people per Journey. Nothing here is
  // a wall: a free Member still hosts a real Circle and is still made a Host (community_role stays
  // earned, never billing — ADR-207).
  journey_publish: { free: 1, crew: 5 },
  journey_enrollees: { free: 10, crew: 50 },
  circle_host: { free: 1, crew: 5 },
  // FREE 3 (LIVE-225 / ADR-908's original number). Authoring is open to any signed-in member
  // (`practice.create`, lib/core/capabilities.ts), so the free rung is a real quantity.
  practice_publish: { free: 3, crew: null },
  event_create: { free: 2, crew: 10 },
  // Guests per personal Event (LIVE-750): Member 30, Crew 100.
  event_guests: { free: 30, crew: 100 },
}
