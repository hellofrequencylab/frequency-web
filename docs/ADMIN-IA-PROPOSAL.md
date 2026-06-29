# Admin IA: audit + cleaner structure

**The fix in one paragraph.** Resonance CRM is invisible in the main left menu because of one missing line: the left rail is fed by `NAV_AREAS` in `lib/nav-areas.ts`, and Resonance CRM was registered in the two *other* nav systems (`lib/admin/nav.ts` and `sections.ts`) but never added there. Add one nav-area and the cockpit appears in the rail like every other admin domain. The "two Members" confusion is two genuinely different surfaces wearing the same word: `/admin/members` (the full platform roster) and `/admin/crm/members` (a health-scored drill-down). Rename them to **Member Roster** and **Member Intelligence** so the label tells you which one you are in. The CRM sprawl (three "Contacts," an orphaned deal board, a duplicate Growth-CRM tab) collapses into one unified **CRM** domain that keeps the standard CRM functions (Contacts, Deals/Pipeline, Segments, Campaigns) side by side with the integrated Resonance AI (Cockpit, Today, Member Intelligence, Playbooks, Resonance Graph), each with a distinct name and a clear gate.

**Legend:** ✅ KEEP (no change) · 🔁 RENAME (label only) · ➡️ MOVE (reparent) · 🔀 MERGE (collapse duplicates) · ✨ NEW (add a surface).

## The 3 core problems

| # | Problem | Root cause | Impact |
|---|---------|-----------|--------|
| 1 | **Main-menu invisibility** | Resonance CRM is in `nav.ts` + `sections.ts` but not in `nav-areas.ts`, which is the *only* feed for the left rail | Sidebar users have no direct link to the cockpit; IA feels inconsistent with every other admin domain |
| 2 | **Two-Members confusion** | `/admin/members` and `/admin/crm/members` both render the label "Members" in nav, but one is the platform census and the other is a Resonance health drill-down | Operators cannot tell which Members page they are heading to without opening it |
| 3 | **CRM sprawl** | Three surfaces named "Contacts," a deal board with no nav link, and a duplicate `Growth › CRM` tab that overlaps the primary Resonance CRM domain | Standard CRM work (deals, unified contacts) is hard to find; the CRM has two competing homes |

## Why Resonance CRM is not in the main left menu

**Root cause (from the nav trace): the left rail is fed by `NAV_AREAS` in `lib/nav-areas.ts`, and Resonance CRM was never added there.** It was added to the other two nav systems only.

There are **3 distinct, intentionally decoupled nav systems**. Only one is authoritative for the main left menu:

| Nav system | File | What it drives | Resonance CRM present? |
|-----------|------|----------------|:---:|
| **Left rail (MAIN left menu) — AUTHORITATIVE** | `lib/nav-areas.ts` (`NAV_AREAS`) → `app-shell.tsx NavLinkList()` | The vertical sidebar; its "Admin" section renders only nav-areas with `section: 'Admin'` | 🔴 **No** |
| Admin sub-header mega-menu | `lib/admin/nav.ts` (`ADMIN_NAV`) | The horizontal dropdown bar on `/admin/*` routes | ✅ Yes (line 127) |
| Admin dashboard UX | `app/(main)/admin/sections.ts` (`ADMIN_GROUPS`) | Domain switcher, breadcrumbs, dashboard area cards | ✅ Yes (line 268, `key: 'crm'`, primary) |

So a janitor on `/admin/crm` sees the item in the admin sub-header and the dashboard switcher, but **not** in the left rail. The left rail is the one users treat as the single source of truth, which is why the cockpit reads as "missing."

### The precise, minimal fix

**File:** `lib/nav-areas.ts` — add one nav-area to the `Admin` section, after `admin-growth` (line 112), so it mirrors the other seven admin entries:

```typescript
{ key: 'admin-crm', href: '/admin/crm', label: 'Resonance CRM', section: 'Admin', defaultAccess: 'janitor', staffDomain: 'marketing', surface: 'platformManage' },
```

The gate (`defaultAccess: 'janitor'` + `staffDomain: 'marketing'`) matches the cockpit's existing `janitor`-only sensitivity while letting marketing staff reach the records under it. This is a one-line change; the left rail telescopes admin sections, so only operators who already pass the gate will see it.

**One caveat (DB-backed menus).** If the `left_rail` surface has been seeded into `menu_config`, the rail reads from the DB, not the code default. In that case, after adding the line, reseed the `left_rail` surface from defaults via Menu Manager (`/admin/menu`), or clear the seeded menu to fall back to code. No seed = the code change takes effect immediately.

## The two Members areas (and the contacts sprawl)

Every members / people / contacts surface, disambiguated:

