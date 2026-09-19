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

/** The one narrative spine every pricing/marketing surface can reuse verbatim (owner plan story,
 *  2026-07): what is free, WHY a plan, and how the rate works, stated so a skeptic believes it. No em
 *  dashes.
 *
 *  🔴 THE REASON TO TAKE A PLAN LIVES HERE NOW (LIVE-253, ADR-1350), because it is an argument and
 *  arguments drift exactly the way figures did. Eighteen public strings each typed their own version of
 *  it and fourteen of them said the opposite of the model: that a plan buys a lower rate and higher
 *  caps, which reads a free Space as the small version of a paid one. docs/CORE-MODEL.md is explicit
 *  that it is not (§1 "Businesses host free", §2 "gate at the point where it starts making them
 *  money", which is ADR-914's "never gate the transaction, gate the repeat"). The rate and the meters
 *  are still stated, because both are true; what changed is that neither is the reason any more. */
export const PLAN_STORY = {
  /** The whole spine in one breath. */
  spine:
    'Frequency is where your local community happens. People join free. Businesses host free. You pay when you start charging, and never for access to people.',
  /** WHY a plan, in the model's own terms: the moment, not the meter. The free rung is the whole
   *  product, the transaction is never walled, and a plan is what the REPEAT runs on. Every surface
   *  interpolates this instead of arguing it again; the capabilities it names are read off the gate map
   *  (paidWalls), so the sentence and the product cannot disagree. */
  paid:
    'A plan is what you take when money starts moving. Never the transaction: a free Space sells tickets, takes donations, and sells memberships from day one once payouts are ready, and a free Space is the whole thing, not a trial of it. What a plan carries is the repeat: campaigns and funnels that bring new people in, month after month.',
  /** The rate, stated as the consequence it is. It used to be the sales argument on every surface,
   *  which made the ladder read as a fee ladder you climb to pay less, rather than as one price you
   *  take once you are charging. */
  rate:
    'The rate is what a plan settles at, not what a plan is for. It applies only to a sale the network introduced, and it is lower on a paid plan.',
  /** The meter framing: paid is how much, never whether. */
  meters:
    'Everything is included on every plan. The free allowances are real, and a full meter never hides, deletes, or locks what is already there.',
  /** The honest yearly framing. It used to carry the Opening Beta line ("beta rates hold through the
   *  Summer of Frequency"), which stopped being true when the owner closed the window on 2026-08-17
   *  (ADR-1060). What replaces it is the deal that survived: the same price whenever you start, and two
   *  months free on the year. */
  founding: 'Every plan is one price, the same whenever you start, and paying for the year is two months free.',
} as const
