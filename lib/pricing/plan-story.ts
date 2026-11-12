// THE PLAN STORY — the approved narrative spine, and NOTHING ELSE.
//
// 🔴 THIS FILE HAS NO IMPORTS, AND THAT IS ITS WHOLE POINT (ADR-1368). It was carved out of
// lib/pricing/pricing-page.ts, which is a fine home for a server surface and a bad one for a copy
// constant: that module pulls a nine-import runtime chain (catalog-config, loadout, plans, gates,
// feature-tiers, beta, defaults, pricing-grid, billing/pricing-keys), so any module that wanted one
// approved SENTENCE had to take the whole pricing engine with it.
//
// ADR-1363 hit exactly that wall. A retired plan argument sat in a page-editor block DEFAULT
// (components/page-editor/blocks/dawn.tsx, PlanBand), the house rule is READ, never typed
// (ADR-916, ADR-1337, ADR-1350), and the derivation was still refused — because dawn.tsx reaches the
// pricing seam only through a TYPE-ONLY import that erases at compile, and importing pricing-page.ts
// would have pulled that chain into the marketing block library, which the page-editor renderer
// reaches broadly. The gates that price a fan-out (check:build-budget, check:og-trace,
// check:shell-weight, check:build-fanout) run ONLY in postbuild on Vercel, so the cost could not be
// measured before merging, and AGENTS.md is explicit that an unmeasured artifact change is the
// 2026-08-11 incident's shape. ADR-1363 named the fix: "the clean path is a leaf module holding
// PLAN_STORY with no imports of its own". This is that module.
//
// ⚠️ KEEP IT A LEAF. An import here is not a local change: it re-prices every surface that reads the
// spine, including the client-side block library, and it does so in a place no CI gate can see.
// Plain string literals only. If you need a computed figure, it belongs in pricing-page.ts, which is
// where the catalog, the gates and the grid already live.
//
// VOICE NOTE (CONTENT-VOICE §10): every string here is plain, honest, skeptic-proof, names what the
// thing is, never narrates the reader's feelings, makes no health claim, and uses NO em dashes.

/** The one narrative spine every pricing/marketing surface can reuse verbatim: what is free, WHY a
 *  plan, and how the network fee works, stated so a skeptic believes it. No em dashes.
 *
 *  THE PLAN LADDER (ADR-1709, LIVE-759). Members join, Crew hosts, a Space runs, Business adds tools,
 *  Collective connects, Network unites. Current selling options and fees depend on the plan and
 *  transaction. Card processing applies to paid transactions. The current details belong on /pricing.
 *
 *  Plan NAMES may appear here (they are the canon in docs/NAMING.md); prices and percentages never do.
 *  A surface that needs a figure reads it from the catalog or the rate vector beside this sentence. */
export const PLAN_STORY = {
  /** The whole spine in one breath. */
  spine:
    'Frequency is where your local community happens. People join free. Hosting a Space is free. Crew is a separate personal membership. Selling fees depend on your plan and buyer source; see /pricing for current details.',
  /** The three lines on their own (CORE-MODEL §1), for a surface that already has its own first
   *  sentence: the site description, the llms.txt header. PROG-R8 (ADR-1499) added this so the
   *  <meta> description and the crawler corpus READ the lines rather than retype them; the spine
   *  above keeps them too, because the home document's hero is the spine verbatim. */
  lines: 'People join free. Hosting a Space is free. Crew is a separate personal membership.',
  /** The ladder in one line: six tiers, one verb each (ADR-1709; Network added by the 2026-10-16 split). */
  ladder:
    'Six tiers, one verb each. Members join. Crew hosts. A Space runs. Business adds tools. Collective connects. Network unites.',
  /** WHY a plan, in the model's own terms: hosting is free, and paid plans add tools and selling
   *  options. Every surface interpolates this instead of arguing it again. */
  paid:
    'Hosting a Space is free. Crew is a separate personal membership for members who want to contribute and host more. The pricing page shows which tools, limits, selling options and fees apply to each Space plan.',
  /** The selling line: plan and transaction details determine the current options and fees. */
  selling:
    'Selling options and fees depend on your Space plan and the transaction. See /pricing for current details.',
  /** The fee line, kept generic until the live catalog and plan gates expose current options. */
  rate:
    'Selling options and fees depend on your Space plan and the transaction. Tips have no platform fee on any plan, though card processing still applies. See /pricing for current details.',
  /** The meter framing: plan tools and limits vary, and a full meter stops new writes without taking
   *  anything away. */
  meters:
    'Space tools and limits depend on the plan. A full meter only stops new writes. It never hides, deletes, or locks what is already there.',
  /** The Space and Crew upsell in one line, for any surface that opens a Space: the page, the doors, the
   *  emails. The requirement is ADR-810's creation gate, which bites when the beta ends. */
  crewSpace:
    'A Space is separate from Crew. Hosting a Space is free. Crew is a personal membership, with its own member host benefits. See /pricing for current plan details and fees.',
  /** Crew in one breath: support plus a host kit, in the canon's words (ADR-1084). */
  crew:
    'Crew is how a member backs the community and hosts more. It is separate from a Space plan. Members contribute what they want for Crew and receive the same personal membership benefits.',
  /** Collective in one breath: separate groups that partner (the 2026-10-16 split; Network is the
   *  one-owner-with-chapters plan). */
  collective:
    'Collective is for separate groups that partner: a hub that links partner Spaces, cross-listed Circles and Journeys, a shared calendar, and Vera AI included. Each partner keeps its own members and payouts.',
  /** Network in one breath: one organization, many chapters. */
  network:
    'Network is for one organization with chapters: one membership that works in every chapter, central admins who see the whole network, chapter leaders who run their own, one network calendar and home, and a roll-up report.',
  /** Keep the free Founding Member recognition distinct from the paid Founding Year offer. Current
   *  availability and terms belong on /pricing so this shared copy does not promise either. */
  founding:
    'Founding Member is free early-member recognition. Founding Year is a separate paid first-year offer with its own eligibility and terms. Check /pricing for current availability and terms. The beta runs through January 31, 2027.',
  /** CARD PROCESSING (LIVE-913, docs/VALUE-LADDER.md §2). Stripe's processing fee is always passed
   *  through. No percentage or "no fee" claim belongs in shared prose without the card-processing
   *  qualification. Two fragments, not sentences, because the caveat belongs inside the claim it
   *  qualifies: `plusProcessing` follows a rate and `afterProcessing` follows a kept share.
   *  `node scripts/probes/launch-0-4-fees.mjs` fails any claim in scope that drops them. */
  plusProcessing: 'plus card processing',
  afterProcessing: 'after card processing',
} as const
