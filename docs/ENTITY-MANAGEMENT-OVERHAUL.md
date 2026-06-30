# Entity Management Overhaul — one console for every entity and role

> **A unified, design-framework-native management system for every entity (Circle · Hub ·
> Nexus · Event · Practice · Space) and every role.** Overhauls the current state where each
> entity type is managed differently and per-entity *owners* have no real management console.
> Locked by owner decision **2026-06-29**.
>
> **The thesis:** the hard parts are already built (the role model, the Spaces spine, the
> 3-layer embedded admin). The gap is **cohesion, not capability**. This plan makes one console
> pattern serve every entity and role, and gives the platform admin complete oversight above it.
>
> **Authority order:** running code + `supabase/migrations/` > this doc > Notion. **Decision
> record:** [ADR-441](DECISIONS.md).
>
> **Status legend:** ✅ built · 🟡 partial / extend · 📐 designed only · 🆕 net-new · 🔒 dormant
> (behind `billing_live`). **Task IDs** (`EM#-n`) are stable handles for issues/PRs.
>
> **Plugs into:** the design framework — [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md) (templates +
> page-chrome) and [EMBEDDED-ADMIN.md](EMBEDDED-ADMIN.md) (the 3-layer admin + 9-category spine +
> module registry). **Sequenced with:** [FOUNDATION-HARDENING-PLAN.md](FOUNDATION-HARDENING-PLAN.md)
> (gates this; G0 first) and [GROWTH-OS-BUILD-PLAN.md](GROWTH-OS-BUILD-PLAN.md) (its **G3 Operator
> & creator suites** depends on this track). **Reference:** [ROLES.md](ROLES.md),
> [ENTITY-SPACES-SYSTEM.md](ENTITY-SPACES-SYSTEM.md), [NAMING.md](NAMING.md),
> [CONTENT-VOICE.md](CONTENT-VOICE.md).

---

## 1. The diagnosis (what the deep-dive found)