| Surface (current nav label) | Route | What it is for | Data source | Gate |
|-----------------------------|-------|----------------|-------------|------|
| **Members** (Community) | `/admin/members?view=members\|subscribers\|beta` | Platform census: all non-system profiles + subscribers + beta waitlist | `profiles` (+ subscriber/beta lists) | `janitor` OR `staff:members` |
| **Members** (Resonance CRM) | `/admin/crm/members` | Health drill-down from the cockpit, filtered by tier or lifecycle stage | `member_traits` (nightly scores) → `contact_interactions` | `janitor` only |
| **Contacts** / "Pipeline" link | `/admin/crm/contacts` | Steward's scoped roster (host=circles, guide=hub, mentor=nexus, admin=all); launch point for message/profile/deal | `profiles` scoped by `community_role` | `host+` (scoped) |
| **Contacts** (unified CRM) | `/admin/marketing/contacts` | Unified record for leads, customers, members; email is the join key | `contacts` (+ `profiles`, `network_contacts`, `deals`) | `staff:marketing` |
| **My Contacts** (member-facing) | `/network/contacts` (`/connections` redirects here) | A member's own personal connections list | `network_contacts` | `member+` |
| **Connections** (platform config) | `/admin/connections` | Operator switches for discovery/maps/economics | config flags | `admin` only |
| Deals / Pipeline (no nav link) | `/admin/crm/deals/*` | The actual deal board: create, view, edit deals | `crm_deals` → `contacts` | `host+` OR `staff:marketing` |

### Rename + merge recommendation — each surface gets a distinct, obvious identity

