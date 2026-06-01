# Tier 7 — Product expansion (post-launch)

> Self-contained instructions for one or more web sessions. Big picture:
> [`../SESSION-PLAN.md`](../SESSION-PLAN.md). Read `AGENTS.md` and
> `docs/DOCS-PROTOCOL.md` before starting.

This tier is larger than the others. **Split each sub-item into its own session.**

## Prerequisites

**Tier 5 merged / beta live.** Sub-items A–C are independent of each other. Branch from
latest `main`.

---

## 7A — AI consent test harness

**Why:** AI-agent autonomy is gated on a consent test per **ADR-028**
(`docs/DECISIONS.md:346`) and `docs/AI-STRATEGY.md` — the agent must only act through
the spine and must respect each member's `shouldSend` preferences.

**Scope:**
- Create `lib/ai/` with `consent.test.ts` (+ mocks under `lib/ai/__mocks__/`).
- Mock `shouldSend(profileId, channel, category)` across all categories × channels and
  assert agent proposals respect every combination.
- Add a replay helper to simulate a dispatch decision against recorded preferences.

**Docs:** Update ADR-028 in `docs/DECISIONS.md`; reference from `docs/AI-STRATEGY.md`.

---

## 7B — Local Marketplace MVP

**Why:** Proves local exchange and deepens the mission (mutual aid, anti-consumerism).
No in-app payments.

**Scope:**
- Migration: `marketplace_listings` table (title, description, geolocation/circle,
  item_type offer/swap/seek, posted_by, status, created_at) under `supabase/migrations/`
  **with RLS policies** (members read own + nearby circles; anon reads public/city-level).
- Pages under `app/(main)/`: `/marketplace` browse + `/marketplace/[listingId]` detail;
  host posting flow; "contact seller" **reuses the existing 1:1 DM thread**.
- Queries in `lib/marketplace.ts`; components in `components/marketplace/`.
- Add RLS policy tests (per Tier 3's `supabase/tests/`).

**Docs:** ADR for the data model; help article in `content/help/` + `docs/CHANGELOG.md`
(member-facing); tick `docs/BACKLOG.md` / `docs/DEVELOPMENT-MAP.md`.

---

## 7C — Density / demand read-model (PostGIS)

**Why:** Informs where to seed the next third space and supports the funder/expansion
story.

**Scope:**
- PostGIS queries over `engagement_events` + `circles` to compute: members with 0
  circles nearby (unmet demand), circles at capacity in dense areas, high-practice/low-
  circle areas. Queries in `lib/analytics/density.ts`.
- Admin-only page (e.g. `app/(studio)/admin/density/page.tsx`) with a map visualization
  + CSV export. No new migrations expected (data exists; PostGIS already applied).

**Docs:** Note in `docs/DEVELOPMENT-MAP.md`; ADR if it introduces a new read-model
pattern. Operator how-to (reading the density map for expansion decisions) → Notion.

---

## Validation (every sub-item)

```bash
npx tsc --noEmit
npx eslint .
npm test
```

RLS tests must cover any new member-facing table.

## Definition of done (per sub-item)

- Feature works; tsc/eslint/test green; docs/ADR/help updated; draft PR opened.

## Kickoff prompts

- **7A:** Read `docs/sessions/tier-7-product-expansion.md` and complete **sub-item 7A
  (AI consent test harness)** end to end; validate and open a draft PR.
- **7B:** Read `docs/sessions/tier-7-product-expansion.md` and complete **sub-item 7B
  (Local Marketplace MVP)** end to end; validate and open a draft PR.
- **7C:** Read `docs/sessions/tier-7-product-expansion.md` and complete **sub-item 7C
  (Density read-model)** end to end; validate and open a draft PR.
</content>
