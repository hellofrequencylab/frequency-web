# Navigation System Redesign: one registry, one language, many surfaces

> **Status:** 🟡 PROPOSAL, pending owner approval. Supersedes the admin-only
> `ADMIN-IA-PROPOSAL.md` and extends the member-side `IA-RESTRUCTURE.md` (owner-approved
> 2026-06-06) into ONE site-wide model, with names drawn from `docs/NAMING.md` (the locked
> canon wins on every name). Nothing is built until this is approved.

**The answer in one paragraph.** The site already has the right idea half-built: `lib/menus`
(ADR-390) resolves five surfaces from one type system. But three hand-maintained admin catalogs
still feed it in parallel and drift, a legacy overlay (`lib/menu-config.ts`) runs a second ordering
pass, and twenty-two render surfaces each re-implement gating. The rework has three moves. **(1) One
registry:** every destination declared once in `lib/nav/registry.ts` with one two-axis gate; every
surface (rail, mobile bar, header, admin sub-nav, footer, `⌘K`) becomes a filtered projection of it.
**(2) One language:** the whole system runs on a **Calm ↔ Studio mode axis** the naming canon already
reserves — *Calm* is the clean member app, *Studio* is the operator workspace the same spine
repopulates into, so members never carry admin weight and operators get a real workspace. Both modes
use the identical shape: a fixed 4-slot spine with the raised **Zap** button (⚡) at center on
mobile, one level of drill-down, `⌘K` as the cross-mode power-nav. **(3) One admin sub-nav pattern:**
kill the mega-menu's second dropdown layer; primary categories live on the left, and the **active
category's sub-pages render as a single horizontal row of text links in the band above the search
bar** (the spot already exists in the admin layout). Role is unchanged, just enforced by one
resolver instead of five.

**Legend:** ✅ ready / keep · ⏳ proposed · ⚠️ needs an owner or naming-canon decision · 🔴 remove.

---

## 1. Where we are (the problem, in three lines)

| Problem | Evidence | Cost |
|---|---|---|
| 🔴 The admin IA is declared **three times** and has drifted | Loom Studio = a top-level rail area, a child of *Acquisition* on the dashboards, and **absent** from the sub-header. All Spaces / Marketplace / QR / Segments each land under a different parent per file | Adding one admin page = editing 3 files + syncing gates by hand |
| 🔴 **Two** DB override systems run at once | `lib/menu-config.ts` (order/hide) **and** `lib/menus` (the editor) both execute in `(main)/layout.tsx` | A weaker second source of truth |
| ⚠️ Gating re-implemented **per surface** | `meetsAccess`/`meetsStaff` · `canUseLink`/`canSeeGroup` · `canSeeAdminSection` · `canSeeMenuEl` | Four takes on one rule; agree by discipline, not construction |

Full 22-surface inventory captured in the audit notes; the rest of this doc is the target.

---

## 2. Principles (grounded in current best practice)

| Principle | Source pattern |
|---|---|
| A fixed 4-slot spine, icon **+** label, thumb-zone; center action button | Instagram / TikTok / Spotify tab bars; the **Zap** button is already canon (ADR-230) |
| Two levels max, then drill in-page (hubs with sections, not route trees) | Owner's own `IA-RESTRUCTURE.md`; Nielsen progressive disclosure |
| A **mode switch** repopulates the spine, instead of a bigger menu | Discord "switch server"; Instagram "Professional Dashboard"; the canon's **Calm/Studio** axis |
| Command palette (`⌘K`) as universal power-nav | Linear / Superhuman / Figma |
| Progressive disclosure by role: basics for all, advanced revealed by capability | Nielsen 1995; SaaS standard |
| One registry, many projections | The direction ADR-390 already set |

