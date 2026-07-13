# Admin Design System

The single standard for every operator surface under `/admin` (and the admin-owned
external routes). Research-backed (Stripe, Linear, Vercel/Geist, Shopify Polaris,
Salesforce SLDS, Atlassian, GitHub/Primer, Supabase, Retool, Tremor/Catalyst, NN/g,
WCAG 2.2). This is the spec the redesign build agents follow. If a page disagrees
with this doc, the page is wrong. Scope decision: **deep redesign, keep the current
IA** (no route/URL churn). ADR-233.

> Voice + naming still bind every word here (docs/NAMING.md, docs/CONTENT-VOICE.md):
> camp-counselor-you-respect, plain sentences, **no em dashes in operator copy**.

---

## 1. Principles (ranked)

1. **Answer the operator's first question above the fold.** Every surface resolves its
   primary question (is this healthy? what needs me?) before any scroll.
2. **Surface "what needs attention now," not just "what happened."** Each dashboard has
   one ranked, actionable attention spine; routine state lives below it.
3. **Progressive disclosure by default.** Shallow overview, depth one click or one
   keystroke (⌘K) away. Every number drills to the filtered list/detail that explains it.
4. **Ration color.** Warm neutral chrome; color *means* status. Tabular numerals for all
   metrics so columns align.
5. **One grid, composed not authored.** Every page maps to a template (§3) and composes
   the kit (§4). No bespoke layouts, no `text-[..px]`, no hardcoded hex: semantic tokens only.
6. **Trust is earned with freshness + provenance.** Data tiles carry a quiet "updated Xm
   ago"; metric labels define themselves; stale data is flagged, never silent.
7. **Cap the decision surface.** ≤5 decision-driving metrics per dashboard; the rest move
   to domain dashboards and indexes behind drill links.
8. **Never bare a number.** Value + comparison (signed delta vs a named benchmark) +
   context visual (sparkline / status). A chart earns its place only when the *shape* of
   the data is the insight.
9. **Speed is a feature.** Server-first RSC; the shell + nav + headers paint instantly,
   data tiles stream behind per-section Suspense (no popcorn). Optimistic UI + undo over
   spinners for mutations.
10. **Design IA at the least-privileged role,** reveal upward. Permission-aware UI;
    server always enforces (UI hiding is declutter, not security).
11. **Accessibility is AA, not optional.** Text contrast ≥4.5:1 (≥3:1 large), non-text/
    focus/icon contrast ≥3:1, visible focus, ≥24px pointer targets, honor
    `prefers-reduced-motion`, semantic tables with `scope`/`caption`.

---

## 2. Foundations

**Tokens (already in `app/globals.css`).** Ink is warm charcoal `--color-text #3D352A`;
`--color-muted`, `--color-subtle` step down. Canvas = page; `--color-surface` (white) =
tiles. Status uses semantic tokens only: `success`/`warning`/`danger`/`primary` (+ their
`-bg`). Never hardcode green/red.

**The grammar (the load-bearing rule).** In every section: the **header, subtext, and
instructional copy print on the canvas**; **all data lives in white rounded tiles**. A
tile answers one thing and is a natural Suspense boundary.

**Type scale.** H1 page title (`PageHeading`), H2 area header `text-xl font-bold`, tile
label `text-xs font-semibold uppercase tracking-wide text-muted`, metric value
`font-bold` (never extrabold) `tabular-nums`, body `text-sm`, caption/footnote `text-xs
text-subtle`. No `text-2xs`/`text-3xs` for content.

**Density & rhythm.** Tile radius `rounded-2xl`, padding `p-4 sm:p-5`, grid gap `3.5`.
KPI rows: ≤4 per row so cards stay wide enough for a sparkline; wrap to a second row.

**Motion.** Transitions ≤300ms, ease-out; everything behind `motion-reduce:`.

---

## 3. Page-template taxonomy

Every admin surface maps to exactly one. Each composes `AdminTemplate` (the shell:
`PageHeading` + width + `AdminSection` blocks) unless noted.

1. **Exec Dashboard:** `/admin` home. Header KPIs → Vera's read → ranked **Attention**
   spine → one rich tiled section per domain (the current home grammar). One only.
