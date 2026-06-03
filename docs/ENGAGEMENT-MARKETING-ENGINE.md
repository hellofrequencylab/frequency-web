# Engagement & Marketing Intelligence Engine

Status: **Phases A–C shipped (pipeline + dashboard + outcomes).** Decision: [ADR-070](DECISIONS.md).
Converges three existing threads onto one event ledger + one AI brain:
[ANALYTICS.md](ANALYTICS.md) (ADR-050, dashboard), [MARKETING-AI.md](MARKETING-AI.md) (the Market
Read), and [MEMBER-DATA-PLATFORM.md](MEMBER-DATA-PLATFORM.md) (ADR-069, traits/segments).

**The one idea:** this is a Studio *face* on what we already own — **not** a fourth parallel
system. Instrument → `engagement_events` → projections (dashboards, outcomes, AI reads).

---

## Architecture

```
        engagement_events  (the one ledger)
                 │
   ┌─────────────┼───────────────────────────────┐
 traits/segments   dashboards / funnels       AI "reads" (faces on lib/ai)
 (ADR-069 ✅)      (analytics, Phase B)       Market Read + Engagement Read → content
                 └──────── Studio (janitor) dashboard ────────┘
```

Governed by the AI kernel (caps, kill switch, consent) + two locked guardrails: **aggregate-only
privacy** for anything outbound, and **human-approves-anything-public**.

## Phases

| Phase | Deliverable | Status |
|---|---|---|
| **A · Instrumentation depth** | `track()` dual-emit helper + taxonomy module + page-view capture + `useTrack` for features | ✅ shipped |
| **B · Janitor dashboard** | activation funnel + **where-it-jams** drop-off + WAM/retention + feature adoption | ✅ shipped |
| **C · Program/circle/game outcomes** | completion + stall-point analytics per challenge/quest + circle health | ✅ shipped |
| **D · AI reads** | Engagement Read (`/admin/insights`) + Market Read — analyze strategy, name what's landing | ◑ Engagement Read shipped (deterministic; live narration slots in behind `summarize()`) |
| **E · AI content** | live generation → Action Queue → comms spine (human-approves-public) | ⏳ |

## Phase A — what shipped

| Path | Role |
|---|---|
| `lib/analytics/events.ts` | the **taxonomy** — every tracked event named + categorized; `clientEmittable` gate |
| `lib/analytics/track.ts` | server `track()` → `engagement_events` (validated, best-effort) + `sanitizeProps` |
| `app/api/track/route.ts` | first-party client sink — accepts client-emittable events only, member-tied, no spoofing |
| `components/analytics/track-provider.tsx` | `PageViewTracker` (auto nav capture) + `trackClient`/`useTrack` (GA4 mirror + first-party) |
| `lib/analytics/dashboard.ts` | dashboard read-models — funnel (pure, tested) + ledger aggregates via `engagement_*` RPCs |
| `app/(main)/admin/engagement/page.tsx` | the janitor dashboard — WAM/activation, funnel, activity by type, top pages + features |
| `lib/analytics/outcomes.ts` | program/game outcome read-models — completion/fill rates (pure, tested) + named challenge/quest/circle outcomes |
| `app/(main)/admin/outcomes/page.tsx` | janitor outcomes — challenge/quest completion + stall points + circle health, with friction flags |

**Dual-emit:** one `track()` call records first-party (the source of truth) and mirrors to GA4 —
the two can't drift. **No new cookies** (member-tied first-party; GA4 per ADR-048).

### Instrumenting a feature
```ts
const track = useTrack()
track('feature.used', { feature: 'support_launcher_open' })
```
Add new events to `lib/analytics/events.ts` first (the taxonomy is the contract). Broadening
feature coverage across pages is an incremental sweep — `nav.page_view` is universal from day one.

## Privacy posture (non-negotiable)

- First-party telemetry is internal product data tied to the member's own account — no extra
  consent surface beyond ADR-048/050.
- **Marketing never references an individual** — aggregate-only (MARKETING-AI guardrail).
- Member consent + erase arrive with [Member Data Platform](MEMBER-DATA-PLATFORM.md) Phase 5.
