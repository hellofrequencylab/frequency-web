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
| **5.2** | Member-tier personal contacts + quick-add capture (ungate) | Real-life contacts, kept | S | ✅ shipped |
| **5.1** | Rename Directory → **Network** + merge `/people` + `/connections` into one member tab | Findable as a product | S–M | 📋 next |
| **5.3–5.5** | Event-invite capture loop (QR → RSVP → triple-write) + gamification | The growth loop | M–L | 📋 |
| **6** | **Capture** — primary "log life" button (Photo/Note/Post + In-Person card/poster) | The community story + every member a node | L | ⏳ Phases 1–3 shipped |
| **7** | **Role-advancement training** — a training Journey per role transition | Onboarding never ends; every role is taught | L | ⏳ spine shipped (7.1–7.2) |
| **8** | **Hook Networks** — federated white-label sub-communities (+ Organization role) | Pros/orgs run their own bubble that feeds the network | XL | 📋 designed (ADR-158) |
| **9** | **Growth Studio** — unified "Leadpages-style" onboarding/growth suite | One place to manage pages, entry points, QR, links, pipeline | M | ⏳ launchpad shipped (9.0) |
| **10** | **Navigation restructure** — left-menu-only, categorical, minimal drill-down | Clean IA; condense sprawl into dashboards | L | ⏳ rail recategorized; dashboards next |
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
| 2.1 | **Welcome community post** ✅ shipped | `lib/onboarding/welcome.ts` `postWelcomeForMember` — the `is_system` account posts "Everyone, welcome @handle 👋" to the public feed on first induction completion (`app/onboarding/beta/actions.ts`, best-effort, once-only via pre-update meta). Turns sign-ups into *greeted* members + seeds the feed. *Tweaks:* scope (community vs nexus), member opt-out, notify the welcomed member. |
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
| 5.2 | ✅ **shipped — Member quick-add capture.** The personal-CRM pages + create action now resolve owner via the new member-tier `contactsOwnerId()` (`lib/connections/access.ts`), so **every member** can scan/add their own owner-scoped contacts — this is what Capture's "In person" mode hits. Steward gate (`connectionsOwnerId`) retained for the directory-embedded view (`/people`) + search until 5.1 merges them. RLS already owner-scoped, so opening the tool is safe (ADR-154). | The headline promise; was host-gated | `lib/connections/access.ts`, `app/(main)/connections/{new,[id],}`, `actions.ts` | S |
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
>
> **Capture is the check-in step of the Portal Loop (ADR-155):** *see what's good → get your
> assignment → go out & act → **Capture** → content disperses through the locality × in-person feed
> rank (ADR-080).* It inherits that ADR's law — built to serve activation, never dwell-time.

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

**Phasing (ADR-156 on build).**
1. ✅ **shipped — Capture button + mode picker** replaces the inline composer (Photo · Note · Post ·
   In-Person). `components/feed/capture-bar.tsx`; composer gained `kind`/`autoImage`;
   `post_type='note'` migration; `post-card` Note badge; In-Person → `/connections/new`.
   ⚠️ apply `20260606180000_post_type_note.sql` on deploy for Note.
2. ✅ **shipped — promoted to an app-wide FAB.** `components/feed/capture-launcher.tsx`: a raised
   Capture button docked bottom-centre (above the mobile tab bar; floating on desktop), clear of the
   Vera launcher + chores pill, mounted in `app/(main)/layout.tsx` so it's reachable from every page.
   Opens the same mode picker in a modal; posts default to the member's wall. Hidden on `/feed` (the
   inline bar already serves there); the four modes are shared via `CAPTURE_MODES` so the two entries
   can't drift. *Tweak:* suppress on focus/compose surfaces (settings, `/connections/new`).
3. ✅ **shipped — "Daily journal / community story" framing.**
   - **Personal:** `/journal` (`app/(main)/journal/page.tsx`) — your captured moments grouped by day
     in the feed-as-record voice; linked from the Capture launcher.
   - **Community:** a **Story** lens on `/feed` (`?sort=story`) — the whole community's posts as the
     running record, **chronological + day-grouped**, no feed furniture (dispatch/event cards), with
     the record voice ("what the community lived — not a scroll to consume"). `FeedList` gained a
     `'story'` sort that reuses the visibility-correct `feed_for_viewer` RPC (fetched as `recent`).
   - Both read the posts substrate — no new store.
