# Onboarding & Vera — prioritized build list

> **Purpose.** The single, ranked, execute-from list for the onboarding push: get a real
> beta cohort *in the door, excited, and creating a profile + content* — coached by Vera,
> deeply integrated. Written after a full docs+code audit (2026-06-06). Companion specs:
> [`ONBOARDING.md`](ONBOARDING.md), [`AI-VERA.md`](AI-VERA.md), [`BETA-ACTIVATION.md`](BETA-ACTIVATION.md),
> [`BETA-INDUCTION.md`](BETA-INDUCTION.md). Sequencing in [`BACKLOG.md`](BACKLOG.md) §F/§P.

## The headline

**You are not building onboarding from scratch — you're finishing the last mile.** The
induction, the Vera concierge (deterministic **and** live Claude loop), the AI kernel,
help-RAG, member memory, the coachmark tour, and the spotlight tour are **all shipped and
wired**. `tsc` and `eslint` are clean. The gaps are *connective* (Vera isn't present
outside onboarding) and *proactive* (no day-2 nudges) — plus a handful of config flips to
actually turn a test cohort loose.

Two levers, in order: **(0) flip the switches that let real testers in today**, then
**(1) make Vera ever-present and the feed an activation engine.**

## Priority ladder (read this first)

| Rank | Item | Goal it serves | Size | Status |
|---|---|---|---|---|
| **0** | Pre-test enablement (config, not code) | Get testers in *today* | S | ⏳ |
| **1.1** | Persistent Vera launcher, app-wide | Deep Vera integration | M | ✅ shipped |
| **1.2** | Vera's "chores" — profile + first-post, matriarch full-stop | Create a profile + seed content | M | ✅ shipped |
| **1.3** | Vera coach "next best action" — folded into the chores surface | Excitement + direction | S | ✅ shipped |
| **1.4** | "Founder's First Week" tasks + badge | Create content | M | ✅ shipped |
| **1.5** | Live-loop suggestion chips | Guided depth | S | ⏳ |
| **2.1** | Welcome community post | Arrive *greeted* | S–M | 📋 |
| **2.2** | Finish `draft_intro` (no-op today) | Warm intros land | S–M | ⏳ |
| **2.3** | Memory batch summarization cron | Vera stays fresh | M | 📋 |
| **2.4** | Warm up seeded demo content (§S9) + demo box → action links (§S4) | First scroll feels alive | M | 📋 |
| **3.x** | Proactive Vera (encouragement/accountability, host copilot) | Day-2 retention | M–L | 🔴 gated |
| **5.1–5.2** | Rename Directory → **Network** + member-tier personal contacts + quick-add capture | Real-life contacts, kept | S–M | 📋 |
| **5.3–5.5** | Event-invite capture loop (QR → RSVP → triple-write) + gamification | The growth loop | M–L | 📋 |
| **6** | **Capture** — primary "log life" button (Photo/Note/Post + In-Person card/poster) | The community story + every member a node | L | 📋 |
| **4.x** | Cleanup + doc hygiene | Lean tree | S | ⏳ |

Legend: ✅ done · ⏳ partially built / in flight · 📋 specced, not built · 🔴 blocked.

---

## Section 0 — Pre-test enablement (do this first; mostly config)

The fastest path to "people in there and testing." None of this is a feature build.

