# Splash Funnels — multi-style funnel platform + management page redesign

> Turn the single-shape "Splash Funnels" admin page into a multi-STYLE funnel
> platform driven by a `FUNNEL_STYLES` registry, add an explicit funnel `kind`
> (defaulting to the existing onboarding shape, zero breakage), wire per-funnel
> signup stats onto restyled tabs+stats cards now, and stage the two new styles
> (Feature, Demographic) as honest "planned" placeholders until built.

**Status:** ✅ Phase 0 shipped (ADR-617). ✅ Feature style live — the breathwork feature funnel ships (ADR-619). ⏳ Phase 1 analytics partial (entered + captured events live; bounce dashboard pending). Decision records: `docs/DECISIONS.md` ADR-617, ADR-619.
Living dev plan — update the phase table and open items as work lands.

---

## 1. Problem

The `/pages/sequences` "Splash Funnels" admin page is a long single-scroll list
of ~9 identical audience-onboarding funnel cards, plus role-promotion tours and a
how-it-works section. Today:

- Every funnel is ONE shape: `sequence_overrides.data` = `SequenceOverride` /
  `BetaSequence`, rendered by ONE component (`app/onboarding/beta/induction.tsx`).
- "niche vs general" is only INFERRED from whether `slide2Features` / `slide3Core`
  are filled. There is no funnel `kind` / `type` / `style` field.
- There are no per-funnel conversion stats.

We want to manage MULTIPLE funnel STYLES, each with its own
layout / design / editor / stats, plus per-funnel conversion numbers on the cards.

---

## 2. Core architecture — a funnel-STYLE registry

Introduce an explicit `kind` on each funnel and a `FUNNEL_STYLES` registry, mirroring
how this repo already models menus (`SPACE_MODULES` / ADR-553), page templates
(`@/components/templates`), and widgets as registries. Adding a 4th style = one
registry row, not a rewrite.

Each style row declares:

| Field | Purpose |
| --- | --- |
| `id` | Stable key (`onboarding` / `feature` / `demographic`) |
| `label` | Display name (tab + card) |
| `icon` | Registry-supplied icon |
| `blurb` | One-line "what this style is" |
| `status` | `'live'` \| `'planned'` (drives placeholder vs real UI) |
| `accent` | Semantic accent token (never hardcoded hex) |
| `renderer` | The visitor-facing component for this style |
| `editor` | Editor schema + seed for the create/edit flow |
| `stats` | Stats profile (which metrics this style reports) |

### The three styles

| Style | Status | What it is | Lift |
| --- | --- | --- | --- |
| **Onboarding** | ✅ live | The existing 5-beat beta induction (`app/onboarding/beta/induction.tsx`). All existing funnels default to this `kind`. Zero breakage. | None (already shipped) |
| **Feature** | ✅ live | Visitor plays a stripped-down single feature before signing up. First shipped: **Breathwork** (`app/onboarding/beta/feature-funnel.tsx`, ADR-619) — the real box-breath visualizer, a first-hold "get yours free" capture, and a Day 1 streak + Zaps reward beat. Meditation Timer / QR Studio / CRM previews slot in behind the same `feature` config. | Big (first one shipped) |
| **Demographic** | ⏳ planned | Niche teaser tuned to a persona. Spine: `lib/onboarding/personas.ts` (visitor / practitioner / partner / builder / investor); niche assets in `components/marketing/funnel/*`, `lib/marketing/funnel-config.ts`, `/for/<niche>` pages. Content = the DAWN "Teaser" infographics (see §7). | Medium |

DAWN teaser set for the Demographic style: The First Win, Focus Ritual, Never Miss
Twice, No Lead Left Behind, One-Timer to Regular, The Marketplace, Practice Loop.
These are external Claude artifacts, not yet in the repo (§7 open item).

---

## 3. Data model changes (minimal, additive)

| Change | Where | Notes |
| --- | --- | --- |
| Add `kind` to `SequenceOverride` + `BetaSequence`, default `'onboarding'` | `lib/onboarding/sequence-overrides.ts`, `lib/onboarding/beta-sequences.ts` | Lives in the `data` jsonb — **no migration needed**. Optionally mirror as a real column later for fast filtering (§8 open item). |
| New anonymous taxonomy event `onboarding.funnel_entered` | `lib/analytics/events.ts` | Fired on funnel load, keyed by `{ sequence slug, anon id }`. Anon id via a new `fq_anon` cookie. Makes entered / bounce computable. |
| Pass `seqSlug` into the two existing completion `track()` calls | `app/onboarding/beta/actions.ts` | Ties completion to a specific funnel slug. |
| Feature style (later): `featureKey` field + interactive feature-stage components | `lib/onboarding/*`, new components | Phase 3. |

`kind` defaults to `'onboarding'` on read, so every existing funnel is a valid
Onboarding funnel with no backfill.

---

## 4. Page redesign — management layout