4. 📋 Richer kinds (video · cinema · live) into the same picker as demand warrants.

**Rework (ADR-156a) — ✅ shipped + 📋 next.**
- ✅ **One multi-mode box** (`capture-box.tsx`), Substack-style: body swaps by mode, **one bottom row
  of selectable capture features** (segmented, beside the send button) — **Post · Dispatch · Note ·
  Photo · Contact** (Dispatch host-only; the old Post|Dispatch toggle folded in). Send button always
  says **"Capture"**. `Composer` (shared with circle/channel/profile) gained `bottomSlot` +
  `forceAnnouncement` so the feature row + Dispatch live in `CaptureBox`, not the shared editor.
- ✅ **Contact mode is inline** (`contact-capture-form.tsx`) — manual entry → personal CRM via
  `createProfile` (§5.2); card *scan* one tap away at `/connections/new`.
- ✅ **Mobile centre-nav Capture button** — a raised centre button in `MobileTabBar` (`app-shell.tsx`)
  dispatches `open-capture`; `CaptureLauncher` catches it and opens the box **contact-forward** on
  mobile. Desktop keeps the floating FAB; one modal, two triggers. (Richer contact intake — QR
  check-in · photo of them — rides the Contact mode + the card scanner as it grows.)
- 📋 **Quest pipeline + sponsor-backed rewards** — contacts billed as a personal CRM **and** the
  member's Quest sales pipeline; invites/conversions earn escalating, ultimately sponsor-backed
  real-life rewards (ADR-155 loop, ADR-156a). Spec → BACKLOG §F.

**Open questions (owner):** does "Note" share the post table or get its own journal store · how
loud is the Capture button vs. the feed composer · which captures are public-by-default (moments)
vs. private-by-default (contacts — stays private per ADR-154).

## Section 7 — Role-advancement training (a training Journey per role) — 📋 (ADR-157)

> **The frame (owner).** Onboarding never ends — it's keyed to **role**. Every promotion assigns a
> new training Journey that walks the member through the functions that role just unlocked. Member
> onboarding (built) is rung one; Crew, Host, and every admin role get their own advancement
> training, with permissions, help articles, and a completion transcript all tied in.

**Composes existing systems** (ADR-157): the `role_change` event (already emitted), the Journeys/
Quests engine (`lib/journey-plans.ts`, `quest_steps`, `journey_plan_adoptions`), the tour/coachmark
system (`TourState`/`TourProvider`), the Vera coach, help articles (`content/help/*`), and the
roles/permissions model (`lib/permissions`, `lib/nav-areas`). **No new flow engine.**

| # | Item | What | Reuse | Size |
|---|---|---|---|---|
| 7.1 | ✅ **shipped — Assignment-on-promotion.** `assignRole` (`admin/actions.ts`) now calls `assignTraining(profileId, role)`; the **Vera coach** hands off to `/training` when active (gated to crew+ so members never pay for the query). | `lib/onboarding/training.ts`, `app/(main)/layout.tsx` | S–M |
| 7.2 | ✅ **shipped — Training-path records.** `training_paths` table (assigned/started/completed per member+role) — the transcript + gate + analytics. The `/training` page (`app/(main)/training/`) shows the active Journey as a curated path through the help center + a one-time gem reward on completion. ⚠️ **apply `20260608010000_training_paths.sql` on deploy.** | new migration, `lib/onboarding/training.ts` | M |
| 7.3 | **Role→Journey content** | one training Journey per role; each step = a help article + optional coachmark tour; completion rewards (online → gems, ADR-139) | help center, Journeys, coachmark registry | M–L |
| 7.4 | **Help-article role tagging** | tag `content/help/*` by `role` + `featureKeys` so a Journey assembles from the role's newly-unlocked surfaces | help front-matter (already has `featureKeys`/`audience`) | S |
| 7.5 | **Flow management (admin)** | owner-tunable authoring of training Journeys per role | Journey/Quest authoring + help editor | M |

**Sequencing:** 7.1 + 7.2 are the spine (assign + record) — ship first. 7.3–7.5 are the curriculum
+ management layer. The **member** rung already exists (induction + activation + chores + Founder's
First Week); 7.x generalizes it up the ladder. Member-facing curriculum → help/Notion; engine →
git. **Open (owner):** does Crew→Host training *gate* admin access until complete, or just nudge?