Sources: [UXPin mobile nav](https://www.uxpin.com/studio/blog/mobile-navigation-patterns-pros-and-cons/) · [NN/g mobile nav](https://www.nngroup.com/articles/mobile-navigation-patterns/) · [Discord 2025 UI](https://support.discord.com/hc/en-us/articles/12654190110999-New-Mobile-App-Updates-Layout) · [Instagram Professional Dashboard](https://help.instagram.com/257516379077270/) · [IxDF progressive disclosure](https://ixdf.org/literature/topics/progressive-disclosure) · [Superhuman command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)

---

## 3. The engine: one registry → many projections

One module, `lib/nav/registry.ts`, holds every destination as a `NavNode`. Every surface imports it
and *projects* it: filter by the viewer's gate, filter by mode + surface, lay out for that surface.
`lib/menus` (the DB editor at `/admin/menu`) stays as the **override layer on top** — the registry is
the code default it seeds from and falls back to, so operators keep reorder/hide/re-gate.

```ts
type NavNode = {
  id: string                       // stable key (= permission key = DB primary key)
  label: string                    // the NAME (see §7); canon-governed
  href: string
  icon: string                     // resolved by nav-icons.ts
  blurb?: string                   // one-liner for dashboard / mega cards
  parent?: string                  // world → section → leaf (max 2 nav levels)
  mode: 'calm' | 'studio'          // which spine this belongs to
  surfaces: NavSurface[]           // 'spine' | 'sub' | 'header' | 'footer' | 'profile' | 'palette'
  gate: { minAccess: MenuAccess; staffDomain?: StaffDomain; staffLevel?: Access }  // ADR-390, unchanged
  display?: 'active' | 'ghost' | 'hidden'   // ghost = muted upsell/preview
}
```

**One resolver.** `canSee(node, viewer)` = `meetsAccess(minAccess) OR staffCan(staffDomain, staffLevel)`.
Every surface calls this one function; the four current gate implementations collapse into it. Role is
a property of the node, enforced identically everywhere — that is "role-based permissions integrated."

| Surface | Projection of the same registry |
|---|---|
| Desktop rail | `mode === activeMode && surfaces∋'spine'`, grouped by `parent`, gate-filtered |
| Mobile bar | the 4 top-level spine nodes of the active mode + the Zap center button, gate-filtered |
| World sub-nav (§6) | children of the active world, gate-filtered, flat |
| Header mega (public) | `surfaces∋'header'` (marketing pages; visitor gate) |
| Footer | `surfaces∋'footer'`, gate-filtered (drops empty columns) |
| Account menu | `surfaces∋'profile'` + fixed chrome (sign out, theme, report) |
| `⌘K` palette | **every** node the viewer can see, **both modes** — the cross-mode jump |

---

## 4. The Calm ↔ Studio mode axis (the spine)

The naming canon reserves **Studio** for "the creation tool + the future **Calm/Studio mode axis**"
(`NAMING.md` §Profile pages). This redesign *is* that axis:

- **Calm** = the member app. Clean, consumer, everything a normal member does. Default for everyone.
- **Studio** = the operator/creator workspace. The same 4-slot spine repopulates with operator worlds.
  Revealed only to viewers the registry shows a Studio node to (host+ OR any staff domain) — a plain
  member never learns Studio exists. This is progressive disclosure by role.

The switch is the existing **Context Switcher**, promoted to a first-class **Calm / Studio** toggle in
the profile card (desktop) and the account sheet (mobile). `⌘K` spans both modes, so an operator jumps
from a Calm page straight to a Studio destination without touching the toggle (the Linear move).

> ⚠️ **Naming decision 1:** ratify **Calm** (member mode) / **Studio** (operator mode) against the
> canon's reserved "Calm/Studio mode axis," or pick the member-mode word if "Calm" isn't locked.

---

## 5. Global menu structure WITH names

### 5a. Calm mode — the member spine (4 slots + Zap)

Condensed from today's sprawl per the owner-approved `IA-RESTRUCTURE.md`. Every name below is
canon-checked (§7).

| Slot | World | Sections (one level of drill) | Absorbs |
|---|---|---|---|
| 1 | **Home** | Feed · Around You | Feed + the right-rail dispatch/event/circle widgets |
| 2 | **Community** | Circles · Channels · Events · People · Marketplace · Spaces | the Community world + browse |
| — | **Zap** (center ⚡) | Capture menu + the **Mindless** door (ADR-230) — an ACTION, not a world | the raised center button, already canon |
| 3 | **The Quest** | Journeys · Practices · Library · The Vault | the 10 `/crew/*` routes → one hub |
| 4 | **Messages** | Direct messages · Channels rooms · Friends | Message Boards + `/friends` |
| — | **You** (avatar, top-right) | Profile · Spotlight · Journal · My Spaces · Settings | account menu + stranded personal surfaces |

- **Mobile:** slots 1-2 and 3-4 flank the raised **Zap** button dead-center (TikTok/Instagram center
  action). **You** is the avatar top-right, keeping the bar at four + the action. This is the
  canonical Zap placement, not a new invention.
- **Desktop:** the same four are the left rail worlds, each expanding to its sections inline; the Zap
  action lives in the header (its current home).
- Anything deeper than a section is in-page (tabs, detail panels), never a third nav level.

### 5b. Studio mode — the operator spine (the three drifting catalogs, unified)

The ~30 admin surfaces collapse into four Studio worlds + an Overview. This is the single Studio
sub-tree of the registry that the rail, the sub-nav (§6), and the dashboards all project — so the
drift in §1 becomes structurally impossible.

| Slot | Studio world | Sections (render as the horizontal sub-nav, §6) | Consolidates today's |
|---|---|---|---|
| 1 | **Overview** | Dashboard · Today (Vera's queue) | `/admin` + the exec read |
| 2 | **Community** | Circles · Templates · Hubs · Nexuses · Channels · Members · Roles · Events · Broadcasts · Moderation · Support | Community + Operations people/trust |
| 3 | **Growth** | Entry points · QR · Referrals · Applications · Onboarding · Campaigns · Funnels · Automations · CRM (Cockpit · Contacts · Deals · Segments · Graph) | Growth + Resonance CRM + Marketing |
| 4 | **Content** | Seasons · Journeys · Practices · Challenges · Training · Tips · Gamification · Store · Tasks · **Loom** (the library) | Programs + Content + Rewards + Loom Studio |
| 5 | **Platform** | Menu · Pages · Page layout · Theme · Spaces · Marketplace · Payments · Pricing · Vera · Insights · Demo · Audit | Operations + Vera AI + Marketplace + All Spaces |

- **Gates are unchanged.** Every leaf keeps its exact current `min` + `staffDomain` + `staffLevel`;
  only where it is *declared* moves, never what it *permits*. Janitor-only stays janitor-only.
- Studio has **five** primary categories (one more than Calm's four) because operators are power users
  at a desk; on mobile Studio still surfaces the four most-used as the bar and the rest via `⌘K` + the
  category list.

> ⚠️ **Naming decision 2:** the five Studio world names — **Overview · Community · Growth · Content ·
> Platform**. "Loom" is the canon name for the library/DAM; the operator library tool is **Loom**
> (drop the "Studio" suffix once Studio is the *mode*, to avoid "Studio inside Studio").

---

## 6. The admin sub-nav rework (the specific change you asked for)

**Today:** on `/admin/*` the app shell renders a `MegaBar` (`triggerLevel='category'`) in a full-width
band; the active section's `groups` become **dropdown panels** — a second layer of hover/click menus.

**Target:** a flat, one-layer, left-plus-top pattern (GitHub / Stripe / Linear settings shape):

- **Primary categories on the LEFT** — the five Studio worlds (§5b) live in the left rail, exactly like
  Calm's worlds. Clicking one lands on its dashboard and sets the active category.
- **Sub-pages as horizontal text links ABOVE the search bar** — the band that today holds the MegaBar
  becomes a single horizontal row of the active category's sub-pages rendered as **plain text links,
  left to right, no dropdown**. The active leaf is underlined/emphasized. This is the "spot already in
  the layout" (the sticky admin sub-header band above `AdminSearchBar` in `app/(main)/admin/layout.tsx`).

```
┌─ left rail ──┐  ┌─ content column ─────────────────────────────────────────┐
│ Overview     │  │  Circles · Templates · Hubs · Nexuses · Channels · …      │ ← sub-nav band (text links)
│ Community  ◄─┼─▶│  [ 🔍  Search admin, or ask Vera … ⌘K ]                    │ ← search bar (unchanged spot)
│ Growth       │  │                                                            │
│ Content      │  │  … page content …                                          │
│ Platform     │  └────────────────────────────────────────────────────────────┘
└──────────────┘
```

**What changes in code (design only, not built yet):**

| Change | Where |
|---|---|
| ⏳ Replace the admin `MegaBar` with a flat horizontal link row (`AdminSubNav`) | the `showAdminMega` block in `app-shell.tsx` (~L1566-1587, L1756-1770) |
| ⏳ Flatten `admin_header` to one level | `admin_header` categories keep children today; render only the leaves of the active world as links, no panel |
| ⏳ Overflow handling | many sub-pages → horizontal scroll or a trailing "More" text link (still one layer, no mega panel) |
| ✅ Keep the search bar exactly where it is | `AdminSearchBar` band stays; the link row sits directly above it |
| ✅ Left categories come free from the unified rail | Studio worlds already in the left rail (§5b); no separate admin catalog |

Net effect: the admin nav becomes **left categories + top text-link sub-nav**, single layer, and it is
projected from the same registry as everything else — the three admin catalogs stop existing.

### 6a. Sticky chrome + background (the styling fix)

The sub-nav menu and the search bar form **one sticky chrome block**: the **menu (text links) sits
directly ABOVE the search bar**, and the whole block gets a **solid background that matches the site
canvas** (`var(--color-canvas)`, full opacity) so **page content scrolls cleanly underneath it**.

🔴 **Bug this fixes (visible in the current build):** on scroll, today's sticky band is only opaque
around the input, so a transparent gap above it lets page content bleed through — the "Manage the
asset library…" line and the orange button show through behind the search bar. The block must be a
**single opaque sticky container** covering menu + search, edge to edge, no transparent gap.

| Property | Spec |
|---|---|
| Stacking | menu row on top, search bar below, in **one** `sticky` container (not two separate sticky elements with a gap) |
| Background | `bg-[var(--color-canvas)]`, **fully opaque**, spanning the full band height (menu + search + padding) |
| Scroll behavior | at top: block sits just under the site header; on scroll: block sticks under the header, page content passes **beneath** it (nothing bleeds through the padding) |
| Offset | pin to the header height (`top-[calc(3.5rem+safe-area)]`, `md:` the header+band height), as the band does today — just make it cover the menu too |
| Divider | a hairline `border-b` under the block reads as chrome, so the scroll seam is clean, not a floating input |

This lands in phase 4 (§9) with the `MegaBar` → `AdminSubNav` swap: the flat link row is rendered as
the top of the existing sticky band in `app/(main)/admin/layout.tsx`, not as a separate floating bar.

---

## 7. Names (canon-checked)

Every member-facing label is governed by `docs/NAMING.md`. Nav labels that are already locked:

| Nav label | Canon status | Note |
|---|---|---|
| **The Quest** · Journeys · Practices · **The Vault** | ✅ locked | The Quest → Journey → Practice; the Vault holds Gems/Zaps/Awards |
| **Channels** ("tune in") | ✅ locked | the seven topical forums; never "Interests" |
| **Circles · Hubs · Nexuses** | ✅ locked | the community tree |
| **Spotlight** | ✅ locked | member's opt-in public mini-site; **not** "Studio" |
| **Zap** button (⚡) · **Mindless** timer | ✅ locked | the center capture action + the timer door (ADR-230) |
| **Marketplace** · Housing · Makers · Shop | ✅ locked | the market areas |
| **Vera** | ✅ locked | the one system voice; Studio's assistant |
| **Loom** | ✅ locked | the DAM / library (operator "Loom", drop the "Studio" suffix under Studio mode) |
| **Broadcasts / Dispatches** (`/broadcast`) | ✅ locked | leader transmissions; distinct from Vera Dispatches |
| **Around You** | ⚠️ open in `IA-RESTRUCTURE.md` | keep, or rename to "Community Hub"? |
| **Calm** / **Studio** (the mode axis) | ⚠️ ratify | canon reserves the axis; confirm the two mode words |
| Studio worlds: **Overview · Community · Growth · Content · Platform** | ⚠️ approve | operator-facing, not member copy, so lighter canon load |
| **People** (the directory) vs **My Contacts** | ⚠️ confirm | keep the split; confirm labels |

> All AI-generated nav copy still routes through `lib/ai/voice.ts`; any new member-facing string runs
> the `CONTENT-VOICE.md` §10 checklist (no em dashes in brand copy).

---

## 8. What consolidates, what retires

| Action | Change | Effort |
|---|---|---|
| ⏳ Build `lib/nav/registry.ts` + `canSee` | one catalog; `NAV_AREAS` + `ADMIN_NAV` + `ADMIN_GROUPS` become derived views, then delete | **L** |
| ⏳ Calm/Studio mode switch | promote Context Switcher; spine reads `activeMode` | **M** |
| ⏳ Admin sub-nav rework (§6) | `MegaBar` → flat `AdminSubNav` text-link row above the search bar | **M** |
| ⏳ Mobile bar + `⌘K` from the registry | tab bar (4 + Zap) and palette become projections | **M** |
| 🔴 Retire `lib/menu-config.ts` | `lib/menus` already supersedes it | **S** |
| 🔴 Collapse the 3 admin catalogs | rail, sub-nav, dashboards all project the one Studio sub-tree | **L** |
| ✅ Keep the ADR-390 DB editor | `/admin/menu` now edits *the* registry, not three seeds | — |
| ✅ Right rail = context only | per `IA-RESTRUCTURE.md` §4, no nav; relocate widgets to Around You / Quest | — |

---

## 9. Phased build plan (each phase ships standalone, reversible)

1. **Registry + resolver (invisible).** `lib/nav/registry.ts` + `canSee`; re-express `NAV_AREAS` as a
   projection. Pure refactor, test-covered. The keystone.
2. **Collapse the admin catalogs.** `ADMIN_NAV` + `ADMIN_GROUPS` → the Studio sub-tree; sub-nav +
   dashboards project it. Deletes the drift.
3. **Retire the legacy overlay.** Remove `lib/menu-config.ts`.
4. **Admin sub-nav rework (§6).** Flat left-categories + top text-links; remove the mega dropdown.
5. **Calm/Studio mode switch + the four/five worlds.** Spine repopulates by mode.
6. **Mobile bar (4 + Zap) + `⌘K` from the registry**, and the member condensation already approved in
   `IA-RESTRUCTURE.md` (fold `/crew/*` → Quest, Vault → the Quest, Friends → Messages, Library → a
   Practices tab; retire the right rail as nav).

Phases 1-4 are consolidation + the admin sub-nav you asked for (removes drift, the dead overlay, and
the second dropdown layer). Phases 5-6 are the visible member redesign.

---

## 10. Decisions I need from you

| # | Decision | Options |
|---|---|---|
| 1 | **Mode names** | Ratify **Calm** (member) / **Studio** (operator), or set the member-mode word |
| 2 | **Calm worlds** | Home · Community · Quest · Messages (+ Zap center, You avatar) — approve or reshape |
| 3 | **Studio worlds** | Overview · Community · Growth · Content · Platform — approve or move leaves |
| 4 | **"You" as avatar vs 5th tab** | Avatar top-right (Instagram, keeps the bar at 4) vs a literal tab |
| 5 | **Admin sub-nav overflow** | Horizontal scroll vs a trailing "More" text link when a world has many sub-pages |
| 6 | **Scope** | Full six-phase build, or start with phases 1-4 (consolidation + the admin sub-nav) to de-risk first |

Once you pick, I'll turn the approved shape into the registry types + the phase-1 refactor and we go
from there. No nav code changes until you approve.
