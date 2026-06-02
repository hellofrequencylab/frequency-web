# In-App Design Overhaul — master spec

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
*is* the clunkiness. Eight independent audits converged on the **same** cross-cutting defects
— so the fix is not a reinvention, it's finishing and enforcing the kit. Do that once at the
foundation and every page gets cohesive at once; then each page becomes *assembly, not
authoring*.

## The eight cross-cutting defects (found in nearly every cluster)

| # | Defect | Evidence (representative) | Standard it breaks |
|---|---|---|---|
| 1 | **`DetailTemplate` used by 0 pages** — every entity page hand-rolls header/tabs/actions | circle, channel, event, profile, partner, hub, nexus, broadcast/[id], program details | PAGE-FRAMEWORK §3; DESIGN "biggest unification win" |
| 2 | **`IndexTemplate` only 2/10**; browse pages bypass via a `PageHeader` crutch or hand-roll | circles, channels, events, practices, partners, friends, broadcast, search, crew/* | DESIGN browse standard |
| 3 | **No `RoleActions`** — ~60 inline role checks + hardcoded arrays despite a tested resolver | `ContextActions`, `CreateMenu`, every detail header | DESIGN §Role-based actions |
| 4 | **No single entity-card** — 3+ "circle card" shells; bespoke per page | circles/, discover/, feed post-card | DESIGN browse standard §4 |
| 5 | **Tiny type** — 94+ `text-[9/10/11px]` + all-caps micro-headers reading as cold SaaS | rails, admin (16×), operator, event/circle/hub badges | DESIGN "Type is the hero" |
| 6 | **Box overuse** — identical bordered cards on lists/sections, not distinct objects | admin (26×), operator (25×), stat strips, rail widgets | DESIGN "Group, don't box" |
| 7 | **Dead-ends + missing cross-links** — pages don't link to related entities | event↔practice, profile↔circles, hub/nexus↔events/members, crew sub-pages isolated | DESIGN editorial hierarchy / flow |
| 8 | **Static where it should be dynamic** + built-but-dark | crew stats (no deltas/celebration), operator KPIs (no time-axis/drill-down), NearYou, engagement_score, silent achievements | STUDIO-REVIEW #1/#2/#7; "dynamic dashboards" |

Plus no codified **type / spacing / radius** scale, so the drift keeps re-accruing.

---

## The foundation kit (build once — the cohesion backbone)

| Primitive | What | Status |
|---|---|---|
| **Type / spacing / radius scale** | Codify the in-app scale in `DESIGN.md` + a few semantic utilities; retire `text-[10/11px]` | to build |
| **`EntityCard`** | One browse-card shell: anchor (avatar/icon) · title · one-line context · 2-line description · meta footer; `rounded-2xl border bg-surface p-5 shadow-sm` + hover-lift; variants | to build |
| **`RoleActions`** | Header action menu fed by `resolveCapabilities` — primary button + overflow, gate-aware; replaces scattered buttons; `CreateMenu`/`ContextActions` become instances | to build |
| **`StatCard`** | One stat tile with optional **delta / sparkline** (powers "dynamic dashboards") + narrative variant | to build |
| **Section primitives** | `SectionHeader` (exists) + a borderless rail/admin group; kill `SidebarCard`'s box + `text-[11px]` header | standardize |
| **`DetailTemplate` / `IndexTemplate` / `StreamTemplate`** | Confirm/extend APIs (Detail: `actions` slot = RoleActions, tab routing) | exists, extend |

---

## Phased plan (reviewable PRs)

**Phase 0 — Foundation kit** *(this is the backbone; ship first)*
- Codify type/spacing/radius scale in `DESIGN.md` (+ minimal semantic utilities).
- Build `EntityCard`, `RoleActions`, `StatCard`; standardize the borderless section/rail group.
- Confirm/extend `DetailTemplate` (actions + tabs) and `IndexTemplate`.

**Phase 1 — Adopt the shells (core member loop first)**
- Browse → `IndexTemplate` + `EntityCard`: circles, channels, events, practices, partners, friends, broadcast, search, people (done).
- Detail → `DetailTemplate` + `RoleActions`: **circle**, profile, event, channel, program, partner, broadcast/[id].
- Type/de-box sweep on these pages as they're touched.

**Phase 2 — Dynamic dashboards**
- **Crew:** live deltas + "since last visit", achievement-unlock celebration, "next-best-action", cross-links, IndexTemplate; rename The Vault → Gem Store.
- **Operator (Studio/Marketing/CRM):** KPI time-axis (deltas/sparklines), bento/anchor hierarchy, drill-downs (campaign→performance, contact→engagement_score), descriptions.

**Phase 3 — Admin**
- Shared admin page layout + grouped sub-nav; de-box; lift type; cross-links/drill-downs; inline help.

**Cross-cutting (woven through):** route all role logic through the resolver; add entity **descriptions** + relevant **cross-links** everywhere; beautiful empty states; surface built-but-dark (NearYou proximity sort, engagement_score, achievement celebration).

---

## Per-cluster top moves (condensed)

- **Streams/Comms:** Broadcast + Search → templates; kill Broadcast's decorative count-tiles → real filter; lift "new members" to a shared widget on the feed; feed empty-state → discovery; unify search result cards.
- **Spaces:** `DetailTemplate` for circle/channel/hub/nexus; de-box circle-detail rail; type fix; **remove `/groups` (dead redirect)**; decide Hubs/Nexuses **social vs structural**; add hub/nexus↔events/members.
- **Loop/Calendar:** events → Index, event detail → Detail; **fix streak weekly-model ↔ daily-UI + add practice reminder** (WAM leak); one-tap RSVP + host avatar/capacity on cards; surface achievement unlocks; circle "practice of the week"; event↔practice link.
- **Identity:** **Profile → Detail + RoleActions**, lead with the human (bio/"seen·missed") not a metrics wall, tabs (About/Timeline/Activity/Circles), stats → rail; complete the **Settings index** (Billing/Notifications) + breadcrumbs; mount NearYou.
- **Crew:** IndexTemplate + right rail; **live deltas + celebration + next-best-action + cross-links**; collapse 3 streak cards; "nearly earned"; rename The Vault.
- **Operator:** type hierarchy (kill all-caps + `text-[11px]`); **KPI time-axis + deltas**; bento hierarchy; **drill-downs** (campaign perf, engagement_score); descriptions.
- **Admin:** unified admin page layout; **replace 16× `text-[11px]` headers**; de-box (26× cards); **cross-links/drill-downs**; grouped sub-nav; inline help.

## Decisions (locked with the owner)
- **Hubs / Nexuses → stay structural.** Clean them up only — `DetailTemplate`, breadcrumb, a
  one-line description, links down to circles. The social energy stays in Circles; no hub/nexus
  discussion/events/members tabs.
- **`/groups` → remove.** Delete the dead redirect routes (`/groups`, `/groups/[slug]`) and any
  nav references.
- **The Vault → keep the name.** No rename; keep "The Vault" as the gem-spend surface.
- **Streaks → make the ENGINE daily.** Switch the backend streak model from weekly to daily to
  match the daily grid UI (not the other way round). ⚠️ Backend behaviour change — touches
  `lib/achievements.ts` (`isSameWeek` guard), `STREAK_CONFIG`/`window_days`, and existing streak
  semantics; sequence carefully in Phase 2 alongside the practice-reminder cron, and migrate/reset
  existing streak counters intentionally rather than silently.

---

## Guardrails
- Compose from the kit; never hand-roll a header or re-declare a card. (Add to `AGENTS.md` once the kit lands.)
- No `text-[10/11px]` for content. Semantic colors only (no hardcoded hex). Honor `prefers-reduced-motion`.
- Server Components by default; client only at interactive leaves; per-widget Suspense (PAGE-FRAMEWORK §5).
- Each phase ships as its own reviewable PR; no big-bang.