| Layer | State | Finding |
|---|---|---|
| **Role model** — 5 independent axes (community ladder · `web_role` · `team_members` staff matrix · `profile_personas` · per-Space roles) + billing tier, resolved by `resolveCapabilities(viewer, scope)` | ✅ Excellent | Clean, additive, capability-driven. Not the problem. Two edges to finish: the `/lead` leader surface and persona verification. |
| **Spaces backend** — tenancy spine, 8 types, blueprints, `SPACE_FUNCTIONS` registry, RLS, entitlements | ✅ Solid | Deep features are v1 "display/join only" (money dormant — correct). Missing: seed content, per-tab editor, Lab/Partner depth. |
| **Spaces owner frontend** — ~95% of surfaces exist across 7 types | ✅ but bespoke | Works, but it is a **one-off 7-tab cockpit** that does not use the platform's embedded-admin pattern. |
| **Per-entity owner management** — circle host, hub guide, nexus mentor | ⚠️ ~40% | The real gap. Owners get only page "edit mode" + a light sidebar. **No Layer-2 management suite.** Hub/Nexus edit mode is not even wired. |
| **Platform admin oversight** | ⚠️ ~70% | Lists/brands/gates, but thin on lifecycle (suspend/archive/**transfer ownership**), cross-entity member views, bulk ops, data health. |
| **Consistency across entity types** | 🔴 ~50% | Spaces = bespoke 7-tab; circles = edit mode; hubs/nexuses = edit mode unwired; events = edit mode. No shared pattern. |

**Core diagnosis:** the mature 3-layer embedded admin (catalog spine → domain suites → per-page
console + module registry, ADR-153/133/137/138/149) was only ever applied to *platform operators*
and partially to *circles*. **Owners of entities don't get a consistent console, and no two entity
types are managed the same way.** Spaces solved this with a bespoke cockpit, deepening the
inconsistency. The overhaul is one **Entity Management framework** every role/entity shares.

---

## 2. The target architecture

```
                       ENTITY MANAGEMENT FRAMEWORK  (one pattern, all entities)
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  L1  Catalog spine     every manageable entity + surface declared once         │
  │      (app/(main)/admin/sections.ts + the entity registry)                      │
  │  L2  Owner console     /{entity}/[id]/manage — the role's cockpit for ITS       │
  │      (NEW for most)     entity, the 9-category spine, capability-gated          │
  │  L3  In-page console    the PageAdminDock: tune basics/layout/QR in context     │
  └──────────────────────────────────────────────────────────────────────────────┘
        applied identically to:  Circle · Hub · Nexus · Event · Practice · Space
                 above it:  PLATFORM ADMIN oversight (lifecycle · ownership · roles · cross-entity)
                 beside it:  /lead  (community leaders manage their downline)
```

Every role manages its entity through the same console; admin manages all of them through one
oversight layer; Spaces become a citizen of the framework, not a snowflake.

---

## 3. Design-framework integration (how it plugs in)

This overhaul is **composition over invention** — it uses the existing kit and the embedded-admin
primitives, never a parallel framework.

| Surface | Template (PAGE-FRAMEWORK) | Chrome (page-chrome.ts) | Notes |
|---|---|---|---|
| Entity **public profile** (circle/space/event/…) | **Detail** (context band + tabs) | `global` rail | Already the pattern for Spaces; unify the rest. |
| Entity **owner console** `/{entity}/[id]/manage` | **Dashboard** (metric-led workspace) | `none` (focused) | The new L2 cockpit; composes `StatCard`, `SectionHeader`, the admin kit. |
| Entity **compose/edit/settings** | **Focus** (centered, no rail) | `none` | Create wizards, single-setting edits. |
| Platform **admin oversight** | **Dashboard** + **Index** | `none` (admin) | Cross-entity lists, lifecycle, roles. |
| **In-page tuning** | the page itself + `PageAdminDock` | inherits | Inline edit handles + sidebar modules. |

**Embedded-admin primitives reused (EMBEDDED-ADMIN.md):**
- **The 9-category spine** every entity console is organized by: **Basics · Place & Time · People ·
  Layout · Engage · Reach · Comms · Safety · Insights · Danger.**
- **The `AdminModule` registry** (`lib/admin/modules/registry.ts`) — each console surface is a
  declared module with `scopes`, `requiredCapability`, `slot` (the spine category), `surface`
  (`inline` | `sidebar`), `order`. Adding a surface = a registry row, not a new layout.
- **The `AdminModuleCard`** atomic unit (header · description · controls · Save footer), semantic
  tokens only, `rounded-2xl`.
- **The catalog spine** (`app/(main)/admin/sections.ts`) for L1 declaration + role telescoping.

**Canon:** every label/string passes CONTENT-VOICE §10 (no em dashes, locked nouns); never
hand-roll a layout (PAGE-FRAMEWORK); rails registered in `lib/layout/page-chrome.ts`.

---

## 4. The entity × spine matrix (what each entity needs)

Which spine categories each entity manages, and the current state of its module. Today **only
Basics modules exist** in the registry for circle/hub/nexus/event/practice/channel; Spaces cover
most categories via **bespoke** surfaces (to be harmonized). `—` = not applicable to that entity.

| Spine category | Circle | Hub | Nexus | Event | Practice | Space |
|---|---|---|---|---|---|---|
| **Basics** (name, about, cover, status, type) | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 bespoke |
| **Place & Time** (location, tz, schedule) | 🔴 | — | — | 🔴 | — | 🟡 (availability) |
| **People** (members, roles, invites, capacity) | 🔴 | 🔴 | 🔴 | 🔴 | — | 🟡 bespoke |
| **Layout** (modules/order, tabs) | 🟡 | 🔴 | 🔴 | 🟡 | 🔴 | 🔴 (no per-tab editor) |
| **Engage** (rewards, challenges, offerings, tiers, tickets, donations, enroll) | 🔴 | 🔴 | — | 🔴 | 🔴 | 🟡 bespoke |
| **Reach** (QR, invite/share, campaigns) | 🟡 (QR) | 🔴 | 🔴 | 🟡 (QR) | 🔴 | 🟡 bespoke |
| **Comms** (broadcasts, announcements, email) | 🔴 | 🔴 | 🔴 | 🔴 | — | 🟡 bespoke |
| **Safety** (moderation, blocks, AI rules) | 🔴 | 🔴 | 🔴 | 🔴 | — | 🔴 |
| **Insights** (per-entity stats) | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🟡 (analytics) |
| **Danger** (archive, delete, transfer) | 🟡 | 🔴 | 🔴 | 🟡 | 🟡 | 🟡 (delete) |
| **Billing** (space-only) | — | — | — | — | — | 🟡 |

The full per-cell module list with capability gates is in **Appendix A**. The pattern: Pass 1 builds
the framework + Basics/People/Danger everywhere; Pass 2 fills the rest of the spine per entity;
Pass 3 polishes and unifies.

---

## 5. The role model (recap + the two edges to finish)

The role model is solid and stays as-is (five independent axes + `resolveCapabilities`; see
[ROLES.md](ROLES.md)). Two edges complete it for full self-management:

- **EM-ROLE-1 · The `/lead` surface** — community leaders (host/guide/mentor) manage their
  *downline* (a guide's hub circles, a mentor's nexus hubs) in a network-scoped console. Today
  `/admin/*` is staff-only (ADR-208) and leaders are redirected home; `/lead` is the missing home.
- **EM-ROLE-2 · Persona verification** — finish the `/admin/personas` queue (claimed → verified →
  active → suspended) and the per-persona Stripe Connect binding (currently minimal/stubbed). This
  is the "verified Practitioner/Business/Organization" path that gates money-adjacent capability.

Per-entity **member-role ladders** (so any entity can delegate, not just Spaces) are built in Pass 1
(EM1-5).

---

## 6. The platform admin oversight layer

Above the per-entity consoles, the admin gets one consistent oversight layer for **every** entity
type (not just Spaces):

- **Lifecycle** — a uniform `status` (active/suspended/archived) with admin actions across all
  entities (today only spaces have it cleanly).
- **Ownership transfer** — reassign owner/host/guide/mentor/space-owner with an audit entry.
- **Entitlement & feature override** — per-entity (extends the Spaces feature-roles grid pattern).
- **Cross-entity views** — "all members across spaces," "all circles hosted by X," data-health
  checks (orphaned circles, unassigned channels, ownerless entities).
- **Roles & personas** — the roles grid + persona verification + `team_members` staff assignment.
- **Bulk operations** — multi-select move/archive/status across circles/events/spaces.

These live in the existing **Community** and **Operations** suites (extended), declared in the
catalog spine.

---

## 7. The three passes

You asked for: overhaul → fill out the second-layer structure → polish and tie together. Each pass
is specified three layers deep (L1 catalog · L2 owner console · L3 in-page).

### Pass 1 — OVERHAUL: the unified Entity Management spine
*Goal: one model for managing any entity, by owner and by admin. The structural foundation.*

| ID | Task | Layers |
|---|---|---|
| **EM1-1** | **Entity registry** — each entity declares its manageable surfaces against the 9-category spine + capability gate per surface; one source of truth feeding L1/L2/L3. **✅ shipped** (`lib/admin/entities/registry.ts` — `surfacesFor(entity, viewerCaps)`, spine-ordered; circle Basics + Danger declared). | L1 |
| **EM1-2** | **Entity-scoped owner console** — the shared `/{entity}/[id]/manage` Dashboard-template suite, gated by `resolveCapabilities`, identical pattern for host/guide/mentor/owner. | L2 — **🟡 first slice shipped:** `/circles/[slug]/manage` (RSC, gated on `circle.editSettings`, DashboardTemplate + registry-driven sections, rail `none`). Remaining entities (hub/nexus/event/practice/space) + People role-ladder land as follow-on slices. |
| **EM1-3** | **Harmonize Spaces** onto the framework — wrap/retire the bespoke 7-tab so spaces use the same spine + module registry; no feature loss. | L2 + L3 |
| **EM1-4** | **Wire Hub/Nexus edit mode** into the PageAdminDock (currently unwired); bring them to circle/event parity. | L3 |
| **EM1-5** | **Per-entity member-role ladder** — give every entity a role ladder + assignment (today circles are binary host/non-host; spaces have 4 rungs); unify the model. | L2 (People) |
| **EM1-6** | **Platform oversight spine** — uniform lifecycle (active/suspended/archived) + ownership transfer + entitlement override for every entity type. | L1 + L2 |
| **EM1-7** | **The `/lead` surface** (EM-ROLE-1) — network-scoped leader console for guides/mentors. | L2 |

**Done when:** any entity type is managed by its owner through one consistent console, and the
platform admin can run lifecycle + ownership on all of them.

### Pass 2 — FILL OUT: complete every role, type, and module
*Goal: the second-layer structure filled in — every entity and role has its full toolset.*

| ID | Task | Layers |
|---|---|---|
| **EM2-1** | **Build the spine modules per entity** (Place&Time, Engage, Reach, Comms, Safety, Insights) — the bulk; one `AdminModule` per cell in Appendix A. | L2/L3 |
| **EM2-2** | **Per-entity member management** — roster table + invite + role assignment + bulk ops + per-entity moderation queue, as People/Safety modules. **🟡 Spaces slice shipped** (ADR-452): `/spaces/[slug]/settings/members` now has the full roster table (role assignment along the per-Space ladder, remove, suspend/reactivate, bulk multi-select ops) on the existing `space_members` + invite flow, capabilities re-checked in every server action (`lib/spaces/roster.ts`). Remaining: the per-entity moderation queue (Safety) + the cross-entity generalization to circle/hub/nexus/event (rides EM1-5). | L2 (People/Safety) |
| **EM2-3** | **Space completion (non-money)** — seed content on create (ENTITY-SPACES Epic 1.10), per-tab module editor, Lab/Partner deep features, advanced availability, multi-cohort coaching, event capacity/waitlist. | L2 |
| **EM2-4** | **Space money, built dormant** 🔒 — Stripe on memberships/donations/enrollment/tickets behind `billing_live`, entity-tagged; ties to hardening F1. | L2 (Engage/Billing) |
| **EM2-5** | **Persona verification completion** (EM-ROLE-2) — `/admin/personas` queue + per-persona Stripe Connect binding. | L2 (admin) |
| **EM2-6** | **Platform admin fill-out** — cross-entity member views, bulk ops, data-health dashboards, per-type role templates, audit. | L1 + L2 |

**Done when:** every entity type and role has a complete management toolset, and admin has full
cross-entity control.

### Pass 3 — POLISH & TIE TOGETHER: cohesion
*Goal: make it one coherent, tested system.*

| ID | Task | Layers |
|---|---|---|
| **EM3-1** | **Drill-down console** — the iOS-Settings-style category→drill→back+search in the PageAdminDock (specced in EMBEDDED-ADMIN §2, never coded). | L3 |
| **EM3-2** | **`@admin` server slot** — RSC parallel route so console modules server-compose instead of client-fetch (perf + consistency). | L3 |
| **EM3-3** | **Relationship management** — move a circle between hubs, channel assignment, parent/child navigation, lineage/ownership views. | L2 |
| **EM3-4** | **Consistency sweep** — every entity managed identically; naming/voice canon; kit + tokens; no bespoke layouts left. | all |
| **EM3-5** | **Capability transparency** — a "who can do what" view for owners and admin (reads the resolver). | L2 |
| **EM3-6** | **Quality** — accessibility, empty/loading/error states, and e2e tests on the management + role paths. | all |
| **EM3-7** | **Docs map** — the cohesive Entity Management reference tying it together; sync per DOCS-PROTOCOL. | — |

**Done when:** all six entity types are managed through one coherent, polished, tested framework,
owner and admin alike.

---

## 8. Dependencies & sequencing (where it plugs in)

```
 FOUNDATION-HARDENING G0 (RLS convergence, data integrity on spaces/members/roles) ── gates ──▶
   Entity Management:  Pass 1 (overhaul) ─▶ Pass 2 (fill out) ─▶ Pass 3 (polish)
                                  │
                                  └── feeds ──▶ GROWTH-OS  G3 Operator & creator suites
 Money in Pass 2 (EM2-4) is DORMANT behind billing_live; go-live gated on legal entities (F1).
```

- **Gated by hardening (G0):** Pass 1/2 touch RLS-heavy tables (`spaces`, `space_members`, the
  per-entity role model), so RLS convergence + data integrity land first or alongside.
- **Feeds Growth OS G3:** the operator/creator suites in the Growth OS plan assume this management
  backbone exists. This track is G3's prerequisite.
- **Money dormant:** all Space commerce (EM2-4) is built behind `billing_live`, consistent with
  ADR-439/440.
- **Notion:** maps to the launch board's operator/owner tasks (e.g. "Members to hosts"); reflect
  status there, git stays authority.

---

## 9. Open decisions (carried)

1. **Owner console route shape** — `/{entity}/[id]/manage` (recommended) vs. an expanded dock-only
   model. Decide at EM1-2.
2. **Spaces harmonization depth** — fully retire the 7-tab vs. keep it as a thin compatibility
   wrapper over the shared spine. Decide at EM1-3.
3. **Per-entity role vocabulary** — confirm the member-role ladder names per entity (NAMING.md must
   bless any member-facing terms). Decide at EM1-5.
4. **`/lead` vs `/admin` boundary** — exactly which downline actions live in `/lead` for
   guides/mentors. Decide at EM1-7.

---

## Appendix A — Entity × spine module catalog (build list for Pass 2 EM2-1)

Each row is one `AdminModule` to declare (`lib/admin/modules/registry.ts`) with its capability gate.
State per §4. `inline` = on-page edit handle; `sidebar` = dock card.

### Circle (`resolveCapabilities` scope `circle`; gate `circle.editSettings` unless noted)
- Basics ✅ · Place&Time (location/tz/meeting) 🔴 sidebar · People (roster/roles/invite/capacity,
  gate `circle.moderate`) 🔴 · Layout (modules/order) 🟡 inline · Engage (practice/challenge/rewards,
  gate `circle.assignTask`) 🔴 · Reach (QR/invite/share) 🟡 · Comms (broadcast, gate
  `circle.broadcast`) 🔴 · Safety (moderation queue/blocks) 🔴 · Insights (attendance/retention) 🔴 ·
  Danger (archive/transfer) 🟡.

### Hub (scope `hub`; gate `hub.manage`)
- Basics ✅ · People (circles in hub + guides) 🔴 · Layout 🔴 · Engage (hub challenges) 🔴 · Reach 🔴 ·
  Comms 🔴 · Insights (hub rollup) 🔴 · Danger 🔴.

### Nexus (scope `nexus`; gate `nexus.manage`)
- Basics ✅ · People (hubs + mentors) 🔴 · Layout 🔴 · Reach 🔴 · Comms 🔴 · Insights (nexus rollup) 🔴 ·
  Danger 🔴.

### Event (scope `event`; gate `event.editSettings`)
- Basics ✅ · Place&Time (when/where/recurrence) 🔴 · People (RSVP/+1/approval/waitlist) 🔴 · Layout
  🟡 · Engage (tickets/check-in) 🔴 · Reach (QR/invite/dispatch) 🟡 · Comms (event dispatch) 🔴 ·
  Safety 🔴 · Insights (attendance) 🔴 · Danger (cancel/archive) 🟡.

### Practice (scope `practice`; gate `practice.editSettings`)
- Basics ✅ · Layout 🔴 · Engage (weight class/rewards, auto-valued per ADR-438) 🔴 · Insights
  (adoption/logs) 🔴 · Danger 🟡.

### Space (scope per `getSpaceCapabilities`; per-Space role ladder)
- Basics 🟡→✅ · Place&Time (availability) 🟡 · People (members/team/roles/invites) 🟡 · Layout
  (per-tab module editor) 🔴 · Engage (memberships/donations/enroll/tickets/CRM) 🟡 · Reach (QR) 🟡 ·
  Comms (email/campaigns/segments/templates) 🟡 · Safety 🔴 · Insights (analytics) 🟡 · Billing 🟡 ·
  Danger (delete/suspend/archive/transfer) 🟡. *Pass 1 EM1-3 maps these onto the shared spine.*

---

*Owner: Daniel (Vision Steward). Created 2026-06-29. This is a named development track; it does not
replace ENTITY-SPACES-SYSTEM.md (canonical for the Spaces data model) or ROLES.md (canonical for the
role axes). Gated by the hardening plan; prerequisite for Growth OS G3.*
