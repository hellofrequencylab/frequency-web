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

/** The one narrative spine every pricing/marketing surface can reuse verbatim: free entry, hosting,
 *  paid tools and capacity, and separate fees, stated so a skeptic believes it. No em dashes.
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
  /** The concrete account, hosting and fee distinctions in one breath. */
  spine:
    'Frequency is where your local community happens. People join free. Host a Circle or free Event. Paid plans add tools and capacity. Introduction fees and card processing are separate.',
  /** The three lines on their own (CORE-MODEL §1), for a surface that already has its own first
   *  sentence: the site description, the llms.txt header. PROG-R8 (ADR-1499) added this so the
   *  <meta> description and the crawler corpus READ the lines rather than retype them; the spine
   *  above keeps them too, because the home document's hero is the spine verbatim. */
  lines: 'People join free. Host a Circle or free Event. Paid plans add tools and capacity.',
  /** The ladder in one line: six tiers, one verb each (ADR-1709; Network added by the 2026-10-16 split). */
  ladder:
    'Six tiers, one verb each. Members join. Crew hosts. A Space runs. Business sells. Collective connects. Network unites.',
  /** A plan adds tools and capacity; selling eligibility is a separate stated capability.
   *  Keep subscription fees distinct from processing and any introduction fee. */
  paid:
    'A free Space includes tools for hosting within its published allowances. Crew supports the community and adds hosting allowances. Selling through a Space starts at Business. Paid plans have subscription fees, separate from card processing and any network introduction fee. Collective is for separate groups that partner, and Network is for one organization with chapters.',
  /** The selling line: where taking money starts, and the one kind of money every tier receives. */
  selling:
    'Selling starts at Business. Paid tickets, paid memberships, donations, shop checkout and booking deposits open there. Tips stay open on every tier, with no platform fee, only card processing.',
  /** The network fee, stated as the consequence it is: an introduction fee, never the reason to take
   *  a plan, and never a buy-down. */
  rate:
    'The network fee applies only to a customer the network introduced, once, at their first purchase. After that they are your people. Your own audience and your tips are free of it on every plan (card processing still applies), and Non Profit pays none at all.',
  /** The meter framing: a full meter stops new writes and takes nothing away. */
  meters:
    'Check the published plan details for included tools, selling features and allowances. A full usage meter stops new writes; existing content remains subject to the feature’s access settings.',
  /** The Space and Crew upsell in one line, for any surface that opens a Space: the page, the doors, the
   *  emails. The requirement is ADR-810's creation gate, which bites when the beta ends. */
  crewSpace:
    'A Space comes with Crew, which you fund at whatever amount you choose. Until the beta ends, anyone can open one free.',
  /** Crew in one breath: support plus a host kit, in the canon's words (ADR-1084). */
  crew:
    'Crew is how a member backs the community and hosts more, and a Space comes with it. You contribute what you want, and every amount buys the same Crew: more Circles, Events and Journeys, and a monthly Boost for a Circle or Space you love.',
  /** Collective in one breath: separate groups that partner (the 2026-10-16 split; Network is the
   *  one-owner-with-chapters plan). */
  collective:
    'Collective is for separate groups that partner: a hub that links partner Spaces, cross-listed Circles and Journeys, a shared calendar, and Vera AI included. Each partner keeps its own members and payouts.',
  /** Network in one breath: one organization, many chapters. */
  network:
    'Network is for one organization with chapters: one membership that works in every chapter, central admins who see the whole network, chapter leaders who run their own, one network calendar and home, and a roll-up report.',
  /** The honest price framing. It used to carry the Opening Beta line ("beta rates hold through the
   *  Summer of Frequency"), which stopped being true when the owner closed the window on 2026-08-17
   *  (ADR-1060), and then said "every plan is one price", which stopped being true when Collective got a
   *  standing Founding intro (ADR-1709 §7, owner 2026-10-19). What is true: a price you take is yours for
   *  as long as you keep the plan, and the year is two months free. */
  founding:
    'The price you start on is yours for as long as you keep the plan, and paying for the year is two months free.',
  /** CARD PROCESSING (LIVE-913, docs/VALUE-LADDER.md §2). Stripe's processing fee is always passed
   *  through, so no surface says "0%" or "no fee" without these words beside it, and none says "you keep
   *  100%" without saying of what. Two fragments, not sentences, because the caveat belongs INSIDE the
   *  claim it qualifies: `plusProcessing` follows a rate ("0% on your own people, plus card
   *  processing"), `afterProcessing` follows a kept share ("you keep 100% of it, after card processing").
   *  `node scripts/probes/launch-0-4-fees.mjs` fails any claim in scope that drops them. */
  plusProcessing: 'plus card processing',
  afterProcessing: 'after card processing',
} as const