2. **Domain Dashboard:** `/admin/{programs,community,growth,operations}`. Same tiled
   grammar scoped to the domain: KPI MiniStat clusters + graphs + a domain attention
   strip + entry tiles (area cards) into the domain's indexes. **Retire `DashSection`
   white cards here: use `DashArea`/`Tile`/`MiniStat`.**
3. **Index / Table:** the workhorse (members, circles, events, content, audit…). Header
   + instructional copy on canvas; a `FilterBar` (URL-state) above a `DataTable`. The page
   reads the filter/sort/page params and orders/limits the query server-side. Full-width.
4. **Entity Detail:** one member/circle/event/season/deal/ticket. `EntityHeader`
   context band (identity, status pills, key facts as a description list, primary
   actions) → `UnderlineTabs` for sibling views (each tab its own URL segment). Optional
   right rail of secondary metadata.
5. **Queue:** moderation, support, help-gaps, personas, partner verification. A triage
   segment/filter rail → a **risk/age-ranked** list where each row exposes its decision
   inline (approve/reject/escalate/assign) → optional detail pane. T&S queues add
   wellbeing affordances (blur-to-reveal). Throughput, not browsing.
6. **Focus / Form:** compose/edit one thing (rail-less, centered single column, grouped
   fields, clear primary/secondary actions).
7. **Wizard:** multi-step setup (season launch, demo gen, QR/entry builder). Explicit
   per-step "Save & continue"; never mix save patterns within a step.
8. **Settings:** config (AI, payments, roles, Vera, rewards rules). **Annotated
   sections** (`FormSection`: left title+description, right controls). Toggles autosave
   with inline "Saved"; declarative fields explicit-save; destructive actions confirmed.

---

## 4. Component kit (contracts)

Build missing ones in `components/admin/` (or `components/ui/` if app-wide). Props are
the contract; keep them server-friendly (no client hooks unless interaction requires it).

**Existing, reuse:**
- `AdminTemplate`/`AdminSection` (`components/templates/admin-template`): page shell.
- `DashArea` · `TileGrid` · `Tile` · `GraphTile` · `MiniStat` · `MiniGrid` (`components/
  admin/dash`): the tiled dashboard grammar.
- `StatCard` (`components/ui/stat-card`): KPI tile: `label, value, icon?, delta?{label,
  trend}, href?, detail?, bordered?, size?`. **Extend:** add optional `sparkline?: number[]`.
- `spark-charts`: `TrendArea`, `WeekBars`, `RingGauge`, `weeklyBuckets`, `cumulative`.
- `EmptyState` (`components/ui/empty-state`): **extend to variants** (below).

**Build:**
- `DataTable<T>`: the canonical operator table. **SERVER-SAFE** (no `'use client'`/hooks):
  a Server Component renders it directly and `render`/`rowActions`/`rowHref` run on the
  SERVER (NEVER pass functions to a client child, that throws at request time; a cell may
  RETURN client components like `StatusChip`). Contract: `columns: ColumnDef<T>[]` where
  `ColumnDef = { key, header, render?(row), align?, sortable?, width?, type?:
  'text'|'number'|'tag'|'date'|'currency'|'boolean'|'avatar'|'actions' }`; `rows: T[]`;
  `getRowId(row)`; `rowHref?(row)` (first cell becomes the row link); `rowActions?(row)`
  (revealed on hover, CSS); `stickyHeader`; `density?: 'comfortable'|'compact'`; `caption`
  (a11y); `empty`; `expandedRowId`+`expandedRow(row)` (inline-edit panel). **Sort / filter /
  paginate are server-owned:** the page reads the `?sort`/filter params and orders/limits
  the query, then passes ready rows; `ColumnDef.sortable` is a marker (make the `header` a
  `<Link href="?sort=key">`). Selection / bulk actions, if ever needed, live in a small
  Client wrapper (no page uses them today). Beyond ~few-thousand rows, push the work into
  the server query.
- `FilterBar`: URL-as-state filter row (`{ filters, search? }`: selects + search +
  removable chips) above a `DataTable`; writes to the query string (a Client island that
  passes NO functions, so a Server page can render it). The page reads the params.
