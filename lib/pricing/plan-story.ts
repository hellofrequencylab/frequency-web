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
 *  🔴 THE FIVE-TIER LADDER (ADR-1709, LIVE-759). Members join, Crew hosts, a Space runs, Business
 *  sells, Collective connects. Selling is what Business is for: a free Space keeps every business tool
 *  with limits sized for launch, and it takes tips, but paid tickets, paid memberships, donations, shop
 *  checkout and booking deposits open at Business. That reverses ADR-914's "never gate the
 *  transaction" and ADR-1415's free-Space memberships, which is why `paid` below no longer says a free
 *  Space sells. The reason to take a plan still lives here, in one place (LIVE-253, ADR-1350), and it
 *  is still never "a lower rate": the fee is a fact about introductions, stated in `rate`.
 *
 *  Plan NAMES may appear here (they are the canon in docs/NAMING.md); prices and percentages never do.
 *  A surface that needs a figure reads it from the catalog or the rate vector beside this sentence. */
export const PLAN_STORY = {
  /** The whole spine in one breath. */
  spine:
    'Frequency is where your local community happens. People join free. Businesses host free. You pay when you start charging, and never for access to people.',
  /** The three lines on their own (CORE-MODEL §1), for a surface that already has its own first
   *  sentence: the site description, the llms.txt header. PROG-R8 (ADR-1499) added this so the
   *  <meta> description and the crawler corpus READ the lines rather than retype them; the spine
   *  above keeps them too, because the home document's hero is the spine verbatim. */
  lines: 'People join free. Businesses host free. You pay when you start charging.',
  /** The ladder in one line: five tiers, one verb each (ADR-1709). */
  ladder: 'Five tiers, one verb each. Members join. Crew hosts. A Space runs. Business sells. Collective connects.',
  /** WHY a plan, in the model's own terms: free hosting is the point, and a plan is what you take when
   *  you start charging. Every surface interpolates this instead of arguing it again. */
  paid:
    'Hosting is free, and that is the point, not a teaser. A free Space runs the whole thing: your page, Circles, Events, contacts, email, bookings and Journeys, with limits sized for a launch. Business is what you take when you start charging, and Collective is Business for a group of groups.',
  /** The selling line: where taking money starts, and the one kind of money every tier receives. */
  selling:
    'Selling starts at Business. Paid tickets, paid memberships, donations, shop checkout and booking deposits open there. Tips stay open on every tier, with no fee.',
  /** The network fee, stated as the consequence it is: an introduction fee, never the reason to take
   *  a plan, and never a buy-down. */
  rate:
    'The network fee applies only to a customer the network introduced, once, at their first purchase. After that they are your people. Your own audience and your tips are free of it on every plan, and Non Profit pays none at all.',
  /** The meter framing: a full meter stops new writes and takes nothing away. */
  meters:
    'Every business tool is on every Space plan. The free limits are sized for a launch, and a full meter only stops new writes. It never hides, deletes, or locks what is already there.',
  /** Crew in one breath: support plus a host kit, in the canon's words (ADR-1084). */
  crew:
    'Crew is how a member backs the community and hosts a little more. You contribute what you want, and every amount buys the same Crew: more Circles, Events and Journeys, and a monthly Boost for a Circle or Space you love.',
  /** Collective in one breath: groups of groups. */
  collective:
    'Collective is for groups of groups: several member Spaces under one account, each with the Business tools, and Vera AI included.',
  /** The honest yearly framing. It used to carry the Opening Beta line ("beta rates hold through the
   *  Summer of Frequency"), which stopped being true when the owner closed the window on 2026-08-17
   *  (ADR-1060). What replaces it is the deal that survived: the same price whenever you start, and two
   *  months free on the year. */
  founding: 'Every plan is one price, the same whenever you start, and paying for the year is two months free.',
} as const
