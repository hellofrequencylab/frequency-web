# Platform Master Plan — one multi-tenant white-label engine

> **The single re-prioritized critical path** that unifies the Multi-Tenant White-Label spec
> (owner, 2026-06-29), the Entity Management Overhaul ([ADR-441](DECISIONS.md)), the Spaces
> architecture ([ADR-249](DECISIONS.md)/[SPACES.md](SPACES.md)), the Hook harvest, Foundation
> Hardening ([ADR-439/440](DECISIONS.md)), Growth OS ([GROWTH-OS-BUILD-PLAN.md](GROWTH-OS-BUILD-PLAN.md)),
> the Practice Library ([ADR-438](DECISIONS.md)), and the ~70-item [BUILD-LIST](BUILD-LIST.md) backlog
> into ONE sequenced program. Authority: running code + `supabase/migrations/` > this doc > Notion.
> Proposed decision record: ADR-448. Status legend: ✅ built · 🟡 partial · 📐 designed · 🆕 net-new.

---

## 1. The headline (read this first)

**The owner's white-label spec is not a new direction — it is the sharpening of a decision the repo
already made.** [ADR-249](DECISIONS.md) ("Spaces") already replaced the two-codebase Hook federation
with **one multi-tenant engine where every brand is a Space (a white-label tenant) in one database,
isolated by `space_id` + RLS.** The spec re-affirms that and adds three things that are genuinely
new: the **brand dial**, the **Brand Studio**, and an explicit **two-surface (Network + Builder)**
framing. So this program is **convergence on an existing spine**, not a rebuild.

**Verified current state (deep recon, 2026-06-29):**

