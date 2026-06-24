# Admin Reorganization: phased build-out plan

> **Status: PROPOSED (June 2026).** The execution plan for the audit in
> [`docs/ADMIN-IA-PROPOSAL.md`](ADMIN-IA-PROPOSAL.md). The proposal is the *why*
> (root causes, the disambiguation, the target IA); this is the *how* (phased,
> file-level, CI-gated). Read the proposal first.
>
> **Punctuation:** no em dashes or en dashes in any operator-facing copy this plan
> specifies (labels, descriptions, empty states). See `docs/CONTENT-VOICE.md`.

**Legend:** ✅ done · ⏳ in progress · ⚠️ needs a decision · 🔴 blocked · S/M/L effort.

---

## The answer first

The admin area works, but it is *organized* by accident of history: three decoupled nav
systems, three things called "Contacts," two things called "Members," an orphaned deal
board, and a duplicate CRM home. Nothing is missing; everything is hard to find. This plan
**reorganizes every admin function into six clean domains, each reachable from the main
left rail, with no duplicate functions and one obvious name per surface.** It ships in four
phases so the IA stays green at every step: the headline fixes already landed (Phase 0);
Phase 1 finishes the renames and the deal-board link; Phase 2 collapses the duplicates;
Phase 3 builds the two net-new Resonance surfaces; Phase 4 verifies gates and orphans.

The target shape (full detail in the proposal §"Proposed admin IA"):

```
ADMIN  (six domains, every one a left-rail nav-area)
├── Dashboard      /admin                 the operator home
├── Community      /admin/community       spaces, people & access, activity, trust
├── Programs       /admin/programs        content, gamification, store, crew tasks
├── Growth         /admin/growth          acquisition + marketing (CRM tab removed)
├── CRM            /admin/crm             Resonance AI  +  Standard CRM, side by side
└── Operations     /admin/operations      platform config, payments, Vera workspace
```

---

## The three nav systems (every change touches the right ones)

A feature is only "in the admin" when it is registered in the nav systems that surface it.
These are intentionally decoupled; the proposal §"Why Resonance CRM is not in the main left
menu" has the full trace. The cheat sheet for every change below:

| Nav system | File | Drives | Edit when… |
|---|---|---|---|
| **Left rail (MAIN menu)** | `lib/nav-areas.ts` (`NAV_AREAS`) | The vertical sidebar's "Admin" section | a top-level domain is added / renamed / regated |
| **Admin sub-header mega-menu** | `lib/admin/nav.ts` (`ADMIN_NAV`) | The horizontal dropdown bar on `/admin/*` | a sub-page is added / moved / renamed |
| **Admin dashboard UX + search** | `app/(main)/admin/sections.ts` (`ADMIN_GROUPS`) | Domain switcher, breadcrumbs, dashboard cards, **and the admin search index** (`visibleLinks()`) | almost always (this one also feeds search) |

**Rule of thumb:** a top-level domain change touches all three; a sub-page change touches
`nav.ts` + `sections.ts`; a label rename touches `nav.ts` + `sections.ts` (and `nav-areas.ts`
only if it is a rail entry). Always update `sections.ts` so the admin search bar stays correct.

---

## Phase 0 — Headline fixes (✅ shipped, PR #1025)

Done already; recorded here so the plan is complete.

| Move | File(s) | Status |
|---|---|---|
| Resonance CRM in the left rail (`admin-crm` nav-area) | `lib/nav-areas.ts` | ✅ |
| Rename `/admin/members` → **Member Roster** | `sections.ts`, `nav.ts` | ✅ |
| Rename `/admin/crm/members` → **Member Intelligence** | `sections.ts`, `nav.ts` | ✅ |
| Admin IA audit doc | `docs/ADMIN-IA-PROPOSAL.md` | ✅ |

---

## Phase 1 — Finish the labels + surface the orphaned deal board (S, one PR)

Pure nav-config edits. No route or schema changes. Low risk, immediate clarity.

| # | Move | Action | File(s) | Effort |
|---|---|---|---|---|
| 1 | Fix the "Pipeline" mislabel | `/admin/crm/contacts` label → **Contacts** (it is the scoped roster, not the deal board) | `sections.ts`, `nav.ts` | S |
| 2 | Surface the deal board | Add **Deals (Pipeline)** → `/admin/crm/deals` under CRM › Standard (today only "New deal" is reachable) | `sections.ts`, `nav.ts` | S |
| 3 | Rename platform Connections | `/admin/connections` label → **Connection Settings** (it is config, not a people list) | `sections.ts`, `nav.ts` | S |
| 4 | Drop the deprecated `/connections` nav ref | Remove the lingering link (it is a redirect to `/network/contacts`) | `nav.ts` | S |

**Acceptance:** every CRM record surface has a distinct name; the deal board is reachable;
`/admin/crm/deals` resolves from nav; tsc + eslint + admin tests green; admin search returns
"Deals" and "Connection Settings."

---

## Phase 2 — Collapse the duplicates into one CRM home (M, one PR)

The structural cleanup: one CRM domain, two clearly-labeled groups (Resonance AI, Standard
CRM), and no function listed twice. This is where "combine areas with no duplicate functions"
actually happens.