**Recommendation:** tabs-by-style + stats-forward cards + a detail view, composed
from the repo's Index / Detail templates and the `StatCard` / `EntityCard` kit
(per `docs/PAGE-FRAMEWORK.md`). Never hand-roll a layout.

| Element | Behavior |
| --- | --- |
| **Tabs** | One tab per style, sourced from the registry so new styles auto-appear. |
| **Funnel 1** | The live Onboarding funnel is pinned at the top. |
| **Card lead** | Each card leads with its headline stat (entered → signup conversion), plus status, marketing tag + `Registered` flag. |
| **Quick actions** | Edit / Preview / Copy link / QR per card. |
| **Create** | Style-first: pick a style → land in that style's seeded editor. |
| **Secondary area** | Role-promotion tours + how-it-works move to a collapsed / secondary section. |
| **Planned tabs** | Feature + Demographic tabs show a "planned" placeholder state until built. |

---

## 5. Per-funnel stats — computable now vs needs instrumentation

| Metric | Status | How |
| --- | --- | --- |
| **Signed up** (per funnel) | ✅ available now | Count `member_tags` by marketing tag (`beta_*`), or `profiles.meta.beta.sequence` (exact slug); `assigned_at` for time series. |
| **What they did after** | ✅ available now | Join the cohort (`member_tags.profile_id` / `meta.beta.sequence`) to `engagement_events` / `practice_logs` / `posts` / RSVPs. |
| **Entered** (loaded funnel) | 🔴 needs instrumentation | No entry event on the onboarding route today. Unblocked by the `onboarding.funnel_entered` event (§3). |
| **Bounce** (entered − signed up) | ⏳ derived | Computable once `entered` exists. |

**Reusable pieces:**

- `lib/analytics/dashboard.ts` — add a `computeFunnel()` helper.
- `lib/traits/segments.ts` — live tag counts for the signup numbers.
- The existing `ACTIVATION_FUNNEL` in `lib/analytics/dashboard.ts` is the closest
  prior art (it is global, not per-sequence).

---

## 6. Phased build order

| Phase | Scope | Status |
| --- | --- | --- |
| **Phase 0** (this round) | Page shell + `FUNNEL_STYLES` registry (only Onboarding registered `live`; Feature + Demographic as `planned` placeholders) + the `kind` field defaulting to `onboarding` + wire signup stats (`member_tags` counts) onto the cards. Restyle to tabs + stats cards. **Nothing about the visitor-facing funnels changes.** | ⏳ |
| **Phase 1** | Analytics instrumentation (`onboarding.funnel_entered` + `onboarding.funnel_captured` events live; signup via `beta_<slug>` tag) → entered / captured / signed-up per funnel. Remaining: surface bounce (entered − signed-up) + a per-funnel detail view using `computeFunnel()`. | ⏳ partial |
| **Phase 2** | Demographic style renderer + editor (leverages persona / niche assets + DAWN teasers). | ⏳ |
| **Phase 3** | Feature style renderer ✅ shipped for breathwork (ADR-619). Remaining: an admin editor to author feature funnels (today they are code sequences) + more feature demos. | ⏳ partial |
| **Phase 4+** | Additional styles = new registry rows. | ⏳ |

---

## 7. Files touched / to touch

| Area | Path | Phase |
| --- | --- | --- |
| Page | `app/(main)/pages/sequences/page.tsx` | 0 |
| Page children | `app/(main)/pages/sequences/funnel-actions.tsx`, `app/(main)/pages/sequences/entry-point-share.tsx` | 0 |
| **New** registry | `lib/funnels/funnel-styles.ts` | 0 |
| Model | `lib/onboarding/sequence-overrides.ts`, `lib/onboarding/beta-sequences.ts` | 0 |
| Editor | `app/(main)/pages/splash/editor.tsx` | 0 / 2 / 3 |
| Analytics | `lib/analytics/events.ts`, `app/onboarding/beta/actions.ts`, `app/onboarding/beta/page.tsx` | 1 |
| Stats | `lib/traits/segments.ts` / a new per-funnel stats query, `lib/analytics/dashboard.ts` (`computeFunnel()`) | 0 / 1 |
| Demographic assets | `lib/onboarding/personas.ts`, `components/marketing/funnel/*`, `lib/marketing/funnel-config.ts`, `/for/<niche>` pages | 2 |
| Feature components | new interactive feature-stage components | 3 |

---

## 8. Open items

| Status | Item |
| --- | --- |
| ⚠️ | **DAWN teaser infographics** (The First Win, Focus Ritual, Never Miss Twice, No Lead Left Behind, One-Timer to Regular, The Marketplace, Practice Loop) are external Claude artifacts. Need the user to publish / share links or export them into `design_handoff/` before the Demographic / Feature renderers are built. |
| ⚠️ | **Confirm mirror-column vs jsonb-only for `kind`.** Phase 0 ships jsonb-only (no migration). Add a real column only if / when filtering by style at scale needs it. |