| Spec layer | Reality in `frequency-web` | State |
|---|---|---|
| Engine core + tenancy (RLS by row) | `spaces` **is** the tenant; `space_id` + RLS on 11+ tables; `resolveSpaceForHost` domain→Space; request-scoped `active-space` | ✅ ~80% |
| Brand / theme layer | per-Space `brand_name/logo/accent` + 4-axis theme (skin/occasion/generation) + DAWN tokens | ✅ (no **brand dial** yet 🆕) |
| Feature flags / entitlements | `spaces.entitlements` + `feature_roles` jsonb (schema-free, default-deny) + `SPACE_FUNCTIONS` registry | ✅ |
| Identity & RBAC | one `profiles` identity; many `space_members` + `stewardships` edges; `resolveCapabilities(viewer, scope)` | ✅ (5 axes, maps to spec's 4) |
| Payment | entity-partition ledger (`financial_transactions`, foundation/labs/partner) + **per-profile** Connect + destination charges | 🟡 (per-**Space** Connect 🆕) |
| Modules | Store ✅, CRM ✅, Marketing ✅, Projects 🟡, **Brand Studio** 🆕, **DAM** 🆕 | mixed |
| Management console | Entity Management Overhaul ([ADR-441](DECISIONS.md)) = the L2 console; Spaces bespoke 7-tab to harmonize | 📐 |
| Two-surface (Network + Builder) + brand dial | Spaces exist; no sellable "Builder" brand / dial yet | 🆕 |
| Self-serve onboarding (clone-on-signup) | — | 🆕 |

---

## 2. Hook — harvest verdict

**What Hook is:** a separate, *working* Practitioner/coach OS — its own Supabase project
(`qakbtenvporcfkznivdh`, **53 tables, all RLS-on, 124 functions**, `community_id`-scoped). It has
modules Frequency lacks well: **structured e-learning** (`courses · lessons · lesson_completions ·
course_enrollments · course_reflections`), an **AI companion/coach layer** (`companion_config ·
companion_conversations · companion_messages · companion_program_notes · coach_voice · coach_drafts ·
coach_files`), **structured CRM pipelines** (`deals · pipelines · pipeline_stages · deal_stages`),
plus its own gamification/memberships/`connect_accounts`/`site_pages`.

**The Hook *federation* (two-codebase contracts, ADR-059/158) is docs-only — zero Hook code in this
repo — and is already superseded by ADR-249.** So Hook is now "one Space type (coaching)," not a
separate system.

**Verdict — harvest the design, rebuild on the Frequency spine. Do not graft the codebase.**
- Hook is `community_id`-scoped; Frequency is `space_id`-scoped with a richer spine (roles,
  gamification, theming, RLS convergence, the page-framework kit). Bolting Hook's separate DB/app in
  would **recreate the two-codebase problem ADR-249 exists to kill.** "Seamless" means *one engine*.
- **Highest-value harvest (rebuild as Space modules on `space_id` + RLS):** (1) the **e-learning
  model** (courses/lessons/enrollments/completions) — Frequency has Journeys/Practices but no
  course/lesson/enrollment structure; (2) the **AI companion/coach** layer (per-member companion +
  coach voice/drafts/files) — Frequency has Vera but not this shape; (3) **structured CRM pipelines**
  (deepens the existing CRM). Their schemas are the blueprint; the logic ports cleanly once re-tagged
  `community_id → space_id`.
- **Code-access note:** my GitHub scope is `frequency-web` only, so I can read Hook's **database**
  (done — the design is harvested) but **not its TypeScript/React app code**. To accelerate the
  rebuild by reading Hook's actual code, **add the Hook repo to my scope or share the files** —
  otherwise I rebuild from the schema + product behavior, which is the seamless-by-default path anyway.

---

## 3. The re-prioritized critical path (T0 → T6)

Every existing track is a slice of this. **T0 is serial and gates everything** (you cannot safely
parallelize a multi-tenant re-architecture before the isolation boundary is hard). Within each later
track, fan out.

| Track | Delivers | Absorbs (existing tracks) | New? |
|---|---|---|---|
| **T0 — Tenancy & integrity foundation** | RLS convergence (the ~115 admin-client bypasses → session/RPC + policy tests), `space_id` coverage completion, data integrity on spaces/members/roles. The hard isolation boundary. | **Foundation-Hardening G0** (the ADR-441 gate) | — |
| **T1 — Tenant model + brand + console** | Bless Spaces as the tenant; add **custom-domain verification + TLS**; the **brand dial** (announce/recede config); **Entity Management Pass 1** (the shared `/{entity}/[id]/manage` console, harmonize the Spaces 7-tab, RBAC→4-role view). | spec P1 · **Entity-Mgmt Pass 1** (ADR-441) | brand dial, domain verify |
| **T2 — Payment per tenant** | **Per-Space Stripe Connect** account + routing by `space_id`/`entity` + platform fee + `entity_type` (nonprofit/for-profit); flip the dormant billing live-path. | spec P2 · money-foundation tail (ADR-029/032/038) | per-Space Connect |
| **T3 — Two surfaces + brand dial** | The **Network** surface (exists) + the **Builder** surface (run-your-own-space, a co-branded concession) + the brand-dial mode-shift + one login. | spec P3 | Builder brand framing |
| **T4 — Brand Studio** | Survey → **AI brief** (Anthropic) → living versioned brand system → brand-kit export. | spec P4 | all 🆕 |
| **T5 — Module convergence** | **Harvest Hook** (e-learning + AI companion/coach + pipelines) onto the spine; **DAM** (🆕); **Entity-Mgmt Pass 2** (fill every entity's spine modules); **Growth OS G3** operator/creator suites; **Practice Library Phase 4** + the BUILD-LIST backlog as flagged module depth. | spec P5 · Entity-Mgmt Pass 2 · Growth OS G3 · Hook harvest · Practice P4 · backlog | DAM, Hook modules |
| **T6 — Self-serve onboarding (launch)** | Clone-on-signup a new branded tenant end-to-end; **Entity-Mgmt Pass 3** polish + consistency sweep + tests. | spec P6 · Entity-Mgmt Pass 3 | clone-on-signup |

**Cross-cutting / continuous:** the one design-system kit (✅), CI + test/consent gates, docs
protocol, and the launch-blocking **owner config** (Stripe live keys, Google OAuth verification,
env/VAPID/Resend) — these unblock the *Network* launch independent of T-tracks.

---

## 4. Sequencing, gates, and how we parallelize

```
 T0 tenancy/RLS (SERIAL, gates all)
   └─▶ T1 tenant+brand+console ─┬─▶ T2 payment/Connect ─┐
                                └─▶ T3 two-surface+dial ─┼─▶ T4 Brand Studio ─▶ T5 module convergence ─▶ T6 onboarding/launch
                                                         (T2/T3 parallel once T1 lands)
```

- **Inside each track, fan out** (the proven loop: recon → layered build → verify → adversarial
  review → ship) across disjoint module files. The serial constraint is the *foundation*, not the work.
- **Money stays dormant** behind the billing live-flag through T2–T5; go-live gated on legal entities.
- **The Practice Library** (Phases 1–2 live, 3 committed, 4 queued) and the BUILD-LIST backlog ride
  T5 as Network-surface engine depth — no need to pause them; they harden the engine T-tracks reuse.

---

## 5. Open decisions (these gate T0/T1/T2 — owner call)

1. **Hook harvest mode** — *rebuild the valuable modules (e-learning, AI companion/coach, pipelines)
   on the Frequency spine, harvesting Hook's schema as the blueprint* **(recommended)** vs. grant repo
   access to port Hook's app code directly. Either way: one engine, `space_id`-scoped.
2. **Tenant-table formalization** — keep Spaces-as-tenant with brand/domain/flags as columns+jsonb
   **(recommended; recon confirms it's idiomatic and complete)** vs. extract explicit
   `tenants/domains/brands/feature_flags` tables to match the spec's table list literally.
3. **Per-Space Connect ownership** — one connected account per Space **(spec)**; confirm the
   nonprofit/for-profit `entity_type` binding lives on the Space (vs. the persona stub that exists today).
4. **Builder as a sellable brand** — is "Builder" a distinct co-branded partner brand (its own
   marketing + Connect account) or a mode of the Frequency Studio? (Shapes T3 + the brand dial.)

---

## 6. Immediate next actions

1. **T0 kickoff** — Foundation Hardening G0: a recon of the RLS/admin-client bypass surface + a
   sequenced convergence plan (it's the gate; we do it carefully and first).
2. **Decisions 1–2** above unblock T0/T1 scope — recommend, then proceed.
3. The Practice Library Phase 3 ships its PR (in flight) and Phase 4 is queued as T5 depth.

*Created 2026-06-29 (Daniel, Vision Steward). This plan re-prioritizes; it does not delete the
per-track specs — ADR-249 (Spaces), ADR-441 (Entity Management), ADR-438 (Practice Library),
Foundation-Hardening, and Growth OS remain canonical for their detail. This is the order of operations.*