## Section 8 — Hook Networks: federated white-label sub-communities — 📋 (ADR-158, extends ADR-059)

> **The frame (owner).** Pros and organizations run their own **white-label bubble** (a *Hook tenant*:
> private lessons · journeys · gamification · branded site · Substack-style subscription privacy) that
> **opts into** the main Frequency network for contacts, events, and gamification. Their private points
> roll up to their Frequency score; their channels/circles can federate in. Any organization bettering
> society is welcome. **Active Hook-community members get rollover Frequency membership.**

**The strategy (ADR-158): build the *federation layer*, not the OS.** Hook owns the bubble (ADR-059);
Frequency owns discovery + the shared social graph + the gamification rollup, bound by **typed
contracts, never merged code**.

| # | Item | What | Reuse | Size |
|---|---|---|---|---|
| 8.0 | **Pro-profile types + Organization** | Formalize personas (`practitioner/partner/builder/investor`) into a profile `kind`: practitioner · business · partner · creator · **Organization**; each unlocks role-appropriate surfaces + its §7 training | `lib/onboarding/personas.ts`, traits registry, role/permission grid, §7 | M |
| 8.1 | **Identity link + membership rollover** | Frequency↔Hook account link; an active Hook-community member → Frequency member (provisioning contract) | ADR-059 contracts, auth/profiles | M |
| 8.2 | **Points rollup** | Private-program points → Frequency score via a contract endpoint, **idempotent + capped** (anti-farm, §5.5/ADR-139) | `lib/zaps.ts`/`lib/gems.ts`, engagement ledger | M |
| 8.3 | **Community federation + lead-funnel bubble** | Host opts to expose channels/circles into the main network; public bubble (per-tenant subdomain, BACKLOG §J) funnels into the gated sub-community | `feed_for_viewer` reach model, channels/circles, subdomains | L |

**Sequencing:** 8.0 is the cheapest first step (extends personas + the grid; ties to §7) and unblocks the
rest. 8.1 delivers "energy flowing between" fastest. 8.2 + 8.3 are the bigger federation builds. Hook
owns the white-label site, private content/gamification, and subscription billing throughout (ADR-059).
**Cross-product contract → the Hook repo** (`hook/docs/FREQUENCY-INTEGRATION.md`); operator/strategy →
Notion.

## Section 9 — Growth Studio: the "Leadpages-style" onboarding/growth suite — ⏳ (owner)

> **The frame (owner).** One place to manage onboarding pages + a full settings suite + entry points +
> pipeline + QR editor + link generator — Leadpages-style.

**Key finding (codebase map):** every data model already exists — the gaps are **UI + unification, no
new tables.** The page editor (Puck) is shipped (`/pages`, `/edit/[slug]`); entry points
(`/entry-points`), QR Studio (`/admin/qr`), codes/links (`/codes`), CRM pipeline (`/crm`), contacts
(`/connections`, `/marketing/contacts`), onboarding sequences (`/pages/sequences`) and the marketing
hub (`/marketing`) all exist — **scattered**.

- ✅ **9.0 — Growth Studio launchpad** (`app/(main)/growth/page.tsx`, `/growth`, janitor-gated; nav +
  icon added). One home that gathers all of the above into grouped quick-links — the "one place" win
  by unifying, not rebuilding.

**Gap roadmap (UI builders the launchpad will host):**
| # | Gap | Where it'd live |
|---|---|---|
| 9.1 | ✅ **shipped — Onboarding-sequence editor (splash).** `/pages/sequences/[slug]/edit` edits the splash copy; a `sequence_overrides` table (⚠️ apply `20260608020000`) merges over the code default at `/beta/[slug]` render — publish without a deploy. Voiced copy/oaths stay code-first (follow-up). | `lib/onboarding/sequence-overrides.ts`, `/beta/[slug]` |
| 9.2 | **Visual entry-point / flyer designer** (live preview; templates immutable today) | `/entry-points/[id]/edit`, over `lib/entry-points/flyer.ts` |
| 9.3 | **Live QR style preview** (JSON editor exists, no live render) | `/admin/qr/[id]` style editor |
| 9.4 | **Unified link generator** (referral/campaign/invite links are 3 places) | a `/growth/links` dashboard over `qr_codes` + `invite_links` |
| 9.5 | ✅ **shipped — CRM deal create/edit.** `/crm/deals/new` + `/crm/deals/[id]/edit` (`DealForm`) wire the UI to the existing actions (`createDeal`/`updateDeal`/`moveDeal`); "New deal" button + per-card edit link. Stage-move was already on the cards. | `components/crm/deal-form.tsx`, `/crm` |
| 9.6 | **Lead-flow customization UI** (personas/routing code-first) | over `lib/onboarding/lead-flows.ts` |
| 9.7 | **A/B builder + scheduled publish** (infra exists: `entry_point_variants`, `fq_var`) | entry-point + page editor |