- `StatusChip`: `{ tone: 'success'|'warning'|'danger'|'info'|'neutral', children }`.
  Pill, tokenized. The ONE status vocabulary (retire per-page `*_STYLES` dicts).
- `Badge`: count badge (neutral, tabular).
- `Banner`: `{ tone: 'info'|'warning'|'critical', title, children?, action?, dismissible? }`.
  `critical` sets `role="alert"`. The disciplined callout vocabulary (color = severity).
- `EntityHeader`: context band: `{ title, avatar?, badges?, facts?: {label,value}[],
  actions?, back? }`. Description (key/value) list for facts, not a two-col table.
- `UnderlineTabs`: `{ tabs: {href, label, count?}[] }`, each tab a real URL segment.
- `FormSection`: annotated settings group `{ title, description, children }` (left
  copy, right controls), stacked.
- `DangerModal`: `{ title, body, confirmLabel, onConfirm, requireTyping? }`. Named
  action button, **safe button is default**, destructive never the Enter default.
  Tier: reversible → `UndoToast`; risky-recoverable → `DangerModal`; irreversible/bulk →
  `requireTyping`.
- `UndoToast`: optimistic action + transient "Undone?" affordance (Atlassian flag style).
- `AttentionList`: the needs-attention spine: ranked `{severity, title, finding,
  action:{label,href}}[]`; only actionable, role-relevant items; reuses `SeverityChip`.
- `FreshnessNote`: quiet "Updated {relative}" (warning treatment past an SLA). Sits as a
  tile/section footnote.
- `TableSkeleton` / tile skeletons: dimension-matched, CLS-safe Suspense fallbacks.

---

## 5. Interaction standards

- **Drill-down everywhere.** Every KPI, count, and status pill links to the filtered
  Index/Detail that explains it. No dead-end numbers.
- **URL-as-state.** Filters, sort, tab, page live in the query string / route segment, so
  the Server Component renders them and they're shareable/bookmarkable.
- **Inline edit = changeset → explicit Save.** Edits accumulate keyed by id; one Save
  commits + validates. No per-cell autosave for operator data.
- **Destructive tiering.** Reversible → undo toast. Risky-recoverable → `DangerModal`
  (named button, safe default). Irreversible/bulk-destructive → type-to-confirm. Don't
  gate routine actions (every needless confirm erodes them all).
- **Save semantics, one per surface.** Toggles/imperative → autosave + visible "Saved".
  Declarative fields/forms → explicit Save. Never mix within a form.
- **Per-section Suspense; degrade, don't disable.** Each slow await behind its own
  boundary; a failed secondary region shows an inline notice or hides (counts/badges
  hide). It never takes down the shell, and controls use an inactive state, not
  `disabled`, for availability reasons.
- **⌘K command bar** (extend `AdminSearchBar`): jump to any surface, any entity by name,
  run verbs; context-scoped; multi-modal parity (button + shortcut + palette).
- **Permission-aware.** Render per capability (existing `sections.ts` gating); disable
  -with-tooltip where discoverability helps; server always enforces.

---

## 6. States

- **Loading:** dimension-matched skeletons (not spinners), grouped per section to avoid
  popcorn; shell never blocked. Protect CLS by reserving space.
- **Empty:** `EmptyState` variants: `first-use` (teach + one imperative CTA),
  `no-results` (suggest broadening the filter), `cleared` (celebrate the done queue),
  `error` (alert icon, specific cause, recovery action, no playful art, preserve input),
  `permission` (full-page, explains the boundary). Never a blank pane.
- **Error:** plain language, specific, constructive, polite, high-contrast, preserves
  the operator's input. Modal only for consequential decisions; banner/inline otherwise.
  Don't validate a field before it's done.
- **Success:** toast for completed bulk/async actions.

---

## 7. Engagement strategy (our roles + Vera)

- **A daily "what needs me" entry point.** The Home + domain attention spines are
  role-aware and risk-ranked (moderation by violation-probability × reach; support by
  age/SLA × sentiment), each item one click from its next action. Only actionable,
  role-relevant items appear (suppress noise → no alert fatigue).
- **Next-best-action, inline.** Surface the highest-value action where the operator
  already is (queue row, entity context band), as a proposal with accept/reject, never a
  separate to-do app, never a silent mutation.
