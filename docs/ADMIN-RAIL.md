# The Standardized Admin Rail — the site-wide settings menu

> **One settings menu for the whole site, baked into the theme chrome, whose content is
> role-resolved Apps from The Loom.** Every signed-in member always has it; what's *inside*
> is generated per `(page scope × role × capability)` from the App catalog — personal
> settings for everyone, the 9-category management spine for editors, operator tools for
> staff. Nothing hardcoded: add an App to the catalog, it appears for whoever their role
> permits.
>
> Extends [LOOM-PLATFORM.md](LOOM-PLATFORM.md) §5 (Pillar B). Builds on the shipped LP4 core
> (the `adminScopeFor` scope resolver + the catalog-driven `settings-panel`) and the
> `App` contract (`lib/apps/*`). **Status legend:** ✅ done · 🔵 this plan · 🔒 deferred.

---

## 1. Principles (from menu-management research, 2024–2026)

The design decisions this plan commits to, each grounded in current best practice:

| # | Principle | Source lens | How it shapes the rail |
|---|---|---|---|
| P1 | **Browse-first, search-accelerated.** Spine is primary; search is a fast fuzzy overlay across the whole scoped catalog, not the front door. | Algolia · NN/g hybrid-nav | The 9-spine (+ a personal section) is the default view; a search box filters across every scoped App and jumps categories. |
| P2 | **Exactly two levels.** Category → detail. Anything deeper is a Focus page. | NN/g progressive disclosure | Rail never nests a third tier; an App needing more routes out to `FocusTemplate`. |
| P3 | **Filter before render.** Hide never-eligible; lock-with-reason only for could-unlock; never appear-then-error. | Smashing "Hidden vs Disabled" | `appsForScope` removes Apps the role can't touch; a gated-but-attainable App renders a lock + one-line reason + CTA. |
| P4 | **Drop empty categories; collapse a single-populated category into its detail.** | NN/g · Fitts's Law | After scope×role filtering, empty spine categories vanish; one populated category lands the viewer directly in it (today's flat panel = this case). |
| P5 | **Chunk to beat Hick's Law; keep the spine order fixed.** | Laws of UX · Material 3 (3–7/level) | 9 glanceable buckets, short App lists; sub-group a detail with `SectionHeader` past ~7. Fixed spine order = muscle memory; frequency ranking only inside search results. |
| P6 | **Fuzzy, keyboard-first search; one catalog source for browse + search.** | cmdk canon · CLS research | Subsequence match on label + keywords; focus search on open, arrows/Enter; search indexes the exact set browse shows (no misses, no CLS). |
| P7 | **Accessible drill-down.** Focus into the detail heading; Back/Escape returns a level and restores focus; mobile = modal bottom sheet with explicit close. | NN/g bottom sheets | Baked into the component from the start. |
| P8 | **Minimal + fast.** Server-render the scoped catalog, per-section Suspense, instant filter, full keyboard path. | Linear · Stripe | No shell spinner; skeletons at final dimensions. |

**Adopt now (v1):** P1–P8 structure, filtering, both nav modes. **Defer (v2):** per-scope reorder/enable-disable, frequency/recency ranking, upsell "request access" flows, pinned Apps.

---

## 2. The model

```
  ┌─ AdminBar (theme chrome — always present for a signed-in viewer) ──┐
  │  Search settings…                                        [search]  │
  │                                                                    │
  │  YOU            (always)      account · profile · notifications …  │  ← personal Apps
  │  THIS <ENTITY>  (when scoped) Basics · Place&Time · People · …     │  ← 9-spine mgmt Apps
  │  OPERATOR       (staff)       Page · Layout · …                    │  ← operator Apps
  └────────────────────────────────────────────────────────────────────┘
        one FLAT list — each category is a header, its Apps rendered under it, all in view
        content = appsForScope(scope, viewer) over the ONE App catalog (Loom)
```

### 2.1 Inline-first, flattened (ADR-514 — supersedes the two-level drill-down)

