# Onboarding — progressive, non-blocking, eventually AI-guided

Status: **design / not yet built.** Decision recorded in [DECISIONS.md ADR-047](DECISIONS.md).
This doc is the build spec for Phase 0 + Phase 1; Phase 2 (AI) is sketched and deferred
to the AI core (ADR-028/041).

## Why

Today onboarding is effectively a **blocking wizard**: profiles auto-create via a DB trigger
on signup, new users are routed through `app/onboarding/{page,form,actions}.tsx` to set
display name / handle / bio / avatar / region, the action stamps `meta.onboarding_completed`
and redirects to `/circles`, and several surfaces `redirect('/onboarding')` when there is no
profile row (`app/(main)/layout.tsx`, `lib/auth.ts`, messages, studio, etc.).

We want the opposite shape: **let newcomers explore immediately**, and deliver meaning
**progressively** — contextual tips that appear *as they navigate*, spaced by interaction
(never stacked, never a wizard), capturing profile info lazily at the relevant moment. The
end state is an **AI concierge** that learns about the person in conversation while explaining
how Frequency works, then personalizes their start.

## Principles

- **Non-blocking** — explore first; no gate, no forced wizard.
- **Progressive & paced** — one tip at a time, triggered by reaching a surface, with a
  cooldown / interaction gate so tips never stack ("let them click around before the next").
- **Lazy capture** — handle, name, avatar, region, interests collected at the contextual
  moment, all optional and resumable.
- **Idempotent & resumable** — per-user state survives sessions; a seen/dismissed tip never
  re-shows.
- **Accessible, mobile-first** — focus management, keyboard, `prefers-reduced-motion`.
- **AI-optional** — the deterministic tip registry is the always-on baseline and the
  fallback whenever the AI layer is off (kill switch) or over budget.

## Decisions (ADR-047)

- **Lazy / optional capture.** Land users in the app with their auto-created profile;
  require nothing up front. Generate a safe default handle + display name if empty.
- **Build Phase 1 (deterministic tour) first;** AI concierge is a separate follow-on built
  on the AI core.

## Phasing

### Phase 0 — Decouple (small)
- New users land in the app on their auto-created profile. Backfill a safe default
  `handle` + `display_name` when empty so no surface breaks on a half-empty profile.
- Keep `!profile → /onboarding` only as the "trigger hasn't run yet" fallback. Retire the
  wizard as the primary path (or keep `/onboarding` as an optional "finish your profile"
  surface reachable from a tip).

### Phase 1 — Progressive tour (this initiative)

**Data model — no migration.** Reuse the existing `profiles.meta` JSONB:
```jsonc
meta.tour = {
  version: 1,
  seen: ["feed_intro", ...],        // tips shown + acknowledged
  dismissed: ["practice_nudge"],    // tips explicitly dismissed
  completedSteps: ["handle_set", "joined_circle"], // captured milestones
  lastShownAt: "2026-06-01T20:00:00Z" // pacing cooldown anchor
}
```

**Tip registry** — declarative, `lib/onboarding/tips.ts`. Each tip:
`id`, `trigger` (surface route or app event), `anchor` (DOM target selector or `center`),
`title`, `body`, optional `cta` (label + href/action), `priority`, `prerequisite`
(other tip ids / profile conditions), `oncePerUser`.

**Pacing engine** — client `TourProvider`:
1. On route change / surface enter, compute the highest-priority **eligible** tip (trigger
   matches, prerequisites met, not in `seen`/`dismissed`).
2. **Gate:** suppress if `now - lastShownAt < COOLDOWN` (≈45–90s) or fewer than _N_
   interactions since the last tip. One Coachmark at a time, ever.
3. On acknowledge/dismiss/CTA, persist via server action and update `lastShownAt`.

**Lazy-capture moments (examples):**
- First feed visit → "This is home" + "Add a photo & name" CTA → existing profile update.
- First `/circles` visit → "Find your people" → join → marks `joined_circle`.
- After joining → "Adopt a weekly practice" (the WAM loop).
- **Feed welcome moment** (folds in the earlier idea): once a name is set, the community/
  system account posts a public "welcome [Name] 👋" so members can react/comment to greet
  them. One-shot, scope + opt-out TBD with product.

**Surfaces / files (planned):**
- `components/onboarding/tour-provider.tsx` (client; hydrates initial tour state from server),
  `components/onboarding/coachmark.tsx` (anchored popover; reuse existing portal/popover
  primitives; add `@floating-ui/react` only if positioning needs it).
- `app/onboarding/tour-actions.ts` — `getTourState()`, `recordTourEvent(tipId, kind)`.

**Analytics.** Emit `engagement_events` for tip shown / acknowledged / CTA-clicked so the
activation funnel is measurable (ties directly into the planned analytics dashboard).

**Success metrics.** First-session/first-week activation (handle set, circle joined,
practice adopted), WAM lift, tour completion & drop-off per step.

### Phase 2 — AI concierge (separate initiative; depends on the AI core)

A conversational surface (slide-in) where Claude greets the newcomer, explains Frequency,
and **learns** their interests / neighborhood / goals — then calls **tools** to set profile
fields, suggest or join circles, and adopt a practice. Built on the planned AI core
(`lib/ai/`: model router, prompt cache, usage ledger + caps + kill switch, governance
kernel — ADR-028/041), using the Claude API with tool-use + prompt caching. The Phase 1 tip
registry is its deterministic fallback. **No autonomous writes until gated by the
consent/verification harness (ADR-028).**

## Risks / open questions

- Tip-fatigue and pacing tuning (cooldown vs interaction-count).
- Accessibility of anchored popovers; SSR/hydration of DOM-anchored coachmarks.
- Mobile anchoring and small-viewport placement.
- Feed welcome moment: community-wide vs nexus scope, and an opt-out — confirm with product.
- Phase 2: per-conversation cost, latency, safety, and budget caps.
