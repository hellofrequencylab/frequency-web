# Beta induction — the founding-cohort onboarding

Status: **building.** Decision: [DECISIONS.md ADR-068](DECISIONS.md). Voice: [AI-VERA.md](AI-VERA.md)
(hot register, §2). Temporary by design — deleted at public launch, when the non-blocking
progressive tour ([ONBOARDING.md](ONBOARDING.md)/ADR-047) becomes the permanent model.

## What it is, in one line

A short, **stoked, one-time gate** that turns a beta signup into a *founder*: they take an oath,
tell us who/where/why they are, get a fast cinematic tour of the core, and land in the app already
activated — guided start-to-finish by **scripted Vera**.

## Why it breaks the non-blocking rule (on purpose)

| | Beta induction (this doc) | Launch onboarding (ADR-047) |
|---|---|---|
| Who | Founding cohort who raised their hand to **build** | Every public newcomer |
| Shape | Short guided sequence + **one gate** (the Oath) | Progressive, non-blocking coachmarks |
| Why a gate is OK | The friction *is* the filter — they opted in to build, not browse | Public users must explore freely |
| Vera | **Hot** register, scripted | Cool register, eventually live |
| Lifespan | ⏳ Throwaway — deleted at launch | ✅ Permanent |

The induction is the live path **only during beta**, behind one flag: `BETA_INDUCTION_ACTIVE` in
`lib/onboarding/beta-script.ts`. `/onboarding` redirects into `/onboarding/beta` while it's `true`.
At launch: flip the flag, delete `app/onboarding/beta/` + `components/onboarding/renders/`.

## The flow — 6 beats, < 90 seconds

| # | Beat | Vera register | Captures | Blocking? |
|---|---|---|---|---|
| 0 | **The Oath** — 3 commitment checkboxes | Hot | `meta.beta.oath` | ✅ the one gate |
| 1 | **Intro** — "you're a founder, not a user" | Hot | — | skippable |
| 2 | **Who you are** — name · handle · photo | Cool | `display_name`, `handle`, `avatar_url` | skippable* |
| 3 | **Where + why** — region · the intent question | Cool→warm | `nexus_region_id`, `meta.beta.intent` | skippable* |
| 4 | **The tour** — Feed → Circles → Events renders | Hot | — | skippable |
| 5 | **Enter** — review + "Enter Frequency" | Hot | writes all + `meta.onboarding_completed` | — |

\* Name + handle are required to enter (a profile can't function without them); bio, photo, region,
and intent are optional but asked for plainly. Everything persists only on the final **Enter**.

### The Oath (beat 0)

Three checkboxes, all required to unlock the button. Copy lives in `BETA_OATHS`
(`lib/onboarding/beta-script.ts`) so it's the single source of truth:

| Intent | Checkbox copy |
|---|---|
| This is unfinished | **"I know this is unfinished. Things will break."** |
| Report, don't bail | **"When it breaks, I'll tell you — not just leave."** |
| Here to build | **"I'm here to build this, not browse it."** |

Framing (Vera, hot): *"Before I let you in — this isn't a product yet, it's a bet, and you're early.
Check these like you mean them. If you don't, close the tab — no hard feelings."* Button: **"I'm in."**

Accepting stamps `profiles.meta.beta.oath = { accepted_at, version, oaths: [...ids] }`.

## Data — no migration

Everything rides the existing `profiles.meta` JSONB (same call as ADR-047's `meta.tour`):

```jsonc
meta = {
  onboarding_completed: true,        // set on Enter; returning users skip the induction
  beta: {
    version: 1,
    oath:   { accepted_at: "…", version: 1, oaths: ["unfinished","report","build"] },
    intent: "free-text: what they're hoping for",   // ← the CRM gold
    completed_at: "…"
  }
}
```

- The Enter action **merges** into existing `meta` (never blind-overwrites — unlike the legacy
  `completeOnboarding`, which is fine because it runs on a fresh `{}`).
- **CRM mirror is a follow-up:** `meta.beta.intent` is the seed for both the CRM `contacts.meta`
  timeline and (when it ships) `ai_member_context.facts.goals` / Vera's `suggest_circle`. Not wired
  in this build — documented so it isn't lost.

## Vera: scripted now, live later

- **Now:** every beat's copy is deterministic, in Vera's **hot register** (AI-VERA.md §2) — conviction
  pointed at something real, never confetti. Zero AI calls ⇒ no kernel/kill-switch dependency.
- **Later:** when live Vera lands (ADR-066 Phase D), she delivers these beats conversationally and
  this script becomes her deterministic fallback. The beat structure does not change.

## The renders (disposable by design)

The "vector renders" of each section are **inline SVG components**, not commissioned art:
`components/onboarding/renders/{feed,circles,events}-render.tsx`.

- DAWN tokens only (`fill="var(--brand)"`, `text-primary`, …) — theme + brand-color for free, no hex.
- Animated with the existing `slideUp` keyframe + CSS transitions; **respect `prefers-reduced-motion`**.
- **Only the core triad** (Feed/Circles/Events) — showing all 18 nav areas would violate "quick."
- Cheap to throw away: deleted in the same PR as the route when the design changes.

## Accessibility & UX rules (the "do everything" checklist)

✅ One gate, everything else skippable · ✅ < 90s, visible progress · ✅ once-per-user + resumable
(idempotent `meta` flag; returning users redirect to `/feed`) · ✅ keyboard + focus management on
each beat · ✅ `prefers-reduced-motion` honored by every render · ✅ mobile-first (the desktop brand
rail collapses) · ✅ ends on a real next step (lands in `/circles` to make the first join) · ✅ Vera's
voice, hot but earned.

## Success metrics

Induction completion rate + drop-off per beat, oath-accept rate, % who set a photo, % who answer the
intent question (CRM fill rate), and time-to-complete. Wire to `engagement_events` alongside the
ADR-047 funnel when the analytics surface lands.

## Files

| Path | Role |
|---|---|
| `app/onboarding/beta/page.tsx` | Server page — auth guard, fetch profile + regions |
| `app/onboarding/beta/induction.tsx` | Client flow — Oath gate + 6 beats |
| `app/onboarding/beta/actions.ts` | `acceptBetaOath`, `completeBetaInduction` |
| `lib/onboarding/beta-script.ts` | Vera's scripted copy, `BETA_OATHS`, `BETA_INDUCTION_ACTIVE` flag |
| `components/onboarding/renders/{feed,circles,events}-render.tsx` | Disposable section renders |
| `app/onboarding/page.tsx` | Redirects to `/onboarding/beta` while the flag is on |

## Teardown at launch (one PR)

1. Set `BETA_INDUCTION_ACTIVE = false` (or delete the flag + the redirect in `app/onboarding/page.tsx`).
2. Delete `app/onboarding/beta/` and `components/onboarding/renders/`.
3. Keep `meta.beta.*` data (it's harmless history); the launch onboarding ignores it.
