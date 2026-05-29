# Scale & Future-Proofing Architecture (research report)

> A cited, adversarially-checked research report answering: *what is the most
> flexible, lock-in-resistant architecture for dynamically composing per-user
> pages (by role + involvement), at millions of users, fast — and extensible to
> new surfaces (store, job board, more gamification) without re-architecting?*
>
> Method: 5 parallel research angles → source fetch → cross-source verification
> (claims tagged confidence high/medium/low) → synthesis. Pairs with
> [IA-STRATEGY.md](IA-STRATEGY.md) (features) and [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md)
> (layout). **Strategy/decision doc — not an implementation order.**
>
> Sourcing caveat: several primary pages (Next.js, Vercel, Airbnb, Shopify,
> Martin Fowler) returned HTTP 403 to the fetcher; those claims rest on
> search-index extracts of the same primary pages. Next.js 16 caching API exact
> signatures must be confirmed against installed docs before coding (deps weren't
> installed in the research container).

---

## TL;DR — the recommendation

**Don't adopt a new mega-framework. Adopt *seams*.** The thing that makes a stack
"un-fixable when it dates" is not the framework — it's coupling business logic,
data, composition, and design to that framework so they can't move independently.
Keep Next.js (it's a good bet), but split the system into **five layers that each
change at their own pace**, separated by stable contracts:

```
┌───────────────────────────────────────────────────────────────┐
│ PRESENTATION   Next.js App Router + RSC · design tokens · headless UI │  ← replaceable
├───────────────────────────────────────────────────────────────┤
│ COMPOSITION    server-composed capability MODULES, selected per     │  ← the "dynamic page" engine
│                user by role + involvement (not a static widget board)│
├───────────────────────────────────────────────────────────────┤
│ CONTRACT/BFF   one typed, view-model contract (the anti-lock-in seam)│  ← the decision that matters most
├───────────────────────────────────────────────────────────────┤
│ DOMAIN/CORE    business rules behind ports (hexagonal) — no framework│  ← the source of truth for logic
├───────────────────────────────────────────────────────────────┤
│ DATA           Postgres/Supabase as source of truth; evolve by seams │  ← doesn't dead-end early
└───────────────────────────────────────────────────────────────┘
```

**Single most important decision:** the **CONTRACT seam** between
domain/data and presentation. Get a typed, framework-agnostic view-model contract
right and the renderer becomes a *replaceable adapter* — Next.js, a future
framework, or a native app all consume the same contract. Everything else
(per-user composition, new surfaces, a sync engine, a rendering swap) becomes a
*local* change instead of a rewrite.

---

## Reframing "widget" → server-composed capability modules

You're right that "widget" smuggles in a static-dashboard mental model. The
correct model for *dynamic, per-user* pages is **server-driven composition**:

- A page is a **template** (the durable, memorable shell) with **slots**.
- The **server decides which modules fill each slot for *this* user**, by
  evaluating **role + involvement** rules (the gating model in IA-STRATEGY §2) —
  e.g. a brand-new member's circle slot shows "find your first circle," an active
  host's shows "your circle's at-risk members."
- Modules are **React Server Components that fetch their own data and render on
  the server** — so "which modules, in which order, with which data" is computed
  per request, server-side. That *is* per-user dynamic page generation.

Why this, not a JSON-schema SDUI runtime (Airbnb Ghost / Lyft): **RSC already is
"server-driven UI for the web."** The server chooses the component tree per user
and streams it; auth/role checks stay server-side with nothing leaked to the
client bundle ([RSC for enterprise/role-gating](https://medium.com/@vasanthancomrads/react-server-components-for-enterprise-applications-bc445e1cd572),
high; [React 19 + SDUI](https://ameersami.com/posts/React%2019%20and%20Server%20Driven%20UIs%20a%20Perfect%20Match/),
medium). A custom JSON-UI protocol for a web-first app risks "building a worse
framework / reinventing HTML" ([the SDUI dilemma](https://pankaj-rai.medium.com/the-server-driven-ui-dilemma-a-pragmatic-guide-for-the-modern-mobile-developer-b45b80d0bff3),
high; [MNF discussion](https://github.com/MobileNativeFoundation/discussions/discussions/47), medium),
and SDUI's headline payoff — shipping UI without an app-store release — **doesn't
exist on the web** ([what Airbnb/Netflix/Lyft learned](https://medium.com/@aubreyhaskett/server-driven-ui-what-airbnb-netflix-and-lyft-learned-building-dynamic-mobile-experiences-20e346265305),
high).

> **The seam that future-proofs this:** make the per-user "which modules" decision
> return a **typed composition descriptor** (a list of module ids + props for this
> user/scope), resolved server-side. Today RSC renders it directly. If you ship
> **native apps later**, that same descriptor is promotable to a real
> cross-platform SDUI contract — *without a rewrite*. (Airbnb/Lyft built exactly
> this kind of contract; [Airbnb Ghost](https://medium.com/airbnb-engineering/a-deep-dive-into-airbnbs-server-driven-ui-system-842244c5f5),
> [Lyft BFF+protobuf](https://eng.lyft.com/the-journey-to-server-driven-ui-at-lyft-bikes-and-scooters-c19264a0378e), high.)

---

## 1. Personalized-but-fast rendering (RSC + PPR)

- **Partial Prerendering** serves a static shell instantly and streams per-user
  "holes" (Suspense boundaries) in the *same* HTTP response — measured TTFB
  ~350–550ms → ~40–90ms when the shell ships from CDN and data streams after.
  ([Next PPR docs](https://nextjs.org/docs/15/app/getting-started/partial-prerendering) high;
  [SitePoint benchmark](https://www.sitepoint.com/react-server-components-streaming-performance-2026/) medium.)
- **Next.js 16 unifies this under `cacheComponents`**; the old experimental PPR
  flags are removed. Caching is now **explicit/opt-in** via `use cache` +
  `cacheLife`/`cacheTag` (implicit fetch caching is gone).
  ([Next 16 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16),
  [cacheComponents](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents),
  [use cache](https://nextjs.org/docs/app/api-reference/directives/use-cache) — high;
  exact `revalidateTag`/`cacheLife` signatures **medium, verify against installed docs**.)
- **Reconciled tension — PPR's limit for *us*:** PPR's static-shell win shrinks
  when pages are fully authenticated/per-user (little universal static content),
  and **edge gives little when compute is far from the DB** — round-trips to
  regional Postgres negate edge latency.
  ([wolf-tech PPR tradeoffs](https://wolf-tech.io/blog/nextjs-15-partial-prerendering-real-world-patterns-and-tradeoffs) high;
  [edge vs serverful](https://medium.com/@vyakymenko/edge-rendering-vs-static-vs-serverful-trade-offs-8f720d69dc7b) high.)
- **Therefore:** **PPR for the public/SEO `/discover` layer** (genuinely static
  shell); **streaming SSR + per-fragment `use cache`/`cacheLife`, run regionally
  near Postgres** for the authenticated app; **edge only for light routing.** Per
  module: block above-the-fold, stream the rest, SWR-cache the slow + non-personal
  (leaderboards, topic metadata), keep truly per-user modules dynamic.
  ([Next streaming](https://nextjs.org/docs/app/guides/streaming),
  [perf guide](https://www.digitalapplied.com/blog/nextjs-16-performance-server-components-guide) — high.)

## 2. Data architecture at millions (Postgres/Supabase doesn't dead-end)

- **Postgres scales along proven seams, in order:** connection pooling →
  read replicas → denormalized read models → partitioning → (last) shard.
  Supavisor held **~500k client connections** on ~400 backend connections
  ([Supavisor 1M](https://supabase.com/blog/supavisor-1-million) high). Read
  replicas help once reads are ≥~80%
  ([replicas vs compute](https://supabase.com/blog/read-replicas-vs-bigger-compute) high).
  Notion ran one Postgres to **~30M users** before sharding
  ([scaling PG](https://www.velodb.io/glossary/ways-to-scale-postgresql) medium).
- **Feeds: hybrid fan-out.** Push (precompute per-follower timeline) for normal
  users; pull (merge at read) for high-fan-out "celebrity" accounts — the pattern
  Twitter/Instagram/Mastodon converge on
  ([fan-out](https://www.rutvikbhatt.com/data-distribution-patterns-fanout-on-read-vs-fanout-on-write/) high;
  [celebrity problem](https://www.techinterview.org/post/3233474168/system-design-twitter-news-feed-timeline-fanout-on-write-fanout-on-read-celebrity-problem-ranking-caching/) medium).
  A maintained denormalized timeline table **is** the practical CQRS read model
  ([CQRS](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) high) —
  note Postgres native `MATERIALIZED VIEW` needs full REFRESH and is wrong for
  per-user feeds.
- **Realtime: prefer Broadcast over Postgres-Changes.** Supabase Realtime
  benchmarked **250k concurrent users, ~58ms**, >800k broadcast msgs/sec; but
  Postgres-Changes is single-threaded (~10k msgs/sec) — use **Broadcast**, shard
  users across **many narrow channels**, not one mega-channel.
  ([Realtime benchmarks](https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/content/guides/realtime/benchmarks.mdx),
  [architecture](https://supabase.com/docs/guides/realtime/architecture) — high.)
- **Add a layer only when measured:** Redis for hot timelines/counters
  (Mastodon's model, [discussion](https://github.com/mastodon/mastodon/discussions/22737) high);
  Meilisearch/Typesense→Elasticsearch when Postgres FTS breaks
  ([search stacks](https://medium.com/@simbatmotsi/postgres-full-text-search-vs-meilisearch-vs-elasticsearch-choosing-a-search-stack-that-scales-fcf17ef40a1b) high);
  pgvector covers millions–tens-of-millions of embeddings before a dedicated
  vector DB ([pgvector](https://www.ingestiq.ai/resources/comparisons/pgvector-vs-redis-vector) medium).

## 3. Anti-lock-in (the core of "future-proof")

- **Domain behind ports (hexagonal):** business logic "immune to infrastructure
  churn," renderer becomes an adapter — but **don't over-apply** it to CRUD with
  little logic ([hexagonal](https://www.javacodegeeks.com/2025/12/hexagonal-architecture-ports-and-adapters-achieving-true-domain-independence.html) high;
  [AWS](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/hexagonal-architecture.html) high).
- **BFF / typed contract** decouples UI evolution from backend churn
  ([BFF](https://nordicapis.com/decoupling-the-presentation-layer-from-the-backend-using-bff/) high).
- **Modular monolith with vertical slices, NOT microservices/micro-frontends
  yet.** Shopify's "majestic monolith" served Black Friday at 284M req/min
  ([Shopify](https://newsletter.techworld-with-milan.com/p/inside-shopifys-modular-monolith) high);
  Amazon Prime Video moved microservices→monolith for ~90% cost cut
  ([New Stack](https://thenewstack.io/return-of-the-monolith-amazon-dumps-microservices-for-video-monitoring/) high);
  micro-frontend boundaries are "expensive to change" and premature for a startup
  ([Fowler](https://martinfowler.com/articles/micro-frontends.html) high).
- **Design system as data:** W3C **Design Tokens** reached first stable spec
  (2025-10) — colors/spacing survive a framework swap
  ([W3C tokens](https://www.w3.org/community/design-tokens/2025/10/28/design-tokens-specification-reaches-first-stable-version/) high).
  **shadcn** is copied into your repo ("no shadcn package… no breaking changes
  from library updates") — you own the components
  ([shadcn dist model](https://blog.vibecoder.me/shadcn-ui-component-library-ai-development) high).
  *You already do this* (Tailwind v4 tokens / the DAWN system in `globals.css`).
- **New surfaces via a narrow registry + manifest** (the VS Code model: declare
  capabilities, lazy-load, narrow versioned host API). This is how a store / job
  board / new gamification layer plugs into the host without touching the core
  ([VS Code contributions](https://code.visualstudio.com/api/references/contribution-points),
  [activation/lazy load](https://code.visualstudio.com/api/get-started/extension-anatomy) — high).

## 4. Future trends — what to bet on vs. avoid (3–5 yr)

- **BET: Postgres-backed local-first / sync engines** (Zero, ElectricSQL for
  web-first instant UI; PowerSync if native later). A sync engine + local store
  gives instant, reactive, offline-capable per-user UI — the strongest match for
  your "personal dashboard feel" — *with Postgres as source of truth, which
  de-risks it*. Category is young → **adopt the posture now, commit per-surface
  later.** ([choosing a sync engine](https://johnny.sh/blog/choosing-a-sync-engine-in-2026/) high;
  [Electric](https://electric-sql.com/docs/reference/alternatives) high;
  [engine comparison](https://trybuildpilot.com/648-electric-sql-vs-powersync-vs-zero-2026) high.)
- **BET: durable web-platform primitives** — View Transitions (Baseline 2025-10),
  container queries — framework-portable, outlive any framework
  ([View Transitions Baseline](https://web.dev/blog/same-document-view-transitions-are-now-baseline-newly-available),
  [Interop 2026](https://web.dev/blog/interop-2026) — high).
- **HEDGE: RSC as a *whole-architecture* commitment.** Real but polarized (~23%
  production use); ecosystem fragmenting (TanStack, React Router adopting RSC) —
  which actually *de-risks* you: bet on **React + a data layer**, keep RSC behind
  seams ([State of React](https://www.theregister.com/2026/02/17/react_survey_shows_tanstack_gains/),
  [community 2025](https://blog.isquaredsoftware.com/2025/06/react-community-2025/),
  [RSC problems](https://thenewstack.io/the-problems-with-react-server-components/) — high).
- **AVOID (for now): edge-everywhere** (keep compute regional near the DB; real
  cost-driven self-host counter-trend) and **fully generative/AI-assembled
  production UI** (accessibility/consistency/compliance risk; the defensible use
  is **per-user content selection/ranking within a designed system** — which is
  exactly the composition model above)
  ([edge tradeoffs](https://medium.com/@vyakymenko/edge-rendering-vs-static-vs-serverful-trade-offs-8f720d69dc7b) high;
  [generative UI limits](https://think.design/blog/generative-ui-future-of-ux/) medium;
  [AI dark patterns](https://medium.com/a-microbiome-scientist-at-large/ai-dark-patterns-7319aa522bdf) high).

---

## What to decouple NOW (cheap insurance, no rewrite)

1. **Domain logic out of route handlers / server actions** → a `core/` service
   layer with ports. Supabase access behind repository functions (you already
   centralize clients in `lib/supabase/*` — extend to repositories).
2. **A typed view-model contract** (`contract/` — even just typed service
   functions returning per-scope view models today). This is the seam that makes
   the renderer replaceable and is promotable to SDUI if native ships.
3. **The composition descriptor** — formalize "which modules for this user/scope"
   as data (role + involvement rules), resolved server-side. Rename "widget" →
   **module/capability**.
4. **Design tokens + headless primitives** — already in place; keep raw values
   out of components (the DAWN rule in `docs/ARCHITECTURE.md`).
5. **A narrow module registry** for future surfaces — minimal now, but the seam
   exists so store/jobs/gamification plug in rather than fork the app.

## Is there a genuinely better model than current best practice?

Modestly, yes — and it's a *combination*, not a new framework: **server-driven
composition (which modules, per user) layered over a Postgres-backed sync engine
(reactive per-user reads)**. That pairing gets you both the *instant personal
dashboard feel* (local-first reactivity) and *dynamic per-user pages* (server
composition) — ahead of vanilla request/response Next.js. It's not mature enough
to bet the whole platform on today, so the right move is to **build the seams
that let you slide into it surface-by-surface** (start with messaging or the
feed) while Postgres stays the source of truth, keeping every step reversible.

## Low-risk evolution path (no big-bang)

1. **Seams first (now):** `core/` ports, `contract/` view models, repositories,
   formalized composition descriptor, module registry. Pure refactor — same Next,
   same Supabase, same UX.
2. **Rendering (near):** streaming SSR + per-module `use cache`/`cacheLife`
   regionally; PPR on `/discover`; View Transitions for navigation polish.
3. **Data (as measured):** Supavisor (have it) → read replicas → denormalized
   feed read-model + hybrid fan-out → time-partition append-only tables → Redis /
   search only on real signals. Broadcast (not Postgres-Changes) for realtime.
4. **Sync engine spike (when instant-UI demand is acute):** pilot Zero/Electric
   on ONE surface (messaging or feed); Postgres stays truth → reversible.
5. **New surfaces (as they come):** store / jobs / gamification as **modules**
   behind the registry; stay a modular monolith; defer microservices/micro-FE
   until a boundary is *proven*, not guessed.

---

## Verification notes & things to validate yourself

- **Heuristics, not vendor limits (validate with load tests):** the "~10k
  follower" celebrity cutoff; "millions–tens-of-millions" pgvector ceiling;
  "~80% reads" replica threshold; third-party PPR TTFB benchmark.
- **Next.js 16 specifics to confirm in installed docs before coding:**
  `cacheComponents` stability, default `cacheLife` profile values, exact
  `revalidateTag` signature. (Primary Next/Vercel pages 403'd the fetcher.)
- **Sync-engine category is young** — treat any specific engine choice as a
  per-surface, reversible bet, not a foundation.