| Surface | Action | New identity |
|---------|:------:|--------------|
| `/admin/members` | 🔁 RENAME | **Member Roster** (the platform census) |
| `/admin/crm/members` | 🔁 RENAME | **Member Intelligence** (the health/score drill-down) |
| `/admin/crm/contacts` | 🔁 RENAME | **Contacts** (the steward's scoped roster — drop the misleading "Pipeline" label) |
| `/admin/marketing/contacts` | 🔀 MERGE | Make this **the** Contacts surface under the unified CRM domain; remove the duplicate listing under Growth |
| `/admin/crm/deals/*` | ✨ NEW nav link | Add **Deals (Pipeline)** as its own item (today only "New deal" is reachable) |
| `/network/contacts` | ✅ KEEP | **My Contacts** (already distinct, member-facing) |
| `/admin/connections` | 🔁 RENAME | **Connection Settings** (config, not a people list) |
| `/connections` | ➡️ MOVE/remove from nav | It is a deprecated redirect; drop the lingering nav reference |

**On the two Contacts that remain:** they serve different stakeholders and different data clearances by design (scoped community roster vs unified marketing CRM). Keeping both is correct; the fix is naming and a single home. The scoped one stays **Contacts** in the CRM records group; the unified one is reached from the same CRM domain but clearly labeled as the **all-leads** record. The `/admin/crm/contacts` label "Pipeline" is wrong (it is a roster, not the deal board) and is the source of half the confusion, so it loses that label and the real deal board (`/admin/crm/deals`) gets the **Pipeline** identity.

## Proposed admin IA

Six top-level admin domains. The CRM domain is unified: standard-CRM grouping and Resonance AI grouping live side by side under one roof. Every domain is reachable from the main left menu (it is a nav-area).

```
ADMIN (left rail, section "Admin")
│
├── Dashboard                /admin                         gate: admin                ✅ KEEP
│
├── Community                /admin/community               gate: host + staff:community ✅ KEEP
│   ├── Structure: Circles /admin/circles, Hubs /admin/hubs, Nexuses /admin/nexuses, Channels /admin/channels
│   ├── People & access:
│   │     Member Roster      /admin/members                 gate: janitor OR staff:members  🔁 RENAME (was "Members")
│   │     Roles              /admin/roles                   gate: janitor              ✅ KEEP
│   │     Personas           /admin/personas                gate: janitor + staff:profiles  ✅ KEEP
│   │     Connection Settings /admin/connections            gate: admin                🔁 RENAME (was "Connections")
│   └── Activity / Trust: Events, Dispatches, Moderation, Support  ✅ KEEP
│
├── Programs                 /admin/programs                gate: host + staff:community  ✅ KEEP
│   └── Content, Gamification, Store, Crew Tasks, Seasons/Journeys/Practices…  ✅ KEEP
│
├── Growth                   /admin/growth                  gate: host OR staff:marketing  ✅ KEEP (minus CRM tab)
│   ├── Acquisition: Entry Points, QR Studio, Referrals, Onboarding, Walkthroughs  ✅ KEEP
│   ├── Marketing: Funnels, Automations, Nurture, Beta, Analytics, Market Read, Agent  ✅ KEEP
│   └── (CRM tab)            /admin/growth?tab=crm          🔀 MERGE → removed; lives in CRM domain below
│
├── CRM  (Resonance CRM)     /admin/crm                     gate: janitor + staff:marketing  ✨ NEW nav-area (the fix) + 🔀 MERGE
│   │
│   ├── ── Resonance AI ──────────────────────────────────────────────────────────────
│   │     Cockpit            /admin/crm                     gate: janitor              ✅ KEEP
│   │     Today              /admin/crm/today               gate: janitor              ✅ KEEP
│   │     Member Intelligence /admin/crm/members            gate: janitor              🔁 RENAME (was "Members")
│   │     Playbooks          /admin/crm/playbooks           gate: janitor              ✨ NEW (saved Vera actions/automations)
│   │     Resonance Graph    /admin/crm/graph               gate: janitor + staff:insights  ✨ NEW (relationship/health graph)
│   │
│   └── ── Standard CRM ──────────────────────────────────────────────────────────────
│         Contacts           /admin/crm/contacts            gate: host+ (scoped)       🔁 RENAME (was "Pipeline" label)
│         Deals (Pipeline)   /admin/crm/deals               gate: host+ OR staff:marketing  ✨ NEW nav link (board was orphaned)
│         All Contacts (CRM) /admin/marketing/contacts      gate: staff:marketing      🔀 MERGE (single home here; remove dup)
│         Segments           /admin/segments                gate: janitor + staff:insights  ➡️ MOVE (group under CRM)
│         Campaigns          /admin/marketing/campaigns     gate: host + staff:marketing  ➡️ MOVE (surface in CRM, also in Growth)
│
└── Operations              /admin/operations              gate: janitor + staff:platform  ✅ KEEP
    └── Menu, Pages, Payments, Pricing, Theme Studio, Spaces, Page Layout, Demo, Audit  ✅ KEEP
        (Vera AI workspace /admin/vera-ai stays under Operations/AI as platform config)  ✅ KEEP
```

**Notes on the unified CRM domain.** The two groupings ("Resonance AI" and "Standard CRM") are sections *inside* one domain, mirroring the existing `section:` field in `nav.ts`/`sections.ts`. The Resonance AI group keeps the `janitor`-only gate that protects per-member predictions; the Standard CRM group keeps the `host+`/`staff:marketing` gates so stewards reach their own rosters and deals. **Campaigns** is intentionally cross-listed (it appears in both Growth › Marketing and CRM › Standard) because it is a shared verb; one route, two entry points, no duplicate page.

## The fix list

Prioritized. Do the one-line rail fix first; everything after is incremental.

| # | Action | Files / change | Effort |
|---|--------|----------------|:---:|
| 1 | ✨ **Surface Resonance CRM in the left rail** (the headline fix) | `lib/nav-areas.ts`: add `{ key: 'admin-crm', href: '/admin/crm', label: 'Resonance CRM', section: 'Admin', defaultAccess: 'janitor', staffDomain: 'marketing', surface: 'platformManage' }` after `admin-growth` | **S** |
| 2 | ⚠️ Reseed `left_rail` if DB-driven | Menu Manager `/admin/menu` → reseed `left_rail` from defaults (only if `menu_config` has a seeded `left_rail` surface) | **S** |
| 3 | 🔁 Rename the two Members | `sections.ts` + `nav.ts`: `/admin/members` label → **Member Roster**; `/admin/crm/members` label → **Member Intelligence** | **S** |
| 4 | 🔁 Fix the "Pipeline" mislabel | `sections.ts` + `nav.ts`: `/admin/crm/contacts` label → **Contacts** (it is a roster, not the deal board) | **S** |
| 5 | ✨ Give the deal board a nav link | `sections.ts` + `nav.ts`: add **Deals (Pipeline)** → `/admin/crm/deals` under CRM › Standard | **S** |
| 6 | 🔁 Rename platform Connections config | `sections.ts` + `nav.ts`: `/admin/connections` label → **Connection Settings** | **S** |
| 7 | 🔀 De-duplicate Contacts + remove Growth CRM tab | Remove the `Growth › CRM` workspace tab (`/admin/growth?tab=crm`) and the duplicate `/admin/marketing/contacts` listing under Growth; keep one **All Contacts (CRM)** entry under the CRM domain | **M** |
| 8 | ➡️ Regroup Segments + Campaigns under CRM | `sections.ts`: list `/admin/segments` and `/admin/marketing/campaigns` in the CRM › Standard section (Campaigns cross-listed, not moved) | **M** |
| 9 | ➡️ Drop the deprecated `/connections` nav reference | Remove the lingering `/connections` link from `ADMIN_NAV` (it is a redirect to `/network/contacts`) | **S** |
| 10 | ⚠️ Resolve orphan `/admin/ai` | Confirm whether it is superseded by `/admin/vera-ai?tab=ai`; either register it or remove the page | **S** |
| 11 | ✨ Build the two new Resonance surfaces | New routes `/admin/crm/playbooks` and `/admin/crm/graph` + their nav entries (net-new product work, ship after the IA cleanup lands) | **L** |
| 12 | ⚠️ Verify the marketing-contacts gate | `app/(main)/admin/marketing/contacts/page.tsx` has no visible `requireAdmin`; confirm it inherits `staff:marketing` and is not gating lower than intended | **M** |

After steps 1 to 9, the IA is consistent and every surface is reachable from the main menu with a distinct name. Steps 10 to 12 are cleanup and net-new product surfaces.
