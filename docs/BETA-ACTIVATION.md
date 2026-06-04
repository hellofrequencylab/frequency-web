# Beta Activation — spec (draft for review)

Status: ⏳ **draft, pre-build.** Owner decision pending on the tasks engine (§4) and
build order. Supersedes nothing; extends `ONBOARDING.md` (ADR-047) and rides the
existing engagement spine, Quest economy, and Vera concierge.

## 1. The goal (lead with the answer)

Get a brand-new Beta member from "signed up" to **real connection + seeded content**
as fast as possible, by sequencing small wins — coached by Vera, one next step at a
time. The activation metric is the WAM North Star: **joined a circle + posted +
logged a practice** within week one.

Three surfaces, **one coach**:

| Surface | Job | Tier |
|---|---|---|
| **A. Complete Your Profile** | readiness: be findable + credible | member |
| **B. Founder's First Week** (Beta Launch Tasks) | activation: seed content + make connections | member |
| **C. Vera coach** | the thread: surface the *single next best action*, always linked | member |

Principles (non-negotiable):
- **One next step at a time.** No wall of tasks; the full list lives behind a view.
- **Rewards tied to real-world connection, never vanity engagement** (engine guardrail).
- **Non-blocking / skippable** (progressive-onboarding doctrine, ADR-047).
- **Celebrate every win** (the existing zap/achievement toast).
- **Beta framing:** the "Founder" identity, finite cohort, "help shape it."

---

## 2. Surface A — Complete Your Profile

A dismissible card on the feed, shown while the profile is incomplete.

- **Fields scored:** avatar · one-line bio · interests · city. (Name + handle already
  exist from sign-up.)
- **UI:** reuse the Duolingo-style progress ring from the streak tracker; each field is
  a row with a one-tap deep link to the exact editor.
- **Reward:** a one-time gem drop at 100% (small, e.g. 25💎). Completion fires
  `profile.completed` (already in the funnel).
- **Why it earns space:** discoverability + trust. Hidden once complete; never nags.

---

## 3. Surface B — "Founder's First Week" (Beta Launch Tasks)

A curated, gamified mission set that **seeds content + creates real connections**. One
task is highlighted at a time (by Vera, §C); the rest live in a "Founder tasks" view.

| # | Task | Drives | Reward | Completion signal |
|---|---|---|---|---|
| 1 | Write your first post | seed content | ⚡ | `post.created` (first) |
| 2 | React or comment on someone | engage | ⚡ | `comment.created` / `reaction.added` |
| 3 | Add your first friend | graph | ⚡ 💎 | `friend.added` |
| 4 | Invite a friend who joins | growth loop | 💎💎 | invite accepted |
| 5 | Join a second circle | breadth | ⚡ | `circle.joined` (2nd) |
| 6 | RSVP or create an event | real-world | ⚡ 💎 | `event.rsvp` / `event.created` |
| 7 | Log a practice 3 days | North-Star loop | 🔥 streak | `practice.verified` ×3 |

- **Set complete →** a **"Founding Founder" badge** (achievement) + a milestone gem drop.
- **Rewards** use the existing zap/gem economy and the achievement/toast system. Amounts
  TBD against the economy (keep them meaningful but not farmable — idempotent on first
  completion only).

---

## 4. Decision: which engine do the tasks ride on?  (decide together)

The wrinkle: the existing Quest task systems are **crew-tier**, but onboarding is
**member-tier** (before they're crew). Three options:

| Option | How | Pros | Cons |
|---|---|---|---|
| **Reuse Arcs** (`arc_chains`/`arc_progress`) | a "Founder's First Week" arc | built for ordered, multi-step journeys; has progress UI; fits the Quest narrative | arcs surface under The Quest (crew-tier); needs a member-accessible carve-out |
| **Reuse `crew_tasks`** | new "onboarding" category | reuses submit/mark-complete + rewards | same crew-tier framing; review flow is heavier than needed |
| **⭐ Event-derived (recommended)** | compute the checklist from the member's **activation/engagement events**; a thin "first-completion reward" layer + the badge | no new engine, no tier mismatch; reuses the funnel we already emit; member-tier-native; trivially dismissible | a couple of events need adding (`reaction.added`, invite-accepted); reward-on-first needs an idempotency key |

**Recommendation: event-derived.** The activation funnel already records most of these
milestones, so the "tasks" are a *view* over events the member naturally fires, plus a
reward-on-first-occurrence layer. It sidesteps the crew-tier mismatch entirely and keeps
the surface lightweight and skippable. Arcs stay for the *crew* progression they were
designed for.

→ **Open for your call.** (Recommended: event-derived.)

---

## 5. Surface C — Vera as the coach

Best practice is **not** a checklist dump — it's Vera surfacing the *single next best
action* in her voice, advancing as they finish. She appears as a small coach card on the
feed (and can be summoned via "Ask Vera").

**The "next best action" picker** (deterministic, dark-safe; the AI kernel can improvise
on top): walk the ordered task list, pick the first incomplete one the member is *ready*
for (e.g. don't push "join a 2nd circle" before the 1st), show Vera's line + the action.

**Copy (one line + a linked action each):**
- No circle yet → *"This place runs on circles. Let's find yours."* → **[Browse circles]**
- In a circle, no post → *"You're in. Now let your people meet you — say hi."* → **[Write a post]**
- Posted, no friends → *"Nice. Put a name to a face — add someone you've met."* → **[Find friends]**
- Quiet 3 days → *"Streaks beat sprints. One small thing today keeps it alive."* → **[Log a practice]**
- All done → *"You've found your feet, Founder. I'll step back — call me anytime."*

---

## 6. Doctrine — "Vera always links"

**Every time Vera names a feature, action, or page, it renders as a link or button to
that exact surface** — in the concierge, the coach tips, the welcome lightbox, and any
Vera-voiced copy. No dead-end mentions. To be codified in `AI-VERA.md` and enforced by
an audit of the current Vera surfaces.

---

## 7. Instrumentation

Reuse the dual-emit `track()` helper → `engagement_events` (+ the activation funnel on
`/admin/engagement`). Confirm/extend events: `post.created`, `comment.created`,
`reaction.added`, `friend.added`, `invite.accepted`, `circle.joined`, `event.rsvp`,
`event.created`, `practice.verified`. The Beta Tasks completion + badge fire their own
events for the funnel.

---

## 8. Suggested build order (once §4 is decided)

1. **Complete Your Profile** card (smallest, immediate visible win).
2. **Vera coach** card + the next-best-action picker + the "always links" enforcement.
3. **Founder's First Week** tasks (the chosen engine) + the badge + rewards.
4. Funnel: confirm the events fire; add the missing ones; surface completion on
   `/admin/engagement`.

---

## 9. Open questions
- Reward amounts (against the economy; keep meaningful, not farmable).
- Does "invite a friend who joins" need the invite/referral plumbing (Section I) first,
  or can it ride the existing invite link?
- Badge art / name ("Founding Founder"?).
