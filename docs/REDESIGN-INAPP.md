# In-App Design Overhaul: master spec

> The design-team audit of every interior `(main)` page (8 reviewers: design-systems
> foundation + 7 page clusters), synthesized into one plan. Grounds on
> [`DESIGN.md`](DESIGN.md) (the "warm editorial community" standard),
> [`PAGE-FRAMEWORK.md`](PAGE-FRAMEWORK.md) (the three shells + capability modules),
> [`CREATIVE-PLATFORM.md`](CREATIVE-PLATFORM.md) (audience + voice), and
> [`STUDIO-REVIEW.md`](STUDIO-REVIEW.md) (built-but-dark + WAM). Decision: ADR-061.
>
> **Direction (set with the owner):** all four surfaces in scope · **foundation-first**,
> then core member loop, then dashboards, then admin · **cohesion pass + dynamic
> dashboards** (apply the existing standard rigorously; preserve flows; make dashboards
> live). Lens words: **missed · exhale · home**. "Design for the body, not the dashboard."

---

## Verdict

The design language is right and already written down; it's **half-adopted**, and the gap
*is* the clunkiness. Eight independent audits converged on the **same** cross-cutting defects,
so the fix is not a reinvention, it's finishing and enforcing the kit. Do that once at the
foundation and every page gets cohesive at once; then each page becomes *assembly, not
authoring*.

## The eight cross-cutting defects (found in nearly every cluster)