| # | Move | Action | File(s) | Effort |
|---|---|---|---|---|
| 5 | Remove the duplicate CRM home | Delete the `Growth › CRM` workspace tab (`/admin/growth?tab=crm`); the CRM lives only under `/admin/crm` | `app/(main)/admin/growth/*`, `sections.ts`, `nav.ts` | M |
| 6 | One Contacts home | Keep two Contacts that serve *different* clearances (scoped roster vs unified marketing record) but list each once, under CRM: **Contacts** (`/admin/crm/contacts`, scoped) and **All Contacts** (`/admin/marketing/contacts`, unified). Remove the duplicate listing under Growth | `sections.ts`, `nav.ts` | M |
| 7 | Regroup Segments + Campaigns under CRM | List `/admin/segments` and `/admin/marketing/campaigns` in CRM › Standard. Campaigns is **cross-listed** (one route, two entry points: Growth › Marketing and CRM › Standard), not moved | `sections.ts`, `nav.ts` | M |

**Why two Contacts stay (not a duplicate):** `/admin/crm/contacts` is the steward's
role-scoped roster (host=circles, guide=hub, mentor=nexus); `/admin/marketing/contacts` is
the unified leads/customers/members record (email is the join key, gated `staff:marketing`).
Different data clearance by design. The fix is naming + a single home, not deletion. See
proposal §"On the two Contacts that remain."

**Acceptance:** the word "Contacts" appears in nav exactly twice, each clearly scoped; no
`?tab=crm` route; Campaigns reachable from both Growth and CRM but is one page; gates
unchanged (Resonance AI group stays `janitor`, Standard CRM stays `host+`/`staff:marketing`).

---

## Phase 3 — Build the two net-new Resonance surfaces (L, one PR each)

Net-new product work. Ships after the IA cleanup lands so the new items slot into a clean
domain. Both compose the page-framework templates (never hand-rolled) and read existing
Resonance Engine tables activated on prod (`playbooks`, `playbook_runs`, `resonance_edges`,
`resonance_embeddings`, `member_engagement_scores`).

### 3a. Playbooks — `/admin/crm/playbooks` (gate: janitor)

Saved Vera actions and automations: the registry of repeatable plays (winback, activation
nudge, leader-recruit) with run history and the autonomy slider (suggest_only default).

- **Template:** Index (a collection to browse) for the registry; Detail (context band +
  tabs) for one playbook (definition · runs · settings).
- **Data:** `playbooks` (registry) + `playbook_runs` (history). Read-only first; "run now"
  and toggle autonomy behind the circuit breaker.
- **Nav:** register in all three systems under CRM › Resonance AI.

### 3b. Resonance Graph — `/admin/crm/graph` (gate: janitor + staff:insights)

The consent-first relationship/health graph: who is connected to whom, health-scored,
double-opt-in only. Reads `resonance_edges` + `resonance_embeddings` (pgvector neighbors)
+ `member_engagement_scores`.

- **Template:** Dashboard (metric-led) with the graph as the lead panel; per-node drill to
  Member Intelligence.
- **Consent:** never render an edge without double-opt-in (`resonance_consent`); the empty
  state explains the consent gate, never fabricates edges.
- **Nav:** register in all three systems under CRM › Resonance AI.

**Acceptance per surface:** route gates server-side (`requireAdmin('janitor')`); composes a
kit template; registered in all three nav systems; empty states pass the voice check; no
hardcoded hex; tsc + eslint + tests green.

---

## Phase 4 — Verify gates + resolve orphans (M, one PR)

Cleanup and safety. Confirms the reorg did not loosen any gate and retires dead routes.

| # | Move | Action | File(s) | Effort |
|---|---|---|---|---|
| 8 | Resolve orphan `/admin/ai` | Confirm whether it is superseded by `/admin/vera-ai?tab=ai`; register it or remove the page | `app/(main)/admin/ai/*`, nav | S |
| 9 | Verify the marketing-contacts gate | `app/(main)/admin/marketing/contacts/page.tsx` has no visible `requireAdmin`; confirm it inherits `staff:marketing` and is not gating lower than intended | that page | M |
| 10 | Reseed `left_rail` if DB-driven | If `menu_config` seeded a `left_rail` surface, reseed from defaults via Menu Manager `/admin/menu` so the code changes take effect | `/admin/menu` (owner action) | S |
| 11 | Full gate audit | Walk every `/admin/*` route; confirm each `requireAdmin(...)` matches its nav `defaultAccess`/`staffDomain`; record any mismatch as an ADR | all admin pages | M |

**Acceptance:** no route gates lower than its nav advertises; no orphan routes without a nav
home (or they are deleted); the rail renders from code (or a reseed is scheduled); an ADR
records any gate correction.

---

## Sequencing, isolation, and CI

- **Order:** Phase 1 → 2 → 4 are nav-config and gating; Phase 3 is net-new and can run in
  parallel with 1/2 in its own worktree (different files), but its nav registration must
  rebase onto the Phase 1/2 nav edits to avoid clobbering the regrouping.
- **Conflict risk:** all of `nav-areas.ts`, `nav.ts`, `sections.ts` are shared, so the
  nav-editing phases ship **serially** (one PR merged before the next branches). Phase 3's
  page code is isolated; only its three nav lines rebase.
- **Every phase:** one draft PR, CI-gated (checks + analyze/CodeQL + autodoc + drift +
  Vercel), squash-merged when green. `npx tsc --noEmit`, `pnpm lint`, and the admin/core/
  layout test suite must pass before marking ready.
- **Docs protocol:** technical changes update this doc + `docs/DECISIONS.md` (ADR per
  decision); the operator-facing "how to use the reorganized admin" page goes to the Notion
  Training DB (link back here), per `docs/DOCS-PROTOCOL.md`.

## Definition of done

Every admin function lives in exactly one of six domains, each reachable from the main left
rail, each surface with a single obvious name, no duplicate functions, gates verified, and
the two new Resonance surfaces shipped. After Phases 1 to 2 the IA is clean; Phase 3 adds
capability; Phase 4 proves it is safe.