- **Vera as an embedded copilot,** at the point of work (draft a moderation rationale,
  summarize a member on the context band, explain a KPI's movement, propose a config in a
  wizard). Always propose-then-confirm (diff/preview), cite sources, show confidence as
  bands not false precision, label AI output, respect RLS/permissions. Routes through
  `lib/ai/voice.ts`.
- **Saved views + ⌘K are the habit loops.** Returning operators land in their saved view;
  power operators live in the palette. Both reward repeat use with speed.

---

## 8. Migration & rollout

**Per-page checklist** (the definition of done for each surface):
1. On `AdminTemplate` (retire the `AdminPage` alias import).
2. Maps to one template (§3); composes the kit (§4): no bespoke layout/table/form.
3. Canvas headers + white tiles; warm type; tabular numerals; tokens only (no hex / `text-[..px]`).
4. Every number drills; status via `StatusChip`; deltas + freshness where data is time-varying.
5. All four states handled (loading skeleton, empty variant, error, success).
6. Per-section Suspense; shell never blocks.
7. A11y AA (focus, contrast, targets, semantic table, reduced-motion).

**Rollout map** (audit: 71 surfaces). One PR per domain after the foundation kit lands.

| Domain | Surfaces (route → template) |
|---|---|
| **Home** | `/admin` Exec-Dashboard ✅ (reference) |
| **Programs** | `/admin/programs` Domain-Dashboard · `/admin/content` Index · `content/seasons` Detail · `content/journeys` Index · `content/practices` Index · `content/challenges` Index · `content/tips` Index · `content/training` Form · `gamification` Index · `store` Index · `rewards` Form · `crew-tasks` Index |
| **Community** | `/admin/community` Domain-Dashboard · `circles` Index · `hubs` Index · `nexuses` Index · `channels` Index · `members` Index(tabbed) · `roles` Settings · `personas` Queue · `events` Index · `events/[id]` Detail · `dispatches` Focus/Form · `moderation` Queue · `support` Index · `support/[id]` Detail |
| **Growth** | `/admin/growth` Domain-Dashboard · `crm` Index · `crm/contacts` Index · `crm/deals/new` Form · `crm/deals/[id]` Detail · `crm/deals/[id]/edit` Form · `marketing` Domain-Dashboard · `marketing/contacts(/[id])` Index/Detail · `marketing/campaigns` Index · `marketing/funnels(/[id])(/variants/[codeId])` Index/Detail · `marketing/automations` Index · `marketing/analytics` Analytics · `marketing/agent` Wizard · `marketing/nurture` Index · `marketing/beta` Index · `marketing/market-read` Analytics · `segments` Index · `engagement` Analytics · `expansion` Analytics · `outcomes` Analytics · `qr`/`qr/stats` Wizard/Analytics · `intel` Analytics · `insights` Exec-Dashboard-ish · external `/entry-points` Wizard |
| **Operations** | `/admin/operations` Domain-Dashboard · `ai` Settings · `vera` Settings · `help-gaps` Queue · `payments` Settings · `demo`(`/studio`) Wizard · `audit` Index · `studio` Queue/Index · external `/pages`,`/pages/splash`,`/pages/sequences`,`/programs` |

**Cross-cutting sweep** (own PR): the chrome (`layout`, nav, `AdminSearchBar`→⌘K,
`AdminInfoRail` attention, footer), the `EmptyState` taxonomy + skeletons, `StatusChip`/
`Banner` adoption to retire every `*_STYLES`/`ACTION_LABEL`/`STATUS_STYLE` dict, and the
a11y + freshness pass.

---

## 9. Sources

Stripe, Linear, Vercel/Geist, Shopify Polaris, Salesforce SLDS, Atlassian, GitHub/Primer,
Supabase Studio, Retool, Tremor/Catalyst; NN/g (dashboards, F-pattern, tables, empty/error,
progressive disclosure, response times, skeletons), W3C WCAG 2.2, web.dev Core Web Vitals,
MDN reduced-motion. Full URL lists are in the redesign research briefs (session record,
2026-06-11). Key thresholds: WCAG 2.2 AA text 4.5:1 / non-text 3:1 / targets 24px; CWV
LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; response limits 0.1s/1s/10s.