| # | Defect | Evidence (representative) | Standard it breaks |
|---|---|---|---|
| 1 | **`DetailTemplate` used by 0 pages**: every entity page hand-rolls header/tabs/actions | circle, channel, event, profile, partner, hub, nexus, broadcast/[id], program details | PAGE-FRAMEWORK §3; DESIGN "biggest unification win" |
| 2 | **`IndexTemplate` only 2/10**; browse pages bypass via a `PageHeader` crutch or hand-roll | circles, channels, events, practices, partners, friends, broadcast, search, crew/* | DESIGN browse standard |
| 3 | **No `RoleActions`**: ~60 inline role checks + hardcoded arrays despite a tested resolver | `ContextActions`, `CreateMenu`, every detail header | DESIGN §Role-based actions |
| 4 | **No single entity-card**: 3+ "circle card" shells; bespoke per page | circles/, discover/, feed post-card | DESIGN browse standard §4 |
| 5 | **Tiny type**: 94+ `text-[9/10/11px]` + all-caps micro-headers reading as cold SaaS | rails, admin (16×), operator, event/circle/hub badges | DESIGN "Type is the hero" |
| 6 | **Box overuse**: identical bordered cards on lists/sections, not distinct objects | admin (26×), operator (25×), stat strips, rail widgets | DESIGN "Group, don't box" |
| 7 | **Dead-ends + missing cross-links**: pages don't link to related entities | event↔practice, profile↔circles, hub/nexus↔events/members, crew sub-pages isolated | DESIGN editorial hierarchy / flow |
| 8 | **Static where it should be dynamic** + built-but-dark | crew stats (no deltas/celebration), operator KPIs (no time-axis/drill-down), NearYou, engagement_score, silent achievements | STUDIO-REVIEW #1/#2/#7; "dynamic dashboards" |

Plus no codified **type / spacing / radius** scale, so the drift keeps re-accruing.

---

## The foundation kit (build once: the cohesion backbone)

| Primitive | What | Status |
|---|---|---|
| **Type / spacing / radius scale** | Codify the in-app scale in `DESIGN.md` + a few semantic utilities; retire `text-[10/11px]` | to build |
| **`EntityCard`** | One browse-card shell: anchor (avatar/icon) · title · one-line context · 2-line description · meta footer; `rounded-2xl border bg-surface p-5 shadow-sm` + hover-lift; variants | to build |
| **`RoleActions`** | Header action menu fed by `resolveCapabilities`: primary button + overflow, gate-aware; replaces scattered buttons; `CreateMenu`/`ContextActions` become instances | to build |
| **`StatCard`** | One stat tile with optional **delta / sparkline** (powers "dynamic dashboards") + narrative variant | to build |
| **Section primitives** | `SectionHeader` (exists) + a borderless rail/admin group; kill `SidebarCard`'s box + `text-[11px]` header | standardize |
| **`DetailTemplate` / `IndexTemplate` / `StreamTemplate`** | Confirm/extend APIs (Detail: `actions` slot = RoleActions, tab routing) | exists, extend |

---

## Shipped status (2026-06-02)

The overhaul shipped across **13 PRs (#81 to #93)**, all merged to `main`:

- **Phase 0, Foundation** ✅ (#81): codified type/spacing/radius scale (`DESIGN.md`); `EntityCard` +
  `StatCard` built; `SectionHeader`/`ModuleCard`/`EmptyState` standardized. (`RoleActions` deferred to
  its first detail-page consumer.)
- **Phase 1, Member loop** ✅ (#82 to #89): browse pages (People, Partners, Channels, Friends, Practices)
  on `IndexTemplate` + `EntityCard`; **detail pages Circle, Channel, Event on `DetailTemplate`** (0 → 3
  entity pages); Profile cohesion pass (borderless rail, type, tokens); Settings index completed +
  breadcrumbs; `/groups` removed.
- **Phase 2, Dashboards** 🟡 (#90 to #92): Crew home on the kit with a **live weekly delta** + drill-downs;
  the 6 Crew sub-pages + operator/Studio/Marketing/CRM dashboards swept (type, de-capped headers, tokens).
- **Phase 3, Admin** ✅ (#93 sweep + structural redesign 2026-06-03, ADR-072/073): all 12 admin pages
  swept (type, de-cap, tokens), then the **structural admin** landed: a **grouped catalog**
  (`app/(main)/admin/sections.ts`, five role-gated groups), a shared **`AdminPage`/`AdminSection` shell**
  (`components/admin/admin-page.tsx`) + shared `requireAdmin` guard (`lib/admin/guard.ts`), a launchpad,
  and **two-layer nav** (the five admin categories in the rail's Manage section, the active category's
  pages as sub-tabs).

**Still open** (deeper, deferred): Profile/Programs detail → `DetailTemplate`; build `RoleActions`;
richer dynamism (since-last-visit deltas, achievement celebration, operator KPI time-axis + drill-downs);
heavier browse pages (Circles index w/ map, Search, Broadcast). See the review backlog at the bottom.

---

## Shipped status (2026-06-05): kit COMPLETED + conformance sweep (ADR-090)

A fresh design-team audit (5 reviewers, one per page cluster) swept **every** interior `(main)`
page and confirmed the language was right but **half-adopted**, and that the system itself had
**three gaps** that kept the drift re-accruing. This pass closes them.

### The kit is now complete: five shells, one header, one rail map

| Piece | What landed | Where |
|---|---|---|
| **`FocusTemplate`** | the no-rail compose/edit/settings surface, promoted from "shell hides the rail" to a real template | `components/templates/focus-template.tsx` |
| **`DashboardTemplate`** | the metric-led operator/steward shell (no-rail sibling of `AdminPage`) | `components/templates/dashboard-template.tsx` |
| **`PageHeading`** | one header grammar shared by Stream/Index/Dashboard/Focus | `components/templates/page-heading.tsx` |
| **Declarative chrome** | `railFor(pathname) → global \| scoped \| none`; shell reads it; **one line to reframe a route** | `lib/layout/page-chrome.ts` (+ `.test.ts`) |
| **Barrel + docs** | `@/components/templates` barrel; decision tree in PAGE-FRAMEWORK §8; `AGENTS.md` guardrail | n/a |

Adopting `FocusTemplate` simultaneously fixed the **wrong-rail bug** on nine compose/operator
pages (`events/new`, `practices/*/edit`, `upgrade`, `crm`, `outreach`, `codes`, `connections/*`,
`/g/*`, `/n/*`). One config change, nine pages.

### Conformance map (the 5-cluster audit, pre-sweep)

| Cluster | ✅ Conforming | 🟡 Partial | 🔴 Non-conforming |
|---|---|---|---|
| **Spaces & structure** (15) | circles/[slug], channels, channels/[id], partners, programs, programs/[slug] | circles, journeys, g/[slug], n/[nodeId], pages | hubs/[slug], nexuses/[slug], partners/[slug], journeys/[slug] |
| **Loop & gamification** (~16) | events, practices, + redirects | events/[slug], practices/[id]/edit, crew | events/new, crew {achievements, challenges, leaderboard, store, streaks}, upgrade |
| **Social & comms** (13) | feed, people, friends, messages, messages/[id], messages/r/[roomId] | broadcast, connections, connections/[id], connections/new | broadcast/[id], search, people/[handle] |
| **Operator workspace** (12) | None | all 8 marketing/* + outreach + codes | crm |
| **Settings & admin** (29) | 9 admin pages read + 14 grep-clean | settings ×5 | admin/ai |

### Adopted in this pass (presentational chrome only: no data/auth changes)

- **Focus** → `FocusTemplate`: settings ×5 (fixes the double-padding bug), events/new, practices/[id]/edit,
  upgrade, outreach, connections/new.
- **Dashboard** → `DashboardTemplate` + shared `StatCard`: all 8 marketing/* tabs + crm (retire the local
  `Kpi`/`Stat` tiles, de-box, de-cap).
- **Detail** → `DetailTemplate`: hubs/[slug], nexuses/[slug], partners/[slug], journeys/[slug] (header only),
  broadcast/[id].
- **Index** → `IndexTemplate`: circles (drop the `PageHeader` gam-crutch), pages, connections, search (+ kill
  its shadowed local `EmptyState`), crew {achievements (kill local `StatCard`), challenges, leaderboard, store, streaks}.
- **Admin** straggler → `AdminPage`: admin/ai.

### Tracked next (deeper, not in this chrome pass)

1. **`people/[handle]` → Detail + RoleActions**: lead with the human; stats to the rail; tabs via the template.
2. **Build `RoleActions`** (resolver-fed header action menu): replaces ~60 inline role checks; first consumers: circle/event/profile detail headers.
3. **Broadcast index** → `StreamTemplate` + a real dispatch filter (kill the decorative count-tiles); move its in-body right column to rail widgets.
4. **Circles index** → migrate `CircleCard` onto `EntityCard`; **Search** → unify result cards (`PersonCard`/`EntityCard`).
5. **`events/[slug]` scoped rail** (attendees/location/host): add `/events/` to the scoped set once the rail widgets exist.
6. **Streaming perf** (PAGE-FRAMEWORK §5): defer blocking await chains behind per-section `<Suspense>`. Worst: `marketing/analytics` (4 awaits), `crm` (`listUsers(1000)`), `crew`/`crew/leaderboard`, `events`, `admin/circles`.

---

## Shipped status (2026-06-14): journey interior containers on the kit

The journey reader surfaces stopped hand-rolling `mx-auto max-w-Nxl px-/py-` wrappers that fought
the shell. (`<main>` already supplies `py-6` and the global rail narrows the column, so a
page-level `max-w + mx-auto` double-padded and floated the content away from the rail.) This is the
follow-on to the `journeys/[slug]` header-only `DetailTemplate` adoption (2026-06-05) and pairs with
the ADR-252 rail restore.

- **Player** (`journeys/[slug]/learn`) → `DetailTemplate`: accent face + back-to-Journeys + author
  Edit action in the header; cohort meter + player as the body. The player's progress card no longer
  repeats the title (the header owns it now); lesson titles are `h2` under the page `h1`.
- **Discovery** (`journeys/[slug]`) → dropped the `max-w-2xl` wrapper so `DetailTemplate` fills
  beside the rail like every other detail page.
- **Editor** (`journeys/[slug]/edit`) → removed the double padding; kept the constrained authoring
  width (a sanctioned editor, not migrated to a generic template).

Rail unchanged: journey routes keep the standard global community rail (ADR-252), always present.

---

## Phased plan (reviewable PRs)

**Phase 0, Foundation kit** *(this is the backbone; ship first)*
- Codify type/spacing/radius scale in `DESIGN.md` (+ minimal semantic utilities).
- Build `EntityCard`, `RoleActions`, `StatCard`; standardize the borderless section/rail group.
- Confirm/extend `DetailTemplate` (actions + tabs) and `IndexTemplate`.

**Phase 1, Adopt the shells (core member loop first)**
- Browse → `IndexTemplate` + `EntityCard`: circles, channels, events, practices, partners, friends, broadcast, search, people (done).
- Detail → `DetailTemplate` + `RoleActions`: **circle**, profile, event, channel, program, partner, broadcast/[id].
- Type/de-box sweep on these pages as they're touched.

**Phase 2, Dynamic dashboards**
- **Crew:** live deltas + "since last visit", achievement-unlock celebration, "next-best-action", cross-links, IndexTemplate. (The Vault keeps its name; see Decisions.)
- **Operator (Studio/Marketing/CRM):** KPI time-axis (deltas/sparklines), bento/anchor hierarchy, drill-downs (campaign→performance, contact→engagement_score), descriptions.

**Phase 3, Admin** ✅ *(shipped 2026-06-03, ADR-072/073)*
- Shared admin page layout (`AdminPage`/`AdminSection`) + grouped catalog (`sections.ts`) + two-layer
  nav (categories in the rail, the active category's pages as sub-tabs); de-box; lift type;
  cross-links/drill-downs; inline help.

**Cross-cutting (woven through):** route all role logic through the resolver; add entity **descriptions** + relevant **cross-links** everywhere; beautiful empty states; surface built-but-dark (NearYou proximity sort, engagement_score, achievement celebration).

---

## Per-cluster top moves (condensed)

- **Streams/Comms:** Broadcast + Search → templates; kill Broadcast's decorative count-tiles → real filter; lift "new members" to a shared widget on the feed; feed empty-state → discovery; unify search result cards.
- **Spaces:** `DetailTemplate` for circle/channel/hub/nexus; de-box circle-detail rail; type fix; **remove `/groups` (dead redirect)**; decide Hubs/Nexuses **social vs structural**; add hub/nexus↔events/members.
- **Loop/Calendar:** events → Index, event detail → Detail; **fix streak weekly-model ↔ daily-UI + add practice reminder** (WAM leak); one-tap RSVP + host avatar/capacity on cards; surface achievement unlocks; circle "practice of the week"; event↔practice link.
- **Identity:** **Profile → Detail + RoleActions**, lead with the human (bio/"seen·missed") not a metrics wall, tabs (About/Timeline/Activity/Circles), stats → rail; complete the **Settings index** (Billing/Notifications) + breadcrumbs; mount NearYou.
- **Crew:** IndexTemplate + right rail; **live deltas + celebration + next-best-action + cross-links**; collapse 3 streak cards; "nearly earned". (The Vault keeps its name.)
- **Operator:** type hierarchy (kill all-caps + `text-[11px]`); **KPI time-axis + deltas**; bento hierarchy; **drill-downs** (campaign perf, engagement_score); descriptions.
- **Admin:** ✅ unified admin page layout (`AdminPage` shell); **replace 16× `text-[11px]` headers**; de-box (26× cards); **cross-links/drill-downs**; grouped catalog + two-layer nav (ADR-072/073); inline help.

## Decisions (locked with the owner)
- **Hubs / Nexuses → stay structural.** Clean them up only: `DetailTemplate`, breadcrumb, a
  one-line description, links down to circles. The social energy stays in Circles; no hub/nexus
  discussion/events/members tabs.
- **`/groups` → remove.** Delete the dead redirect routes (`/groups`, `/groups/[slug]`) and any
  nav references.
- **The Vault → keep the name.** No rename; keep "The Vault" as the gem-spend surface.
- **Streaks → make the ENGINE daily.** Switch the backend streak model from weekly to daily to
  match the daily grid UI (not the other way round). ⚠️ Backend behaviour change, touches
  `lib/achievements.ts` (`isSameWeek` guard), `STREAK_CONFIG`/`window_days`, and existing streak
  semantics; sequence carefully in Phase 2 alongside the practice-reminder cron, and migrate/reset
  existing streak counters intentionally rather than silently.

---

## Guardrails
- Compose from the kit; never hand-roll a header or re-declare a card. (Add to `AGENTS.md` once the kit lands.)
- No `text-[10/11px]` for content. Semantic colors only (no hardcoded hex). Honor `prefers-reduced-motion`.
- Server Components by default; client only at interactive leaves; per-widget Suspense (PAGE-FRAMEWORK §5).
- Each phase ships as its own reviewable PR; no big-bang.

---

## Post-overhaul review (2026-06-02)

A 4-agent review team (correctness/regression · code-health/perf · streamlining/dedup · docs) swept
the merged overhaul. Verdict: **no P0 bugs, no data loss, no auth/RLS leaks, no regressions**. The
`DetailTemplate` adoptions preserved all data fetching + capability gating, and the `sed` sweeps left
no corruption.

**Fixed in this review pass:**
- 🔴→✅ `bg-teal-50` (a raw Tailwind color that escaped the sweep) on the Crew "Gem Store" quick-link → `bg-signal-bg`.
- ♻️ **Extracted the 9 byte-identical admin `SidebarCard`s** into `components/ui/sidebar-card.tsx`.

**Streamlining backlog (found, not yet done, prioritized):**
1. **StatCard variants**: 3 local stat-card copies (`admin/`, `admin/gamification/`, `crew/achievements/`) vs the shared `components/ui/stat-card.tsx`. Extend the shared one (`sub`, `colorBg`) and adopt.
2. **Role-set dedup**: inline `HOST_PLUS`/`CREW_PLUS`/`ADMIN_ROLES` arrays in ~11 spots (broadcast, messages, circles, events, admin/*). Export from `lib/core/roles.ts`; route capability gates through `resolveCapabilities`.
3. **`GamStat`** redefined in ~3 places → export one.
4. **PageHeader vs IndexTemplate**: `PageHeader` (4 pages) overlaps `IndexTemplate`; fold gam-stats out and default browse pages to `IndexTemplate`.
5. **Admin index headers**: 10+ admin pages hand-roll the same header → an `AdminIndexTemplate` (or `IndexTemplate`).
6. **EntityCard adoption**: circles/events/people still use bespoke cards; audit vs `EntityCard`.
7. **Oversized files**: `admin/page.tsx` (681L), `messages/page.tsx` (612L) → extract sub-components.
8. **Date-format + Badge/Pill/avatar-initials** helpers → consolidate.

**Performance backlog (found, not from the overhaul, pre-existing):**
- P1 `marketing/campaigns/actions.ts`: per-recipient sequential `shouldSend`+`enqueue` loop (N+1 at scale) → batch with `Promise.all`.
- P1 `admin/circles/page.tsx`: sequential role→hub→circle query chain blocks streaming → parallelize / Suspense.
- P2: defer non-critical awaits behind Suspense: `events/page.tsx` gam stats, `crew/page.tsx` leaderboard chain, `admin/circles` hubs fetch.
- Gold-standard streaming pattern to mirror: `app/(main)/layout.tsx`.