**Sequencing:** 9.0 ships the hub now (done). 9.1 (sequence editor) + 9.5 (CRM deal editing) are the
highest-value next builds — they turn the two biggest "view-only" surfaces into real management. All
reuse existing tables; the work is editors + actions.

## Section 10 — Navigation restructure — ✅ map approved, building (full plan: [IA-RESTRUCTURE.md](IA-RESTRUCTURE.md))

> **Goal (owner):** everything from the **left menu**, categorical, **minimal drill-down**; sprawl
> condensed into **Growth-Studio-style dashboards**; **right-column nav removed**. Map approved
> 2026-06-06.

**Proposed left menu:** Home (Feed · Around You) · Community (Circles · Channels · Events · Marketplace
· People) · Practice (Journeys · Practices+Curated) · Quest (one dashboard + Store) · Messages ·
**Studio** (Community Studio · Growth Studio · Network · Insights · Platform) · Account.

| # | Item | What |
|---|---|---|
| 10.1 | **Quest dashboard** | Collapse `/crew/*` (10 routes) into one dashboard with sections (stats · tasks · streaks · achievements · challenges · leaderboard); Store absorbs Vault |
| 10.2 | **Operator dashboards** | `/admin` 9 suites/23 pages → **Community Studio** + **Insights** + **Platform**; **Marketing** folds into **Growth Studio** |
| 10.3 | **Network hub** | Unify `/people` + `/connections` + `/marketing/contacts` into one tabbed Contacts hub |
| 10.4 | **Practices + Library** | Library folds into Practices as a "Curated" tab |
| 10.5 | **Settings hub** | 5 routes → one sectioned hub |
| 10.6 | ✅ **Uniform widget-free right rail** | Stripped the four list widgets (Dispatches/Events/Members/Leaderboard); rail is now a uniform slim stats strip site-wide (DemoNotice + progress cockpit). That content lives on the left menu (Around You · Events · People · Quest); in-body **scope rails** on circle/channel detail kept |
| 10.7 | **Rewrite `NAV_AREAS`** | New categories; later make it owner-editable (Site Navigation suite, BACKLOG §J) |

**Approved decisions:** Library→Practices · Marketing→Growth Studio · Quest→one dashboard (sections) ·
keep scope rails. **Open:** "Around You" naming. **Sequence:** 10.1 → 10.2 → 10.3 → 10.4/10.5 → 10.6 →
10.7. Each is a contextual page/dashboard over existing data — UI + nav, minimal new schema.

- ✅ **Rail recategorized (first cut of 10.7).** `NAV_AREAS` rewritten to the categorical IA: **Home ·
  Community · Practice · Quest · Messages** (member) + the four operator sections collapsed to
  **Studio** (host+) + **Platform** (janitor). Quest relabeled; **Messages added to the rail**; no items
  orphaned (deep dashboard merges keep everything reachable). Routes unchanged — pages still gate
  themselves.
- ✅ **10.1 — Quest tabbed dashboard.** `components/crew/quest-tabs.tsx` + `app/(main)/crew/layout.tsx`:
  a shared sub-nav (Dashboard · Quests · Achievements · Challenges · Leaderboard · Streaks · Store)
  above every `/crew` page.
- ✅ **10.6 — Uniform widget-free right rail.** `components/sidebar/right-sidebar.tsx` stripped of the
  four list widgets (Dispatches/Events/Members/Leaderboard) + DateChip; the global rail is now a single
  uniform slim strip everywhere it renders — `DemoNotice` over the player progress cockpit
  (`GameStatsDock`). `loadGameStats`/`MobileGameStats` preserved (still consumed by the shell + mobile
  stats menu). Scoped circle/channel detail rails untouched. *Next:* 10.2 operator dashboards → 10.3
  Network hub → 10.4/10.5 Practices+Library / Settings.

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
