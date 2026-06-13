# Baseline assessment & cleanup roadmap (2026-06-13)

A senior-level systems assessment of `frequency-web` across five dimensions, plus the
phased roadmap to reach a clean, hand-off-ready, best-practice baseline and scale into
the Frequency **Foundation** (nonprofit community) + **Labs** (for-profit member-management
SaaS) dual-entity future. Decision record: [ADR-246](DECISIONS.md).

Status legend: ✅ done · ⏳ in progress / partial · 🔴 gap / risk · 🅿️ deliberately parked.

## Verdict

Senior-grade **design**; the gap to "hand-off-ready + ready to scale" is **activation, a
money-partition seam, and a test net — not redesign**. The recurring theme across every
dimension: **flagship systems are fully specced and scaffolded but not load-bearing** (the
docs read ahead of the code). The product vision is therefore largely about *switching on*
what's already designed.

## Scorecard

| Dimension | Strength (keep / build on) | Real gap |
|---|---|---|
| **Front-end / theming** | "DAWN" token layer (`app/globals.css`) — a palette change is already a one-file edit. 5 templates (`components/templates/*`) + declarative `lib/layout/page-chrome.ts` map. | "Skin" = light/dark only (`.dark` class). No multi-skin axis, no layout variants, no server skin resolver. `components/layout/app-shell.tsx` is a 1,506-line monolith. The `WidgetSlot` composition engine (PAGE-FRAMEWORK §4) is specced, **not built** (rail hand-wired in `lib/layout/rail-panels.ts`). |
| **Role-based admin** | Clean capability resolver (`lib/core/capabilities.ts`) + request-cached server seam (`load-capabilities.ts`). Admin nav fully catalog-driven (`app/(main)/admin/sections.ts`). View-as-aware guards. | The `AdminModule` registry (`lib/admin/modules/registry.ts`, `modulesFor`) that should drive "modules-by-role per page" has **zero callers** — well-designed dead code. Inline admin is hand-authored `{canManage && …}` per page. No `@admin` server slot. |
| **Security & authz** | Honest documented threat model (`docs/ARCHITECTURE.md`), view-as-aware guards (`lib/admin/guard.ts`), fail-closed cron, verified webhooks, clean secrets, **>98% RLS coverage** (93 tables / 284 policies), advisor warnings largely already fixed (`20260612010000`, `20260615200000`). | Authz lives **in app code by convention** — the service-role admin client (`lib/supabase/admin.ts`) bypasses RLS in ~336 files — with **no test net** and ~5 different guard idioms. **No schema validation** (zero `zod`). |
| **Code health** | Excellent tooling: CI (`tsc`+`eslint`+`vitest`), Dependabot, `.claude/` hooks; only 8 TODOs, 3 `as any`, 0 `@ts-ignore`. Current deps. | **Test breadth**: 105 test files vs ~1,304 source; RLS/RPC/API/components essentially untested. The 113-file `as unknown as SupabaseClient` cast. 99 merged branches + 84 docs of clutter. Large files (`app-shell.tsx` 1,506; `lib/journey-plans.ts` 969; `lib/email.ts` 960). No `.nvmrc`; stale `START-HERE.md`. |
| **Data architecture** | Docs nail the dual-entity vision (`docs/PLATFORM-VISION.md`). The **entity-blind game/economy** (points ≠ dollars) and **3 identity axes** (`profile_personas`) are built and clean. Density read-model shipped. | The **entity-partitioned financial layer is missing** — no `entities` table, no `entity` tag on the one money table (`event_tickets`), no tenant concept. `profile_personas.entity_id` is an unbound stub; `membership_tier` is bare text. This is the one thing the vision itself (§9) flags as structurally new. |

## Phased roadmap

### Phase 0 — Urgent
- ✅ Remove committed member PII (`supabase/backups/posts_wipe_20260605.json`) + gitignore — PR #702.
- 🔴 **Owed (deliberate op):** scrub git history (`git filter-repo`) so the PII leaves past commits; review/rotate the exposed storage URLs.

### Phase 1 — Lock the hand-off baseline *(free, low-risk)*
- ✅ Protected `main`, PR→preview→merge flow, onboarding docs (#701), regenerated types (#700).
- ⏳ Require the **`ci`** check in the `main` ruleset (settings — owner action).
- ⏳ **Encode the authz contract as a CI rule** — flag any `'use server'` file using the admin client without a recognized guard. Highest-leverage net while there are no authz tests.
- ⏳ Re-run the advisor sweep + record the post-fix baseline; prune the 99 merged branches; add `.nvmrc`; refresh `START-HERE.md`.
- 🅿️ Activate `CODEOWNERS` + required review **when a second developer arrives**.

### Phase 2 — The entity partition ⭐ *(cheap now, compliance-critical, painful later)*
- `entities` table (`foundation`/`labs`) + FK the existing `profile_personas.entity_id` stub.
- Add `entity` to `event_tickets` (+ backfill); stand up an append-only `financial_transactions` ledger (`entity NOT NULL`, `revenue_type`).
- Tag `membership_tier` with `entity` + `revenue_type`; adopt the module-namespace convention as policy.
- **Why now:** one migration today; after money volume it becomes a nonprofit/for-profit **fund-commingling retrofit** — a compliance problem, not a refactor.

### Phase 3 — Hardening & quality *(incremental)*
- Adopt `zod` at the server-action boundary (start with money/role/economy actions).
- Consolidate the ~5 guard idioms into canonical helpers; add a typed admin client + an eslint rule banning the cast (retires the 113-file wart over time).
- Add an integration-test harness for RLS/RPC/authz — the scariest blind spot. Continue ADR-042 RLS convergence.

### Phase 4 — CMS / skins / role-templated front-to-back *(product vision)*
- Decompose `app-shell.tsx` → generalize the theme seam (`.dark` → `[data-skin]`) + a server-side skin resolver → real multi-skin; tokenize the "feel" axis (radius/density/motion).
- Ship the `WidgetSlot` composition engine; wire `modulesFor` into the admin console + an `@admin` server slot → admin templated by role front-to-back. Then layout variants (structural skins).

### Phase 5 — Build Frequency Labs *(after the decision below)*
- `labs.*` tenant schema (lab_spaces, locations, staff, members, services/classes, schedules, bookings, packages/memberships, entitlements, payments/POS, payroll) with tenant RLS.
- Foundation↔Labs linked by an **entitlement bridge** — money stays partitioned by `entity`; shared points are already entity-blind.

## ✅ Resolved — the home of "Labs" (ADR-249, [docs/SPACES.md](SPACES.md))
The docs defined Labs two ways: an **in-house module in the same database** (PLATFORM-VISION §4)
vs. **"Hook," a separate product/DB integrated by API contract** (`docs/HOOK-FEDERATION-ARCHITECTURE.md`).
**Settled:** the **Space** is the tenancy primitive — a white-label tenant of the *one* app/DB
(`space_id` + RLS, its own brand/skin/domain/entity + a `network_connected` switch). **Native
Space in one Postgres is the default** (so a community member who's also a gym member and a Hook
client is one `profiles` row); **federation (Hook, ADR-158) is the escape hatch** for an
already-separate or self-hosted product. Hook is one Space among many, not a separate category.

## Parked (with trigger)
Full environment isolation (Supabase Pro + branching, staging) and the one-time migration-history
baseline are deferred until a **second developer or budget** arrives — see
[`WORKFLOW.md` → Scaling to a team](WORKFLOW.md#scaling-to-a-team). They carry production risk best
done once, right before they're needed.
