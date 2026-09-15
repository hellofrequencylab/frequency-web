// THE PLAN STORY — the one narrative spine every pricing/marketing surface interpolates, alone in a
// module that imports NOTHING.
//
// 🔴 THE EMPTY IMPORT LIST IS THE POINT, NOT AN ACCIDENT OF SIZE. This constant lived in
// lib/pricing/pricing-page.ts until 2026-09-15, and that module carries a NINE-MODULE runtime chain
// (./gates, ./beta, ./pricing-grid, ./feature-tiers, ./plans, ./defaults, ./catalog-config, ./loadout,
// @/lib/billing/pricing-keys; its tenth import is now this file). Any surface wanting ONE approved
// sentence had to take that whole chain with it, so ADR-1363 could not give the page-editor block
// library the derivation the house rule demands (READ, never typed — ADR-916, ADR-1337, ADR-1350).
// dawn.tsx reached the pricing seam only through a type-only import that erases at compile, and the
// gates that would price a new runtime edge there (check:build-budget, check:og-trace,
// check:shell-weight, check:build-fanout) run only in `postbuild` on Vercel, never in CI. ADR-1368
// splits the sentences out instead, which costs nothing to import from anywhere.
//
// SO: DO NOT ADD AN IMPORT TO THIS FILE. If a sentence here needs a figure, the figure is
// interpolated by the CALLER, which already holds the catalog. A price belongs to the catalog
// (lib/billing/pricing-keys.ts, surfaced through lib/pricing/catalog-config.ts) and an argument
// belongs here; the moment the two mix in one module, the module stops being free to import.
//
// PURE + framework-independent (no React / Next / Stripe / Supabase), and now dependency-free besides.
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
    'A plan is what you take when money starts moving. Never the transaction: a free Space sells tickets and takes donations from day one, and a free Space is the whole thing, not a trial of it. What a plan carries is the repeat, the part where you make a standing promise to the same person and have to keep it.',
  /** The SAME argument as `paid`, compressed to two short sentences, for a surface with room for a
   *  line rather than a paragraph: a block kicker, a card footnote, a caption.
   *
   *  ⚠️ IT IS HERE RATHER THAN AT THE CALL SITE ON PURPOSE. A short form typed where it is needed is
   *  exactly how eighteen surfaces each grew their own version of the long one (ADR-1350), and it is
   *  the shape the retired sentence in `PlanBand.defaultProps.kicker` had (ADR-1363). Kept beside
   *  `paid` so the two cannot drift: the order of the claims is identical (selling is never the gate,
   *  the repeat is), only the sentence count differs. The same reasoning put `fromLabel` beside
   *  `CREW_NOTE.foundingLabel`.
   *
   *  These are the exact words ADR-1363 approved for that kicker, moved here rather than reworded, so
   *  the change that derives it moves no copy. */
  paidShort:
    'A plan is never what turns selling on. You take one when money starts moving and you have a standing promise to keep.',
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
