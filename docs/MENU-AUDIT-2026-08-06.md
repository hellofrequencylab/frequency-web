# Menu system audit — 2026-08-06

> **Status lives in [`docs/BUILD-BACKLOG.json`](BUILD-BACKLOG.json)** — run `pnpm backlog`.
> This document is the spec and the rationale. It does **not** record what is done, because prose
> cannot be verified and this repo has lost that bet five times ([ADR-1043](DECISIONS.md)).

**Status:** ✅ Audit + the redesign it produced. The audit stands as written below (it is the
record of what was wrong); **ADR-953 to ADR-957** are the answers, shipped in the same PR.

**Everything in §6 is closed except one item:** mobile header sub-links (§2.3 #6) — `PrimaryNav`
is `hidden md:block` and the marketing sheet renders trigger labels only, so 22 links including
the six `/for/*` pages have no path from a phone header. Deliberately deferred as its own pass.

Findings verified against the code on `claude/frequency-menu-audit-33skn4` and against the LIVE
`Frequency Community` database (`menus` / `menu_categories` / `menu_items`), read-only.

**Legend:** ✅ correct / ⏳ works but weak / ⚠️ needs an owner call / 🔴 broken today.

---

## The answer in one paragraph

The architecture is sound and it is genuinely one system: every menu surface projects from
`lib/nav/registry.ts`, `lib/menus` is the DB override on top, and the admin rail's separate
contract (`MENU-CONTRACT.md`) is green (`pnpm check:menu` passes, 357 nav/menu/layout tests
pass). **What is broken is not the architecture. It is (a) one layout rule in the mega-menu
renderer that makes every dropdown a narrow column inside a mostly-empty full-width band, and
(b) the live DB menu data, which was hand-edited at some point and has drifted away from the
code defaults in ways nothing guards.** The left rail you are looking at is **not** the rail in
`lib/nav-areas.ts` — the `left` surface is seeded (3 groups, 31 rows), so the DB wins and the
code list is dead weight. Three of those DB rows are wrong in ways a member can see, including
an **"Admin" group with a "Market" row that is visible to every logged-in member**.

---

## 1. What the system actually is (the map)

```
lib/nav/registry.ts  ── the ONE declaration of every destination (NavNode + canSee)
        │                 built from lib/nav-areas.ts (member spine) + lib/nav/studio.ts (operator)
        ▼
lib/menus/defaults.ts ── projects the registry into 5 ResolvedMenu shapes (code defaults)
        │
        ▼
lib/menus/read.ts  getMenu(surface) ── DB rows if seeded, else the code default
        │
        ├── 'header'       → PrimaryNav → MegaBar          (marketing header, site header, app shell)
        ├── 'left'         → menuToSections → NavLinkList  (desktop rail, folded strip, mobile drawer)
        ├── 'profile'      → AccountDropdown + ProfileCard (top-right menu + rail foot)
        ├── 'footer'       → marketing footer
        └── 'admin_header' → AdminSubNav                   (flat link row on /admin/*)

SEPARATE, and correctly separate — the OPERATOR rail (docs/MENU-CONTRACT.md, ADR-553):
lib/apps/catalog.ts APPS ← SPACE_MODULES · ADMIN_MODULES · LAYOUT_MODULES · STUDIO_LEAVES
        └── appsForScope → settings-panel.tsx (the in-page rail) + the /manage consoles

RAIL PRESENCE + GEOMETRY (a third, also-separate system):
lib/layout/page-chrome.ts   which rail a route gets ('global' | 'scoped' | 'none')
lib/layout/rail-fold.ts     the three-position fold ladder, per viewer, cookie-backed
lib/layout/rail-panels.ts   which right-rail widgets a route shows
lib/layout/shell-metrics.ts the published row geometry (rail widths + gaps)
```

### Is the menu system integrated with the rail system? — ✅ mostly, with two real seams

| Seam | Verdict |
| --- | --- |
| Menu data → left rail render | ✅ One path. `getMenu('left')` → `menuToSections` → `NavLinkList`, and the SAME `navSections` feeds the desktop rail, the folded icon strip, and the mobile drawer. No second list. |
| Menu data → rail presence | ✅ Clean separation by design. `page-chrome.ts` decides *whether* a rail exists; the menu decides *what is in it*. Neither reaches into the other. |
| Menu data → rail fold | ✅ Fold is markup-level (`compact`), handled inside `NavLinkList`. Group labels survive folding as `role="group"` + `aria-label`. |
| Member menu ↔ operator App rail | ✅ Deliberately two systems, both documented, guard-enforced. Do not merge them. |
| **Mega-menu panel ↔ shell geometry** | 🔴 **Broken seam.** `MegaBar` re-states the shell's rail widths and gaps by hand instead of importing `lib/layout/shell-metrics.ts`. See §2.2. |
| **Right-rail panel map ↔ nav hrefs** | ⏳ Drifted. `lib/layout/rail-panels.ts` keys on `/people`; the Members rail row now points at `/network`, so `/network` silently falls to `DEFAULT_PANELS`. |

---

## 2. The main menu (header mega) — why the dropdowns look wrong

### 2.1 🔴 Every dropdown is one 10rem column inside a ~1,140px band

This is the headline. It is a renderer bug, not data.

`PrimaryNav` always passes `cardGutters`, and the `header` menu's `columns` is `6`. In
`MegaBar`, `triggerLevel='category'` means a trigger's panel gets:

```
categories = cat.children   → []      (the header tree is one level deep; no trigger has children)
rootItems  = cat.items      → the 4-7 links
```

`panelBody` therefore renders `categoryColumns = []` and drops **all** the links into a single
`min-w-[10rem]` div (`mega-menu.tsx:459`). That div then goes inside the `cardGutters` grid,
which reserves grid column 1 and column 6 for rail cards and confines content to `2 / 6`
(`mega-menu.tsx:471-484`).

**There are zero rail cards in the database on every surface.** So two of six columns are
permanently blank, and inside the remaining four-column band the content is one ~170px column.

Measured at a 1680px viewport with both rails shown, root font 17px:

| Band | Width | Used |
| --- | --- | --- |
| Panel content column (after rail spacers) | ~1,139px | |
| Reserved gutters (cols 1 + 6, empty) | ~380px | 0 |
| Content band (cols 2-5) | ~760px | ~170px |
| **Blank** | | **~1,000px of 1,139px** |

The "Spaces" dropdown stacks 6 links vertically in that 170px column while a 1,680px-wide
panel sits behind them. That is the "spacing is all fucked up."

**Three independent causes, each fixable on its own:**

| # | Cause | Fix shape |
| --- | --- | --- |
| a | The header tree is one level deep, so `renderCategory` (the multi-column path) never runs | Either flow `rootItems` into N columns, or teach `buildTriggers` to chunk a long single list |
| b | `cardGutters` reserves 2 of 6 columns unconditionally, even with no rail cards | Reserve a gutter only when that side actually has a card |
| c | `columns: 6` is inherited from the marketing-mega shape; a 4-link dropdown does not want a 6-col grid | Size the panel to its content, or make `columns` per-trigger |

### 2.2 🔴 The panel's rail spacers are hand-copied and already wrong

`mega-menu.tsx:607-613` reproduces the shell's row by hand:

```tsx
<div className="mx-auto flex max-w-[105rem] gap-8 px-4 sm:px-6 lg:px-8">
  <div className="hidden w-48 shrink-0 md:block" aria-hidden />
  ...
  {rightRail && <div className="hidden w-72 shrink-0 lg:block" aria-hidden />}
```

The shell's actual row (`app-shell.tsx:2160`, `:2205-2207`, `:2341-2344`) is
`gap-8 lg:gap-10`, left `w-48` **or `w-14` when folded**, right rail an inline
`288 | 56 | drawerWidth` px plus `lg:ml-3`.

| Condition | Shell reserves | Panel reserves | Panel is off by |
| --- | --- | --- | --- |
| lg+, both rails open | left 246.5px | 238px | **8.5px** left |
| lg+, both rails open | right 343.25px | 340px | 3.25px right |
| **Left rail folded to strip** | left 102px | 238px | **136px** |
| **Right rail collapsed** | right 111.25px | 340px | **229px** |
| Settings drawer open (resizable) | right = live drawer width | 340px | unbounded |

🔴 This is *exactly* the class of bug `lib/layout/shell-metrics.ts` was written to end — that
file exists because the claim page hand-derived the same numbers and drifted 232px. It is
drift-tested against `app-shell.tsx`. **`MegaBar` does not import it.** One import plus a
`folded` prop closes this permanently and brings it under the existing guard.

### 2.3 Other renderer findings

| # | Finding | Sev |
| --- | --- | --- |
| 1 | Panel closes on **any** `window` scroll (`mega-menu.tsx:312`). One inertial trackpad pixel while the pointer is inside the panel dismisses it. Stacked on top of a 1500ms pointer-leave dwell. | ⏳ |
| 2 | No focus management: opening does not move focus into the panel; Escape closes but focus is not returned to the trigger. `aria-haspopup="true"` on a disclosure should be `"menu"` or omitted. | ⏳ |
| 3 | The `<Link>` trigger branch (`:559-574`) is dead — both current callers produce triggers with no `href` when a panel exists. It `preventDefault`s a real href, so middle-click/new-tab would lie if ever reached. | ⏳ |
| 4 | Every dropdown repeats its own trigger as the first row ("The Quest › The Quest", "About › About"). By design (`buildTriggers` folds the landing into the panel) but it reads as duplication. | ⚠️ owner call |
| 5 | `hasGridPlacement` inspects `t.categories` and `t.rootItems` only — a *trigger* category's own `gridCol` is invisible to it. The live `Community` row has `grid_col = 6` and it is silently inert. Latent: it becomes a live bug the moment the header uses `triggerLevel='menu'`. | ⏳ |
| 6 | Mobile: `PrimaryNav` is `hidden md:block` everywhere, and `MarketingMobileMenu` renders trigger **labels only**. So on a phone none of the 22 header sub-links (the six `/for/*` persona pages, `/pricing`, `/help`, `/privacy`, `/terms`, `/what-is-frequency`) is reachable from the header. | 🔴 |

---

## 3. The main menu — the DB data is drifted

Live `header` surface: 6 groups, 22 items, 0 rail cards.

| # | Finding | Sev |
| --- | --- | --- |
| 1 | **"Interests"** is the live label for `/discover/topics`. `docs/NAMING.md` locks this: *"The SEVEN topics are Channels, never 'Interests'"* and *"'Interests' is RETIRED as a member-facing word."* The code default says "Channels". The DB overrode the canon. | 🔴 canon |
| 2 | **`Partners` is `mode='hidden'`** — the Community dropdown silently lost `/discover/partners` in production. | ⚠️ intended? |
| 3 | **The `Spaces` trigger has no landing item.** Code default leads with "Spaces directory"; the DB starts at "For coaches and healers". Since a trigger with a panel gets no `href`, **`/spaces` is unreachable from the header.** | 🔴 |
| 4 | **"Business Pricing"** is title-cased among sentence-cased siblings ("For coaches and healers", "Help center"). | ⏳ voice |
| 5 | Trigger reads **"Community"** but lands on `/the-community`, and its first row is "The Community". Code default names the trigger "The Community". | ⏳ |
| 6 | Position gaps: category positions run `0,1,2,3,5,6` (4 deleted); Spaces item positions run `0,1,2,3,4,6`. Harmless, but it is the fingerprint of hand edits. | ✅ cosmetic |
| 7 | `Community.grid_col = 6` — stray placement data (see §2.3 #5). | ⏳ |

---

## 4. The left menu — order and display

### 4.1 The rail you see is the DATABASE, not the code

`menus.surface_key='left'` has 3 categories and 31 items, so `isDefault` is false and
`menuDriven` is true (`app-shell.tsx:1753-1760`). **`lib/nav-areas.ts` no longer renders.**
Two consequences worth stating plainly:

- Editing `NAV_AREAS` to reorder the rail does nothing on the live site.
- The `menuDriven` path **skips telescoping entirely** (`app-shell.tsx:908`:
  `adminSection = !menuDriven && TELESCOPE_SECTIONS.has(...)`). On the DB path, visibility is
  100% `min_access` + `staff_domain` per row. One bad row is a visible row.

### 4.2 🔴 Every member sees an "Admin" group

The live `Admin › Market` row (`/admin/marketplace`) has **`min_access = 'visitor'`** and no
`staff_domain`. `canSeeMenuItem` resolves it `active` for everyone, `menuToSections` renders a
labelled group whenever ≥1 item is visible, and there is no telescoping on this path.

So a plain member's rail ends with:

```
ADMIN
  Market        → /admin/marketplace
```

Not an authorization hole — `/admin/*` re-gates server-side via `requireAdminFloor`, so the
click lands on a redirect. It is a structure leak and a dead-end click. The `Admin` **category**
row is also `min_access='visitor'`, and `menuToSections` does not gate categories at all.

### 4.3 🔴 The DB rail dropped the staff axis on 6 of 13 admin rows

The two-axis gate (ADR-390: role ladder **OR** staff domain) only works if the row carries a
`staff_domain`. The code default rows do. The seeded rows mostly do not.

| Row | Code `staffDomain` | Live DB `staff_domain` | Who lost access |
| --- | --- | --- | --- |
| Community | `community` | `null` | Community staff |
| Programs | `community` | `null` | Community staff |
| Growth | `marketing` | `null` | Marketing staff |
| Vera AI | `insights` | `null` | Insights staff |
| Operations | `platform` | `null` | Platform staff |
| Loom Studio | `marketing` | `null` | Marketing staff |
| QR Studio | `qr` | `null` | QR staff |
| Manage Spaces | *(none)* | `profiles` | — (gained one) |

A staff-only operator whose community token collapses to `member` now sees **none** of their
domains in the rail. That is the exact regression the union gate was built to prevent.

### 4.4 Other left-menu drift (code ⇄ DB)

| # | Finding | Sev |
| --- | --- | --- |
| 1 | `Journal` is `min_access='visitor'` in the DB, `'member'` in code. `/journal` is a personal log. | 🔴 |
| 2 | `Manage Spaces` is `'admin'` in the DB, `'janitor'` in code. | ⚠️ |
| 3 | **`Business Seeder`** (`/admin/business-seeder`, staff `structure`) exists only in the DB — it is not a `NAV_AREA`. Reasonable, and `nestAdminRows` handles it (keyed by href), but it means the code list can never be authoritative again without a reseed plan. | ⏳ |
| 4 | Community group ordering is `10,20,…,110` while Quest/Admin are `0,1,2,…` — two different seeding passes. | ✅ cosmetic |
| 5 | `Shop` is labelled **"Frequency Store"** → `/store` in the DB; code's vertical contributes `shop`. Both routes exist. | ✅ |
| 6 | Code's `admin-crm`, `connections`, `my-spaces` all present. Code's `admin-marketplace` label "Market" collides with the Community group's "Market" (`/marketplace`) — **two rows named "Market" in one rail**. | 🔴 |

### 4.5 The order and grouping, on the merits

Live member rail, top to bottom (13 visible rows before Admin):

```
Feed · Profile
COMMUNITY   Around You · Circles · Channels · Events · Market · Housing ·
            Message Boards · Members · My Contacts · Business Spaces · Frequency Store
THE QUEST   My Quest · Journeys · Practices · Library · Journal · The Vault
ADMIN       (leaks, see 4.2)
```

| # | Finding | Sev |
| --- | --- | --- |
| 1 | **"Community" is 11 rows and holds three unrelated things:** places to gather (Circles/Channels/Events/Around You), commerce (Market/Housing/Frequency Store), and people (Members/My Contacts/Business Spaces). It is the group that most needs splitting. | ⚠️ owner call |
| 2 | **Commerce has no home.** Market, Housing, and Frequency Store are three different retail surfaces filed under "Community". | ⚠️ |
| 3 | **`My Contacts` (`/network/contacts`) is a child of `Members` (`/network`) rendered as its sibling.** `routeActive` prefix-matching also means visiting `/network/contacts` highlights **both** rows. | 🔴 |
| 4 | **"Message Boards" → `/messages`** reads like DMs. DMs live in the chat dock. | ⚠️ naming |
| 5 | The rail exposes 13 member rows + up to 13 admin rows in one column at `w-48`. That is well past the two-level, progressive-disclosure principle `NAV-SYSTEM-REDESIGN.md §2` sets for this system. | ⚠️ |
| 6 | ✅ The Admin section's shape is already solved: `nestAdminRows` (ADR-848) joins rows to their Studio world by href and nests 13 flat rows into 6 boxes, and it works on the DB path too. This is the pattern the member groups do not yet have. | ✅ |

---

## 5. What is healthy (do not touch)

| Area | Why it is fine |
| --- | --- |
| `MENU-CONTRACT.md` / operator App rail | `pnpm check:menu` green; 21 rows of frozen debt in 3 files, all recorded and ratcheted down-only |
| Registry single-source | `lib/nav/registry.source.test.ts` pins it; 357 tests pass across `lib/nav`, `lib/menus`, `lib/layout`, `lib/apps`, `components/layout` |
| Fallback safety | `getMenu` falls back to code defaults on a missing row, a query error, **and** a row that assembles empty. The live `profile` menu row has 0 items and correctly falls through to code. Nav can not go blank. |
| Rail fold | `useSyncExternalStore` + cookie mirror; no-flash seam is correct and documented |
| `page-chrome.ts` | One declarative map; pages never toggle the rail |
| Icon resolution | `railIconFor` → `AREA_ICONS` → `LUCIDE_BY_NAME` → fallback; every live `icon` value resolves. (One gap: `Vault` is in `AREA_ICONS` but not `LUCIDE_BY_NAME`, so a custom row storing `"Vault"` gets the globe.) |

---

## 6. Ranked to-do, with effort

**Tier 1 — visible and wrong today**

| # | Fix | Where | Effort |
| --- | --- | --- | --- |
| 1 | Gate `Admin › Market` correctly (`min_access` → `admin`, restore `staff_domain='platform'`) | DB / `/admin/menu` | minutes |
| 2 | Restore `staff_domain` on the 6 admin rows that lost it (§4.3) | DB | minutes |
| 3 | Fix `Journal` `min_access` → `member` | DB | minutes |
| 4 | Rename `Interests` → `Channels` (locked canon) | DB | minutes |
| 5 | Add the `Spaces directory` landing row so `/spaces` is reachable | DB | minutes |
| 6 | Make the dropdown panel lay out its links in columns and stop reserving empty gutters | `mega-menu.tsx` | ~half day |
| 7 | Import `shell-metrics.ts` into `MegaBar`, pass the fold state, delete the hand-copied widths | `mega-menu.tsx` + `app-shell.tsx` | ~2h |

**Tier 2 — structural**

| # | Fix | Effort |
| --- | --- | --- |
| 8 | Gate the **category** in `menuToSections` (a group header should not render off an ungated item) | ~2h |
| 9 | Decide whether `menuDriven` should telescope like the code path, or whether the DB is now the only gate — and write it down | owner call + ~2h |
| 10 | Split Community into Community / Commerce / People; demote `My Contacts` under `Members` | owner call |
| 11 | Fix `routeActive` so a parent row does not light up on a child route | ~1h |
| 12 | Header sub-links on mobile (the `/for/*` pages are currently unreachable on a phone) | ~half day |
| 13 | Re-point `rail-panels.ts` `/people` rule at `/network` | minutes |

**Tier 3 — keep it from drifting again**

| # | Fix | Effort |
| --- | --- | --- |
| 14 | A drift guard comparing the seeded DB menus to `defaultMenu(surface)` and reporting the delta. Every §3 and §4 finding is a DB↔code divergence that shipped with a green build. | ~half day |
| 15 | A `check:canon` rule over `menu_items.label` for retired words ("Interests") | ~2h |
| 16 | Retire the dead `<Link>` trigger branch; add focus return on Escape | ~1h |

---

## 7. Method

- Code read: `mega-menu.tsx`, `primary-nav.tsx`, `site-header.tsx`, `marketing-mobile-menu.tsx`,
  `app-shell.tsx`, `admin-sub-nav.tsx`, `menu-role.ts`, `nav-icons.ts`, `lib/menus/*`,
  `lib/nav/registry.ts`, `lib/nav/admin-nesting.ts`, `lib/nav-areas.ts`, `lib/layout/*`.
- Guards run: `pnpm check:menu` ✅ · `vitest run lib/nav lib/menus components/layout lib/layout lib/apps`
  → 25 files, 357 tests, all passing.
- Live data: read-only `select` against the `Frequency Community` project's `menus`,
  `menu_categories`, `menu_items`, `menu_rail_cards`.
- Route existence checked for every live `href` in the `header` and `left` surfaces. All resolve.