The owner directive: **the rail renders settings INLINE ("everything in view"); only feature workflows
link out to a management page.** So the bar is a single flat, spine-ordered scrolling list — each
populated category is a lightweight header (`SPINE_META` label + Icon) followed by its Apps, rendered at
once. Categories are headers, not drill targets (the old HOME→CATEGORY drill-down and the single-category
collapse are gone). The **search box** stays pinned at the top as a *filter* over the flat list (P1/P6 —
the Hick's-Law mitigation for a taller bar); picking a result scrolls to that App's section. The model
sheds `flat`/`categories`/`content` for an ordered `sections: { slot, label, Icon, nodes }[]`.

**The `render` classification.** Each editor App carries `surfaces.editor.render: 'inline' | 'link'` (a
NEW axis, distinct from ADR-138's `surface: 'inline' | 'sidebar'` tune-vs-manage meaning). It is the
single decision point in `settings-panel`'s `nodesForAppIds`:

- **`inline`** — mount the App's editor component in the bar (`MODULE_COMPONENTS[id]`). Every **core
  entity** module (`circle · hub · nexus · event · practice · channel`) is `inline`: each entity's module
  IS its dedicated editor (the `/manage` + `/settings` consoles merely re-compose the SAME module
  components), and where a deeper feature-workflow page exists (e.g. the event guest dashboard) the inline
  module already deep-links to it — so keeping them inline satisfies "everything in view" without a
  regression. The **personal config** surfaces were `inline` under ADR-514 Phase C+D — but **ADR-515 Phase 2
  (§5.6) REVERSED that**: only **Profile** (plus a condensed Spotlight + a Layout link) stays inline; **Appearance ·
  Notifications · Connections and location** moved to the bottom bank, so their inline wrappers +
  `getNotificationsRailData` / `getConnectionsRailData` were retired (only `getProfileRailData` remains in
  `app/(main)/settings/rail-getters.ts`). A Space's **config**
  surfaces — **Basics · Mode and focus · Page** — are `inline` via `space-{basics,mode,page}-module` over
  `manage/rail-getters.ts`. **Every getter re-gates server-side** (the Space getters via
  `resolveSpaceManageAccess` + the surface's function check; the personal getters on the AUTHED viewer) and
  returns `null` when unauthorized, so the wrapper renders nothing — the flatten never weakens a gate
  (fail-safe).
- **`link`** — draw a compact `SurfaceLinkRow` OUT to the App's own page (an entity-agnostic row taking a
  resolved href). A Space's **feature workflows** — Members · CRM · Offerings · Services · QR · Email ·
  Insights · Billing · Danger — are `link`; their href comes from `hrefForSurface(id, slug)`. The
  **personal feature workflows** — **Account and privacy** (blocked-members management + data export +
  account deletion; no single reusable inline form) and **Billing** — are `link`; their href comes from
  `hrefForEntitySurface(id, scope)` (`lib/admin/entity-surface-hrefs.ts`, the core/personal twin of
  `hrefForSurface`).

This fixed the ADR-513 regression (a Space showed *every* surface as a link-row, losing the inline
Customize drawer). Phase C/D (ADR-514) shipped the core/personal classification: every core entity stays
`inline`; the personal config surfaces are `inline` (via the settings rail-getters + wrappers) and the
personal feature workflows (Account and privacy, Billing) `link` out through `hrefForEntitySurface`.

**Keep-it-in-the-rail summary cards + identity strip (Phase 2, ADR-514).** The owner directive is to keep
the SIGNAL in the rail: a primary Space feature `link` surface that has ONE honest, glanceable stat draws a
compact **summary card** — the `SurfaceLinkRow` chrome (icon + label + chevron) plus a second line with the
inline stat and a **"View more"** affordance — while the deep workflow still opens on its own page. The rule
is data-driven and fail-safe: a `render: 'link'` surface gets a card **IFF** `SURFACE_SUMMARIES[id]` exists
(`components/admin/modules/surface-summaries.ts`, the client-boundary map that mirrors `module-map.tsx`),
otherwise it falls back to the plain `SurfaceLinkRow` (lifted into its own module so the panel and the card
share it without a cycle). The four cards + their stat + source:

| Surface | Stat | Source (the LEAN read) |
|---|---|---|
| `space.people` | "N members" (active only) | `listSpaceMembers`, count `status==='active'` |
| `space.engage.crm` | "N in your pipeline" | `getDeals(spaceId)` length (one query, not the 4-read funnel) |
| `space.services` | "N services listed" | `readProfileData(prefs).offerings`, count `isServiceListed` (no extra query) |
| `space.comms` | "N campaigns" | `listSpaceCampaigns` length (self-gated, fail-safe `[]`) |

`space.offerings` (adaptive, no single honest stat) and every **extra**-tier surface (QR / Insights /
Billing / **Danger** — Danger must NEVER carry a stat) stay plain link-rows. Each card self-fetches through a
read-gated getter (`getSpace{Members,Crm,Services,Campaigns}Summary` in `manage/rail-getters.ts`) that
re-gates exactly like `getSpaceBasicsData` (`resolveSpaceManageAccess` + the surface's per-Space function)
and returns a tiny serializable `{ count } | null`; a `null`/failed read degrades the card to the plain
link-row (never a broken card, never a weakened gate). The COPY (singular/plural, plain nouns, no em dashes)
lives with the client map, not the getters. A **compact identity strip** (`space-identity-strip.tsx`, over
`getSpaceIdentityData`) is pinned at the very top of the standard tier for a Space scope: a small cover
thumbnail with the logo chip overlaid + the name + an **"Edit"** link to `/settings/basics`. It self-fetches
and renders **nothing** for a non-manager. Both ride the CLIENT-built `SettingsPanelModel` (a new
`identityStrip` `ReactNode` slot) — never the serializable `OpenAdminBarDetail`. `admin-bar-body` renders the
strip above the inline sections in the **non-search** branch only, so search results are unaffected.

- **Presence** is unconditional for an authed viewer (the personal set is never empty → the "hide when empty" rule yields "always shown" for free).
- **Content** is `appsForScope(scope, viewer)` — the same catalog that feeds the Loom Apps lane. Personal Apps are `scope: global`, member-gated; management Apps are entity-scoped, capability-gated.
- **One component** renders it as a right-rail slide-over (lg+) and a bottom sheet (<lg).

**Entities on the rail (all of them).** `circle · event · hub · nexus · practice · profile` open the rail via `OpenAdminBarButton` with a Capability-gated scope. **Space** joined them (ADR-513): a Space profile's owner "Customize" trigger opens the SAME rail pointed at a `space` scope, whose editor Apps come from `SPACE_SURFACES` keyed by `{ on:'spaceType' }` + a `spaceFunction`/`none` gate (Space authority is SpaceRole + `spaceFunctionAccess`, never a `Capability`, so it carries `spaceFns` on the trigger detail instead of caps). Its **config** surfaces (Basics / Mode / Page) render **inline** and its **feature workflows** render as **link-rows** into the existing `/spaces/<slug>/settings/*` sub-pages, per each surface's `render` classification (§2.1, ADR-514); the full-page `/manage` console is NOT converged (they share sub-pages via the one `hrefForSurface` map, not chrome). Basics / Page / Mode / Services / Danger are gate `none`, so an owner always sees a non-empty rail. This retired the bespoke `SpaceCustomizeButton`/`SpaceCustomizeDrawer` + `OPEN_SPACE_CUSTOMIZE`.

### 2.2 Three tiers — standard · primary · extra (ADR-514 three-tier reorg)

The owner directive: **the menu is correct but disorganized — reorder by most-used/importance.** So the flat
spine list is banded into **three tiers** (a SEPARATE axis from the spine `category` noun and from `render`),
each editor carrying `surfaces.editor.tier: 'standard' | 'primary' | 'extra'` + a within-tier `priority`:

| Tier | What lives here | How it renders |
|---|---|---|
| **standard** | Identity / profile — the entity's Basics + Page + Mode, and the member's own Profile. "Standard content at top." | Inline editors, at the **very top**, always expanded. |
| **primary** | The most-used management surfaces, ordered by `priority` (importance). For a Space, **CRM leads** (priority 10, right under the standard block), then Members · Offerings · Services · Email; for the member, Appearance · Notifications · Connections. | Inline editors and/or `link` rows, expanded, below standard. |
| **extra** | Everything else — analytics/Insights, Reach/QR, Billing, and **Danger** — obscured so it never crowds the top. | Folded into **one** native `<details>` **"More"** disclosure at the very bottom, default **CLOSED**. |

- **`tier` + `render` stay ORTHOGONAL.** `tier` decides the band; `render` (inline vs `SurfaceLinkRow`) still
  decides how a surface draws. A standard-tier surface can be inline (Basics) and a primary-tier one a link (CRM).
- **The pure seam** is `lib/admin/modules/spine.ts`: `TIER_ORDER`, `tierForApp` (the fail-safe resolver), and
  `groupIntoTiers` (partition → sort within band by `priority`, with **personal-before-management** and fixed
  spine order as tiebreaks so **"You" leads each band** → group into per-`(tier, slot)` sections). `settings-panel`
  feeds it the resolved editor Apps + the folded inline extras (page-content → standard, quest/Layout → primary,
  event Danger → extra); `admin-bar-body` renders standard + primary inline, then the "More" `<details>`.
- **Fail-safe defaults.** An untagged surface → `primary`; an untagged **`danger`** surface is forced to `extra`
  (a destructive surface can never render expanded at top). `priority` defaults to the editor's `order`.
- **Danger stays reachable.** Danger sits in the extra band under a **closed** "More", but it is always mounted
  (its section is in the DOM even while collapsed) and stays in the search index; picking a Danger (or any
  extra-band) result in search **opens "More" first**, then scrolls to it. The label is the plain noun **"More"**
  (sentence case, no em dash — CONTENT-VOICE §10).
- **A slot may span bands.** The personal "You" (account) slot splits across all three (Profile → standard,
  Appearance/Notifications/Connections → primary, Account-and-privacy/Billing → extra); the `${tier}:${slot}` ref
  key keeps each section unique.

**Polish (Phase 3, ADR-514).**
- **"More (N)".** The extra `<details>` summary shows a count badge of the tucked settings (summed `nodes`,
  not headers) plus a `ChevronDown` that rotates via the native `group-open:rotate-180`; the badge carries an
  `aria-label` ("N more settings") so the bare digit has an accessible name.
- **Slim inline Page panel.** `SpacePagePanel` leads with the quick tweaks (grid, cover, cover style, accent,
  focus) and tucks the three heavy sections (Pages, Business info, External website) behind one local
  **"More page settings"** `<details>`. A closed `<details>` keeps its children mounted, so every control stays
  reachable, keyboard-operable, and reachable by a read-only staff previewer — no server/getter/registry change.
- **Mobile + a11y.** Disclosure summaries are `py-3` (44px tap target) and the identity strip "Edit" link is a
  `min-h-[44px]` target; both mobile bottom-sheet and desktop slide-over render the same body, so the tiers +
  "More" scroll inside the sheet's own overflow (never clipped). Empty tiers/strip/"More" already degrade to
  nothing (guarded upstream), so no orphan headers.

---

## 3. The phases (each shippable, gated `tsc && lint && test`)

### Phase 1 — Typed entry seam + caps threading 🔵
*Behavior-preserving foundation (Planner B, Parts A3 + B).* 
- New `open-admin-bar` `CustomEvent<{ scope?, caps?, slot?, appId? }>` (keep the legacy `open-settings` listener during migration); one `OpenAdminBarButton({ scope, caps, label })`; collapse the five per-entity edit buttons into it, each passing its **DB-id** scope + page-resolved caps (avoids the slug≠id trap and the stale-layout trap).
- Thread route-independent **global caps** (`getGlobalCapabilities()`) through `PageAdminProvider`; per-entity caps ride the event from the page that already resolved them.
- Refine `showsAdminBar` to **editor-only** (`appsForScope(scope, viewer, 'editor')`) so page blocks stop falsely lighting the bar (the LP4-flagged hole).
- **Files:** `components/admin/open-admin-bar.{ts,tsx}`, the five entity pages, `page-admin-bar.tsx`, `settings-drawer.tsx` + `mobile-settings-sheet.tsx` (dual listener), `app-shell.tsx` + `app/(main)/layout.tsx` (caps), `lib/apps/for-scope.ts`.

### Phase 2 — One `AdminBar` component 🔵
*Merge into one themed chrome element (Planner A, B3).* 
- New `components/layout/admin-bar/admin-bar.tsx`: desktop slide-over at lg+, `createPortal`'d bottom sheet at <lg; 100% of the resize/persist/`onStateChange`/focus/Escape logic preserved. Replace the drawer + sheet + the shell mount points; delete `settings-drawer.tsx` + `mobile-settings-sheet.tsx`. Rename `SettingsDrawerState` → `AdminBarState` (shim during migration).

### Phase 3 — Drill-down + search 🔵
*The research principles land here (Planner A, B4 + P1–P8).* 
- `lib/admin/modules/spine.ts` (pure, tested): `SPINE_META` (noun labels, icons), `groupIntoSpine`, `summaryFor`, the single-category-collapse decision.
- `components/layout/admin-bar/admin-bar-body.tsx`: HOME = populated categories in fixed spine order (P5) with counts, dropping empties (P4); CATEGORY = that slot's existing module cards with Back; a persistent fuzzy search box filtering across the whole scoped set (P1/P6); single populated category → land directly in it (P4); focus/Escape/mobile per P7; skeletons at final size (P8).

### Phase 4 — Personal Apps + always-available menu 🔵
*Make it THE site-wide settings menu (the added requirement).* 
- Seed a **"You"** personal App set — Account, Profile, Notifications, Appearance, Connections, Billing — as `scope: global`, member-gated editor Apps whose components render the existing `/settings/*` forms (wrap, don't rewrite). Add the personal grouping above the management spine.
- The editor set is now non-empty for every authed viewer → the bar is **always available**; drop the entity-only presence assumptions. `/settings/*` pages compose the same Apps (or redirect into the menu) so there is one settings surface.
- Register the AdminBar as **theme chrome** (mounted site-wide via the shell, tokens only).

### Phase 5 — Role-gating polish 🔵
*P3/P9 fidelity.* Filter never-eligible Apps out; for capability-gated-but-attainable Apps (plan/owner-grant), render a lock affordance + one-line reason + optional "Request access"/"Learn more". No silent greyed rows, no appear-then-error.

### Phase 6 — Per-scope App overrides 🔒→🔵
*Operator customization (Planner C, B6; research v2).* New `app_overrides` table mirroring `page_chrome_overrides` (keyed `(scope_key, app_id)`, `enabled`/`position`/`min_role`, fail-safe to catalog defaults); `loadAppOverrides` + pure `mergeAppOverrides`; a Loom-style manage surface under `/admin/page-layout`. Spine order stays fixed; overrides act on Apps within categories.

### Phase 7 — Fill the 9-spine for every entity 🔵
*Breadth (Planner C, S1–S4).* Copy the LP-EVENT recipe to add the missing spine modules — **Circle** (Place&Time, People, Engage, Comms, Insights), **Hub/Nexus** (People, Layout, Reach, Comms, Insights, Danger), **Practice** (Layout, Engage, Insights). Confirmed: **no new capabilities or migrations** (all gates + data exist); Safety + the richer role ladder are the only cells needing a migration and are deferred to S4. Each cell = a registry row + map binding + module component + two gated actions (+ optional page block). Parallelizable per entity.

---

## 4. Sequencing & dependencies

```
 Phase 1 (seam + caps) ─▶ Phase 2 (one component) ─▶ Phase 3 (drill-down + search)
                                                          │
                                                          ▼
                                              Phase 4 (personal Apps + always-on)
                                                          │
                                                          ▼
                                              Phase 5 (role-gating polish)
 Phase 7 (spine-fill) — parallel, depends only on the LP-EVENT recipe (independent of 1–5)
 Phase 6 (overrides)  — independent; best after 4 so there are personal + mgmt Apps to govern
```

Phases 1–5 touch the coupled core (`settings-panel`, `admin-bar`, `app-shell`, `for-scope`) and run **sequentially**, green at each step. Phase 7 fans out per entity. Every phase is behavior-preserving until Phase 4 intentionally flips presence to always-on.

**Guardrails (unchanged):** capabilities are UX on the client, law on the server (every App action re-checks its gate); DAWN tokens only, no hex, no `text-[Npx]`; labels pass NAMING.md + CONTENT-VOICE.md §10 (no em dashes); no CLS.

---

## 5. The uniform rail contract (ADR-515) — the `placement` axis + bottom bank + sticky search

The redesign directive: **every rail obeys ONE contract.** A sticky search pinned to the top, the first
content section as the top of the box, core settings inline, a promotable second layer to a fixed bottom
bank of primary areas, and an owner-visible layout chooser. **Phase 1 (the keystone, shipped) establishes
the MECHANISM without mass re-tagging** — later phases opt surfaces onto it.

### 5.1 The `placement: 'inline' | 'bank'` axis

A FOURTH editor axis (orthogonal to `surface`, `render`, and `tier`), on `surfaces.editor.placement`,
carried from `AdminModule.placement` / `SpaceSurface.placement` through the catalog exactly like `render`:

- **`inline`** (the default everywhere) — the surface renders in the rail BODY via `render`/`tier`, unchanged.
- **`bank`** — the surface is promoted into the bottom BANK button-grid instead of the body; `settings-panel`
  resolves its href (Space → `hrefForSurface`; core/personal → `hrefForEntitySurface`) and merges it in.

The keystone tagged nothing `bank`; **Phase 2 (the personal rail, shipped) opts the personal "You" set in**
(see §5.6). Round-trip note: `toAdminModule` (`lib/apps/adapters.ts`) carries `placement` back exactly like
`render`/`tier`, so the catalog composition still round-trips byte-for-byte.

### 5.2 The bottom bank — `lib/admin/rail-bank.ts`

`bankForScope(scope, viewer, extra)` (pure, unit-tested) returns the FIXED per-scope primary-area
quick-links MERGED with any `placement: 'bank'` surface links:

| Scope | Bank |
|---|---|
| **space** | Manage console · CRM · Insights · Billing (via `hrefForSurface`, slug from `scope.id`) |
| **personal / global / profile** | All settings · Billing; + Operator · CRM · Insights when `viewer.isStaff` |
| **event / hub / nexus / circle / practice** | the `/{section}/<slug>/manage` console |
| **channel** | `/admin/channels` · `/admin/moderation` when `viewer.isStaff` (operator-curated, no per-channel console); `[]` otherwise |
| **unknown / null** | `[]` (empty-safe) |

Fail-safe: de-dupes by href, **never admits a Danger / destructive href**, returns `[]` for a null/unknown
scope. `admin-bar-body` renders it as a bordered `grid grid-cols-2` of button links (min 44px, focus ring)
under a plain **"Go to"** label, as the LAST block in the browse branch (hidden in search), only when non-empty.

### 5.3 Sticky search + start-at-first-section

The search wrapper is `sticky top-0 z-20` with a `bg-surface` backdrop bleeding over the scroll
container's `p-4`/`p-5` padding (negative margins), kept mounted in both search + browse states. The chrome
"Settings" title header collapses to **just the close button** on desktop + mobile, so the sticky search +
first content section are the top of the rail.

### 5.4 Owner-visible layout chooser

The circle/event/**practice** Layout / template chooser is de-operatorized: gated on the ENTITY EDIT
capability (`viewer.caps.has('circle.editSettings')` / `event.editSettings` / `practice.editSettings`), not
the staff `isOperator` axis (the `isModuleRoute` guard stays), so it is an owner-visible guaranteed section on
the `<PageModules>`-driven scopes. Scopes whose detail page is HAND-BUILT (hub / nexus) have no arrangeable
block set, so instead of a broken picker they carry a minimal `*.layout` registry module — a labelled Layout
affordance that states the page uses a standard fixed layout and links to the Manage console (§5.10). Channel
detail is not module-driven and is operator-curated, so it is a genuine exception with no layout chooser.

### 5.6 The personal "You" rail (Phase 2, shipped) — REVERSES ADR-514 Phase C+D

The owner directive: the personal rail is ONLY the member's own core admin. The body is exactly three
inline surfaces; every secondary account surface leaves the sidebar for the bottom bank. This **reverses
ADR-514 Phase C+D**, which had inlined Appearance, Notifications, and Connections and location.

| Surface | id | Placement | Renders as |
|---|---|---|---|
| Profile | `account.profile` | inline (standard) | `PersonalProfileModule` → `ProfileForm` with `hideSpotlight` |
| Spotlight | `account.spotlight` | inline (standard) | `PersonalSpotlightModule` — condensed status pill + Publish/Unpublish + "Build your page" |
| Layout | `account.layout` | inline (primary) | `PersonalLayoutModule` — a link-row to `/people/<handle>/profile-preview/edit` |
| Appearance | `account.appearance` | **bank** | bank button → `/settings/appearance` |
| Notifications | `account.notifications` | **bank** | bank button → `/settings/notifications` |
| Connections and location | `account.connections` | **bank** | bank button → `/settings/connections` |
| Account and privacy | `account.privacy` | **bank** | bank button → `/settings/account` |
| Plan and billing | `account.billing` | **bank** | bank button → `/settings/billing` (dedupes the base bank Billing) |

So the personal rail reads: **sticky search → Profile → Spotlight → Layout → bottom bank** (Appearance ·
Notifications · Connections and location · Account and privacy · Billing · All settings). The retired inline
wrappers (`personal-{appearance,notifications,connections}-module.tsx`) and their getters
(`getNotificationsRailData` / `getConnectionsRailData`) are gone; only `getProfileRailData` remains, feeding
all three inline surfaces (it already carries the spotlight flags + the handle). The condensed Spotlight and
Layout modules self-fetch it and re-gate on the authed viewer, so a signed-out viewer (or, for Spotlight, a
member who cannot enable it) renders nothing (fail-safe). `ProfileForm` gained a `hideSpotlight` prop so the
rail suppresses the big Spotlight block (the condensed section stands in); the full `/settings/profile` page
keeps it.

### 5.7 Phased rollout

1. **Keystone (Phase 1, shipped)** — the `placement` axis, `bankForScope`, sticky search, collapsed header,
   owner-visible layout chooser, and the `event/hub/nexus` manage-console href seam. Non-breaking.
2. **The personal "You" rail (Phase 2, shipped)** — §5.6: Profile/Spotlight/Layout inline; the secondary
   account surfaces to the bank (reverses ADR-514 Phase C+D).
3. **The Space rail (Phase 3, shipped)** — §5.8: the Space's public-profile editors stay inline; its
   back-office destinations (CRM · Email · QR · Insights · Billing) move to `placement: 'bank'`, and the
   structural template chooser is surfaced inline in the Page panel.
4. **The circle + event rails (Phase 4, shipped)** — §5.9: the circle gets a first-class This-week's-practice
   picker + an inline Insights readout, and its create quick-actions (New event · New announcement) move to
   the bank; the event's Manage dashboard is the bank's canonical console button; both layout choosers are
   owner-visible.
5. **The hub / nexus / practice / channel rails (Phase 5, shipped)** — §5.10: practice gets the real
   owner-visible LayoutEditor; hub + nexus get a minimal Layout affordance (their pages are hand-built);
   channel gets a staff in-place Edit trigger + an operator `/admin` bank. Journey is Phase 6.
6. **Empty the `extra`/"More" disclosure** — as surfaces move to the bank / inline, the current "More" tier drains.

### 5.8 The Space rail (Phase 3, shipped)

The owner directive (verified survey): **if a feature paints on the public Space profile, its editor is
INLINE in the rail; if it is a back-office destination, it is a BOTTOM-BANK button.** So the Space rail
body carries the identity + everything the visitor sees, and the private workflows move to the bank.

| Surface | id | Placement | Why |
|---|---|---|---|
| Basics | `space.basics` | inline (standard) | name / logo / cover / tagline / contact — the profile head |
| Mode and focus | `space.mode` | inline (standard) | how the space runs, framing the whole page |
| Page | `space.layout` | inline (standard) | layout / cover / accent / blocks — plus the new inline template chooser |
| Offerings | `space.offerings` | inline (primary) | the Book CTA + offerings block paint on the profile |
| Services | `space.services` | inline (primary) | the storefront paints on the profile (keeps its summary card) |
| Members | `space.people` | inline (primary) | the Team block paints on the profile (keeps its summary card) |
| CRM | `space.engage.crm` | **bank** | the pipeline board is private back-office, never on the public page |
| Email | `space.comms` | **bank** | campaign composition never on the public page |
| QR codes | `space.reach` | **bank** | a back-office destination |
| Insights | `space.insights` | **bank** | analytics, a back-office destination |
| Plan and billing | `space.billing` | **bank** | a back-office destination (dedupes the base bank Billing) |
| Danger zone | `space.danger` | inline (de-emphasized) | destructive must NEVER be a quick-link — stays the last body item |

So the Space rail body reads: **identity strip → Basics → Mode → Page → Offerings → Services → Members →
[Danger, de-emphasized]**, and the bottom bank is **Manage console · CRM · Email · QR · Insights ·
Billing** (the fixed `bankForScope` base — Manage / CRM / Insights / Billing — MERGED with the
`placement: 'bank'` surfaces' hrefs, de-duped by href). Note: Insights currently shares the QR page
(`/settings/qr`, no standalone insights route yet), so QR + Insights collapse to one bank button by the
href de-dupe; both destinations are reachable. `settings-panel` resolves each banked surface's href via
`hrefForSurface(id, slug)` (slug from the live path) and passes them as the `extra` arg to `bankForScope`,
which drops any Danger href — so Danger can never reach the bank even by mistake.

**The inline template chooser.** The owner directive: *every admin bar should carry the layout chooser
with the multiple templates.* The 7 structural `TEMPLATES` (`lib/widgets/templates.ts`) previously lived
only inside the standalone grid editor; a COMPACT `TemplateThumbnail` picker now leads the Page panel's
quick tweaks (`components/spaces/space-page-panel.tsx`, above cover size). Picking a tile writes the chosen
`template` onto `preferences.profileLayout` (the same `EntityLayout` node `mergeEntityLayout` reads) via a
new `setSpaceProfileTemplate(slug, template)` action (`manage/layout/actions.ts`) that re-gates the owner
server-side (`authorizeEditor` → `canEditProfile`, staff preview fails closed) and preserves every other
`profileLayout` key (slots / hidden / order). The full drag-and-drop grid editor stays the deep "Edit your
profile" own-page link. `TemplateThumbnail` is reused from the layout editor (now exported);
`readProfileTemplate` (`manage/layout/preferences.ts`) feeds the current choice to the panel through
`getSpacePageData` and the `/manage/layout` page.

### 5.9 The circle + event rails (Phase 4, shipped)

The owner directive: **the rail body is the page's own core admin — one control for every on-screen
function; the second layer / back-office and the create paths go to the bottom bank; every rail carries the
layout chooser.**

**Circle.** Two on-screen functions had no rail control, so each gets one:

| Surface | id | Placement | Why |
|---|---|---|---|
| This week's practice | `circle.practice` | inline (engage, primary) | the host-assigned practice paints on the circle page (the "This week's practice" card + member log) — the picker, extracted out of Circle Quest into its own module |
| Insights | `circle.insights` | inline (extra) | circle health (Zaps earned here · active streaks · new this week) is an on-screen readout; mirrors hub/nexus/practice insights |

The circle **bank** is **Manage console · New event · New announcement** — the two create quick-actions
(`/events/new?circle=<id>` · `/broadcast?compose=true&scope=<id>`) mirror the header `CircleHostMenu`
exactly, keyed on the same circle id the scope carries. **Deviation (stated):** the plan named an Insights
*bank link*, but a circle has **no standalone insights page** — pointing a bank button at `/circles/<slug>`
is circular and the health panel has no anchor, so per the plan's own fallback Insights is an **inline**
health module instead. `circle.practice` re-checks `circle.assignTask` (the engage authority + the SAME
capability it declares); setting the practice reuses `setCirclePracticeAction`, which re-checks
`circle.editSettings` (co-granted to a circle leader — so the write gate is never weaker than the read gate).
`circle.insights` re-checks `circle.editSettings`. Both render nothing for anyone else (fail-safe). Neither is
tagged `placement: 'bank'`, so the "core entities render inline" invariant holds.

**Event.** The rail body keeps Settings · Place & Time · People · Engage inline and the Danger zone inline
(de-emphasized — never banked). The **bank** is a single **Manage dashboard** (`/events/<slug>/manage`) — the
second-layer console that already carries the roster, approvals, questionnaire, sent Dispatches, AND the
analytics, so Insights folds into it (a separate Insights button would dedupe to the same href) and the
on-page Dispatch composer stays the compose path (there is no standalone dispatch-compose route). The
`EventPeopleModule`'s in-body "Open the guest dashboard" link-card was **removed** — the canonical "open the
dashboard" affordance is now the bank button; the module keeps only the inline approve/counts work.

**Layout choosers.** Both are owner-visible per the keystone de-operatorization (§5.4): the injection is gated
on the ENTITY EDIT capability (`viewer.caps.has('circle.editSettings')` / `event.editSettings`) behind the
`isModuleRoute` guard, and renders as a proper `layout`-slot primary section — not the staff `isOperator` axis.

### 5.10 The hub / nexus / practice / channel rails (Phase 5, shipped)

Same owner directive as §5.9. Each entity keeps its existing inline body (Settings · People · Insights ·
Danger, all inline and de-emphasized where destructive) and gains the missing layout affordance; nothing new
is banked.

| Scope | Rail body (inline) | Layout chooser | Bank |
|---|---|---|---|
| **hub** | Settings · People · **Layout** · Insights · Danger | `hub.layout` — minimal affordance (hand-built page → no arrangeable blocks), links to the Manage console | Manage console (base `bankForScope`) |
| **nexus** | Settings · People · **Layout** · Insights · Danger | `nexus.layout` — same minimal affordance, links to the Manage console | Manage console |
| **practice** | Settings (embeds Danger delete) · **Layout** · Insights | REAL `LayoutEditor` — the practice page IS `<PageModules>`-driven, so the circle/event injection generalizes to it (`settings-panel.tsx`, `layoutBlock('practice')`, gated `practice.editSettings` + `isModuleRoute`) | Manage console |
| **channel** | Settings · Insights (both staff-gated) | none — channel detail is not module-driven and is operator-curated (a genuine, stated exception) | `/admin/channels` · `/admin/moderation` (staff) |

**Hub / nexus Layout.** Their detail pages are hand-built (fixed sections: identity → insight → circles/hubs),
NOT `<PageModules>`-driven, so there is no block set to reorder. Rather than fabricate a broken picker, each
gets a minimal `*.layout` registry module (`hub-layout-module.tsx` / `nexus-layout-module.tsx`, `layout`-slot,
primary) that self-fetches `getHubAdminData` / `getNexusAdminData` (null unless the manage capability, so it
renders nothing otherwise — fail-safe), states the page uses a standard fixed layout, and links to the Manage
console where the sections + settings live. Honest affordance, not a dead control.

**Practice Layout.** The practice detail body is module-driven (stats · intro · guide · tags · used-in), so the
circle/event `layoutBlock` injection generalizes to a third noun (`'practice'`): a real `LayoutEditor`, gated
owner-visible on `practice.editSettings` behind the `isModuleRoute` guard (identical de-operatorization to
§5.4). It renders exactly when the practice settings module does (host+/staff owner), so no gate is weakened.

**Channel.** Topical channels are platform-curated — there is no per-channel owner, so `channel.manage` is
staff-only and the member page had no admin trigger. The detail page now mounts an `OpenAdminBarButton`
`scope={{ kind: 'channel', id }}` gated on `channel.manage` (resolved via the new `getChannelCapabilities`),
so a staff viewer reaches the single Channel settings module — plus a new staff **Insights** readout
(`channel.insights`, tuned-in + circles, reusing the same tables the detail page counts) — in place. Its
**bank** is a new `case 'channel'` in `bankForScope`: staff → the operator `/admin/channels` directory +
`/admin/moderation` (channels are governed from the `/admin` hub, not a per-entity console); a non-staff
viewer never reaches the rail, so the bank is `[]`. Channel detail is not `<PageModules>`-driven, so it gets
NO layout chooser — a genuine exception, not a forced broken picker.

---

*Synthesized 2026-07-02 from three implementation-planning passes + a menu-management best-practice research pass; §5 added 2026-07-04 (ADR-515). A named track under the Loom Platform; routes per DOCS-PROTOCOL.md (this spec + ADRs → git).*