| # | Action | Where | Why it gates testing |
|---|---|---|---|
| 0.1 | Set `ANTHROPIC_API_KEY` in prod | env | Live Vera loop is dark without it (falls back to deterministic — still works, but not the real test). |
| 0.2 | Flip `platform_flags.ai_enabled` **on** | `/admin/ai` toggle | Defaults **false** (fail-closed). Live Vera + help-RAG stay off until flipped. |
| 0.3 | Click **Build index** once in prod | `/admin/ai` | `help_chunks` corpus is empty until ingested; "Ask Vera" help deflects to human otherwise. |
| 0.4 | Run the 2 pending migrations | `supabase db push` | `lock_economy_columns` (critical) + `perf_indexes`. |
| 0.5 | Set prod env: `CRON_SECRET`, `UNSUBSCRIBE_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `EMAIL_FROM`, `RESEND_WEBHOOK_SECRET` | env | Cron, email, metadata, unsubscribe all reject/misfire without these. |
| 0.6 | Confirm `BETA_INDUCTION_ACTIVE = true` + verify the funnel fires on `/admin/engagement` | `lib/onboarding/beta-script.ts`, `/admin/engagement` | Induction is the live path; confirm `onboarding.induction_completed → vera_opened → circle.joined → practice.adopted → profile.completed` all land so the test is *measurable*. |

**Acceptance:** a fresh signup completes induction → lands on `/feed?welcome=vera` → Vera's
lightbox opens with live (not scripted) replies → the funnel shows the events.

---

## Section 1 — The activation + deep-Vera push (P0 build)

Ship as **one arc** (they share `getOnboardingStatus()` and an extracted `<VeraChat>`),
in small reviewable PRs. Best-practice guardrails in the last section.

### 1.1 — Persistent Vera launcher, app-wide ✅ **shipped** (ADR-086 / AI-VERA §4.0)
- **What shipped.** One floating Vera bubble on every `(main)` page (`components/vera/vera-launcher.tsx`,
  mounted in `app/(main)/layout.tsx`), opening a two-tab panel: **Chat** — the multi-turn
  companion (`components/vera/vera-chat.tsx`, runs the live Claude loop + propose-and-confirm,
  deterministic concierge fallback) — and **Help** — the folded-in tiers (instant article search →
  browse the help center → talk to a human). The old `SupportLauncher` was retired, so there's
  **one bubble, not two**. tsc + eslint + Vera tests green.
- **Second pass (tweaks, not blockers):**
  - **Dedup:** migrate `vera-lightbox.tsx` + `vera-concierge.tsx` onto the shared `<VeraChat>`
    (remove the duplicated turn/proposal/`proposalLabel` logic — 3 copies today).
  - **Warm opening:** seed the companion greeting with the member's name + memory (the lightbox
    already builds a personalized opening; the launcher uses a generic one).
  - **Sleep-mode recede** on the launcher panel (the lightbox has it; the launcher omits it).
  - **Suggestion chips in the live loop** (= item 1.5) so Chat keeps offering quick replies.
  - **Persist the transcript** across a full reload (it already survives in-app navigation via the
    persistent layout; a hard refresh resets it).
  - **Grounded help inline:** optionally fold the one-shot `/help/ask` RAG answer into the Help tab
    (today Help search is article-only and routes deeper questions to Chat).
  - **Proactive badge** on the bubble once Phase E (encouragement) lands.

### 1.2 — Vera's "chores" — the matriarch bait-and-switch ✅ **shipped** (BETA-ACTIVATION §2)
- **The concept (owner direction).** Vera is warm on the way in; then she hardens into a
  *playful stern matriarch* — "everything in its place." A **full-stop overlay** periodically
  blocks the screen with the Founder's unfinished **chores**: tidy your profile (photo · bio ·
  city) **and** seed content (first post). They signed the oath to *build*, so she holds them to
  it — in a fun way ("I've 'locked' your screen. Dramatic, I know — the ✕ still works").
- **What shipped.**
  - `lib/onboarding/profile-chores.ts` — `getProfileChores()` scores photo/bio/city/first-post
    (distinct from the activation funnel in `status.ts`).
  - `components/onboarding/chores-overlay.tsx` — the dismissible full-stop overlay + a persistent
    bottom-left **chores pill**; paced (≥1h, once/session) so it nudges, never nags; accessible
    (ESC/✕/backdrop, focus, reduced-motion).
  - `app/(main)/feed/chores-actions.ts` — `claimChoresReward()`, one-time gem drop at 100% via the
    long-dangling **`welcome_member`** gem action (also closes BACKLOG §C's "unobtainable" item);
    idempotent on `meta.chores.rewarded`.
  - Mounted in `app/(main)/layout.tsx`, **beta-gated** (`BETA_INDUCTION_ACTIVE`) so it retires to
    the non-blocking model at launch.
- **Second pass (tweaks):**
  - **Per-task micro-rewards** (today: one bonus at 100%).
  - **Add the "interests" chore** (separate join; needs a clean editor deep-link).
  - **Live matriarch register** — dial the stern voice through `vera_config` / the live loop
    (today the copy is scripted); let her deliver chores *in the Vera launcher chat* too.
  - **Escalating pace** (gentle → sterner) + configurable cooldown; emit a `chores.completed`
    event for the funnel.
  - **Coordinate with the activation guide** so the two onboarding surfaces never pop at once.
  - **Fold in Capture chores** once §6 lands (e.g. "capture your first moment").

### 1.3 — Vera coach "next best action" ✅ **shipped** — folded into Vera (BETA-ACTIVATION §5)
- **Decision (owner).** *Not* a separate feed card — that would compete with the inline
  `FeedOnboardingGuide`. Folded into the **same Vera surface** as the chores overlay (1.2):
  one Vera, three beats — chores → reward → **coach**.
- **What shipped.** Once chores are done + rewarded, `ChoresOverlay` flips to a **coach** beat:
  it surfaces the *single* next activation step from `getOnboardingStatus().current`
  (`lib/onboarding/status.ts` — already the source of truth, so it can't disagree with the
  feed guide). Warm voice (she's softened back up), one deep-linked CTA, paced like the chores
  nudge, and the bottom-left pill reads **"Next move."** Wired in `app/(main)/layout.tsx`.
- **Acceptance.** ✅ one action at a time · ✅ ready-gated (reads the funnel's first incomplete
  step) · ✅ always linked · ✅ retires when activation is complete (nothing left to mount).
- **Second pass:** AI-improvised copy on top of the deterministic picker (today the lines are
  the funnel's `headline`/`blurb`); let Vera deliver the same coach beat *in the launcher chat*.

### 1.4 — "Founder's First Week" tasks + badge ✅ **shipped** (BETA-ACTIVATION §3–4)
- **Decision (owner).** **Event-derived** engine — no new machinery.
- **What shipped.**
  - `lib/onboarding/founder-tasks.ts` — `getFounderTasks()` derives 6 tasks from the domain
    tables the engagement events write to (posts · post_reactions · friendships · 2nd
    membership · event_rsvps · 3-day practice streak) — same source-of-truth as `getUserStats`,
    so it can't disagree with the gamification engine.
  - `app/(main)/founder/founder-actions.ts` — `claimFounderRewards()`: **reward-on-first**
    reconciliation (5💎 per task the first time it's seen done, tracked in
    `meta.founder.rewarded`) + the **badge** on set-complete (25💎 bonus). Idempotent,
    flag-first — safe to call on every view.
  - `supabase/migrations/20260606170000_founders_first_week_badge.sql` — the
    **`founders-first-week`** manual achievement (gold/special), granted by the app (mirrors
    the existing `founding-member` manual pattern). ⚠️ **Apply on deploy** — until then the
    per-task gems still pay; only the badge waits.
  - `app/(main)/founder/page.tsx` — a `FocusTemplate` "Founder's First Week" view (progress +
    6 task rows + badge state); registered Focus in `lib/layout/page-chrome.ts`.
  - **Vera hands off**: once activation is complete, the coach beat points to `/founder`
    (the founder query runs only for that small activated cohort).
- **Acceptance.** ✅ tasks reflect real state · ✅ reward once each · ✅ badge on set-complete ·
  ✅ skippable (it's a page, nothing blocks).
- **Second pass:** emit the 1–2 missing ledger events (`reaction.added`, invite-accepted) so
  the tasks can read the event ledger directly · an `/admin/engagement` operator view ·
  a unit test once the supabase mock harness is in place · richer badge reward (zaps vs gems).

### 1.5 — Live-loop suggestion chips ⏳ (BACKLOG §P)
- **Goal.** Keep guided depth flowing instead of dead-ending a turn.
- **Gap.** The live Claude loop returns empty `suggestions[]`.
- **Build.** Have Vera surface 1–3 quick-reply chips per turn (the deterministic concierge
  already returns them; mirror in the live path).
- **Touch.** `lib/ai/vera/agent-claude.ts`, `lib/ai/vera/loop.ts`.

---

## Section 2 — Finish the started loops (P1)

| # | Item | Reuse / gap | Touch | Notes |
|---|---|---|---|---|
| 2.1 | **Welcome community post** 📋 | ONBOARDING beat #6 / AI-VERA §7 — system account posts "welcome [Name] 👋" once name is set | system-account post path, induction completion | Decide scope (community vs nexus) + opt-out *before* build. Turns signups into *greeted* members. |
| 2.2 | **Finish `draft_intro`** ⏳ | Tool is declared but `lib/ai/vera/execute.ts` returns ok with no effect | `lib/ai/vera/execute.ts`, intro-post path | Removes the awkward part of the cold-start; "scary part done." |
| 2.3 | **Memory batch summarization cron** 📋 | `ai_member_context` captures facts; summary never regenerated (Vera Phase C tail) | new cron on Batch API, `lib/ai/memory.ts` | Keeps memory fresh + makes the footprint-decay metric real. |
| 2.4 | **Warm demo content** 📋 | §S9 (sterile seed copy) + §S4 (demo box → action links with point values) | `lib/demo/*`, Seed Studio, the demo notice box | First scroll should feel like a real warm community, not a demo. Directly affects "excited." |
| 2.5 | **Confirm activation funnel** ⏳ | Events emit; verify end-to-end on `/admin/engagement` | — | Makes the *test* measurable (drop-off per step). |

---

## Section 3 — Proactive Vera (P2) — 🔴 gated

**Hard gate (ADR-028):** no autonomous Vera writes until the vitest **consent/`shouldSend`
harness** exists (BACKLOG §D). Build the harness first; then:

- **3.1 — Encouragement + goal-anchored accountability** (Phase E) — streak-risk /
  milestone / "you said you wanted X, the Tuesday circle meets at 6" nudges via the existing
  `notification_queue` + cron + Batch, frequency-capped through `shouldSend`. (M–L)
- **3.2 — Host/Guide copilot** (Phase F) — circle summaries, at-risk flags, draft
  announcements. The human-amplifier; the biggest anti-lean-in lever. (L)
- **3.3 — Nurture email sequence copy** — infra built (`lib/nurture/*`), persona-specific
  copy unwritten (ADR-125 follow-up). (S–M, ungated — copy only)

---

## Section 4 — Cleanup & doc hygiene (cheap; some ✅ done this pass)

- ✅ **Deleted 3 orphan modules** — `components/ui/can.tsx`, `components/compose-button.tsx`,
  `lib/contract/views.ts` (verified zero importers). *(`lib/help/feature-keys.ts` was initially
  removed too but **restored** — it's imported by the `scripts/help-*` CI tooling, which the
  first grep didn't cover. Lesson: orphan-checks must include `scripts/`.)*
- ✅ **Fixed `AI-VERA.md` stale header** ("design / not yet built" → Phases A–D shipped).
- ⏳ **Drop ~5 orphan quest tables** — `quest_steps`, `quest_progress`, `season_trophies`,
  `group_memberships`, `circle_topics` (residue of the Jun-4→8 quest/arc/journey rename
  churn). **Do only after** retiring `quest_outcomes()` + its `/admin` surface and
  regenerating `database.types.ts` (BACKLOG §S1b). Needs a migration — not a free delete.
- ⏳ **Split / index `DECISIONS.md`** — 4,858 lines / 161 ADRs, 31% of all doc lines.
- ⏳ **Consolidate overlapping doc clusters** — onboarding/beta (4 docs), AI (5), engagement (4).

---

## Section 5 — Network (consolidate Contacts / Directory) — 📋 (ADR-154)

The "make real-life contacts and keep them" product. Full design:
[`NETWORK-CRM.md`](NETWORK-CRM.md) § *The Network rework*. The 3-entity data model + AI
harvest + consent boundary are **already built**; this is IA, an access-tier change, and
**one new public capture surface**. Ranked:

| # | Item | Why | Reuse | Size |
|---|---|---|---|---|
| 5.1 | **Rename `Directory → Network`; merge `/people` + `/connections` into one member-tier tab** (Directory + Contacts faces) | Makes personal contacts a *member* product, not a host tool | `lib/nav-areas.ts`, `lib/connections/access.ts` (gate move only — RLS already owner-scoped) | S–M |
| 5.2 | **Member quick-add capture** (`+` → scan card/poster/person, manual + Vera completes the card) | The headline promise; **already built**, just host-gated today | `app/(main)/connections/new/`, `lib/ai/connections-ai.ts` | S |
| 5.3 | **Event-invite capture loop** — public RSVP contact form via an attributed QR → triple-write (event guest list · owner's personal CRM · marketing DB, consent observed) | The growth loop the product is built around; **doesn't exist yet** (RSVP is members-only) | `/q/<slug>` referral (ADR-091/099), `crm-sync.ts`, `event_guest` channel hint | M–L |
| 5.4 | **`event_guests`** table — let a non-member RSVP to one event without an account | Backs 5.3 | new migration (additive) | S |
| 5.5 | **Gamification** — zaps for capture/RSVP/attend/join + a "Connector" achievement, reward real outcomes not rows | Closes the loop into the season ladder | `lib/zaps.ts`, `lib/engagement/currency.ts`, achievements | S–M |

**Privacy invariant (non-negotiable):** captured people stay **personal**; they enter
marketing as `consent_state='unknown'` (added, never mailed) and become mailable only when
**they** confirm an email or sign up. Promotion is the deliberate, consent-gated act (ADR-099).

**Sequencing note:** 5.1 + 5.2 are a small, self-contained PR (IA + ungate) that ships the
member product immediately. 5.3–5.5 are the bigger growth-loop build — do after the §1
activation push, since they share the QR/referral + consent plumbing.

## Section 6 — Capture (the primary "log life as it happens" surface) — 📋 (owner vision, needs ADR)

> **The frame (owner).** The Quest is about *activation* — going outside and engaging with
> society, gamified. **Capture** is how members *log and track that lived experience* and share it.
> The community feed becomes **the story of the community's experience** — not content curated to
> be enjoyed online. Every user becomes an **access point** that brings people into the network.

**The shape.** A **primary Capture button** (a camera-style affordance) that opens a *mode picker*
— the same vibe as tapping a camera icon and getting Photo / Video / Cinema / Live. Capture is for
grabbing life as it goes by: a moment, a **Note** *(new)*, a Post — building a shared daily journal.

| Capture mode | What | State |
|---|---|---|
| **Photo / moment** | snap + share to the feed/journal | ⏳ composer has media; needs the Capture entry + journal framing |
| **Note** *(new)* | a lightweight text journal entry (a "showed up / saw this" log) | 📋 new post subtype |
| **Post** | the existing composer | ✅ exists |
| **In-Person → Business Card / Poster** | "we stop and trade info with a new friend" — the **Profile Creator** folded in as a Capture category | ✅ built (`/connections/new`), needs to live under Capture |
| *(later)* Video · Cinema · Live | richer capture kinds | 📋 future |

**Why this is one feature, not many.** "Stop and take a picture" and "stop and trade information"
are the *same gesture* — capturing a real-world moment. So **In-Person capture** (the card/poster
scanner, §5/ADR-098/154) becomes a **category inside Capture**, alongside Photo/Note/Post. One
button: capture life's moments to share **and** manage your contacts **and** bring people into
Frequency — a community-management tool where every member is a node.

**Build approach (reuse, don't rebuild).**
- Wrap the existing **composer / `CreateModal`** and the planned **Create Wizard registry** (BACKLOG
  §Q2) so Capture is a *mode picker* over typed create-kinds — Capture is the consumer surface for
  that registry, not a parallel system.
- **In-Person** = the existing Profile Creator (`app/(main)/connections/new/`, `lib/ai/connections-ai.ts`)
  surfaced as a Capture category; ties straight into the **Network** rework (§5) and the
  event-invite capture loop.
- **Note** = a new lightweight post subtype (ties into BACKLOG §S6 tiered composer options).
- **Gamification** = zaps for in-person/IRL capture + outreach (the Quest ladder), gems for content
  (the existing engines) — reward the *real moment*, not the row (§5.5 anti-farm doctrine).

**Phasing (proposed — add an ADR on build).**
1. The **Capture button + mode picker** over the existing composer (Photo/Post), revived as the
   app-shell primary action (BACKLOG §Q2 Phase 3).
2. **In-Person capture** folded in (Business Card / Poster → personal CRM + the §5 loop).
3. **Note** journal subtype + the "daily journal / community story" feed framing.
4. Richer kinds (video/cinema/live) as demand warrants.

**Open questions (owner):** does "Note" share the post table or get its own journal store · how
loud is the Capture button vs. the feed composer · which captures are public-by-default (moments)
vs. private-by-default (contacts — stays private per ADR-154).

## Reuse map — what already exists (so you never rebuild it)

| Need | Already built | Path |
|---|---|---|
| Live Vera turn (Claude + tools + memory) | ✅ | `lib/ai/vera/agent-claude.ts` |
| Deterministic Vera fallback | ✅ | `lib/ai/vera/concierge.ts` |
| Bounded typed tools + validators | ✅ | `lib/ai/vera/tools.ts`, `execute.ts`, `read-tools.ts` |
| Member memory (facts/summary, erasable) | ✅ | `lib/ai/memory.ts` + `ai_member_context` |
| AI kernel (router, caps, dual kill-switch, ledger) | ✅ | `lib/ai/{client,models,budget,usage,complete}.ts` |
| Help RAG (embed → ground → cite → deflect) | ✅ | `lib/ai/help-rag.ts`, `help-index.ts` |
| Activation status (single source of truth) | ✅ | `lib/onboarding/status.ts` |
| Coachmark tour (mounted) | ✅ | `components/onboarding/tour-provider.tsx` + `lib/onboarding/{tips,select}.ts` |
| Spotlight tour | ✅ | `components/onboarding/spotlight-tour.tsx` |
| Vera chat UI (extract `<VeraChat>` from here) | ✅ | `components/onboarding/vera-lightbox.tsx` |
| Vera operator config | ✅ | `/admin/vera`, `lib/ai/vera/config.ts` |
| Beta funnel (splash → lead-flow → induction → complete) | ✅ | `app/(marketing)/`, `app/onboarding/beta/`, `lib/onboarding/{personas,lead-flows,beta-sequences}.ts` |

## Best-practice guardrails (apply to every item above)

- **Deterministic-first.** Every surface keeps its non-AI baseline; Vera is an enhancement.
  Kill switch on ⇒ the product is still whole.
- **Propose-and-confirm.** No autonomous writes; every Vera write shows an Allow/Skip. No
  autonomy graduation until the consent harness (ADR-028).
- **Non-blocking & paced.** One cue at a time, skippable, never re-shown — never a wizard
  (ADR-047). Honor `prefers-reduced-motion`, focus management, mobile-first.
- **Vera always links.** Every feature/page/action she names renders as a tappable link.
- **Compose from the kit.** Use the templates + `EntityCard`/`StatCard`/`SectionHeader`;
  no hand-rolled headers, no `text-[10/11px]` content, semantic tokens only (no hex).
- **Measure the right funnel.** Activation up, time-to-human down, Vera footprint per
  established member *decays*. If "messages to Vera" is what climbs, she's failing.
