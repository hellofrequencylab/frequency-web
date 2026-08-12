# Research protocol — moderated tests, quarterly

> **The round in one line.** Five members, one hour each, once a quarter, on the Vercel
> preview of the current `design-sync/*` branch. The tasks are the five journeys. The
> output is one file: `docs/research/findings/YYYY-MM-DD.md`, which then rides out with
> the next DAWN handoff.
>
> This is [UX-MATURITY-PLAN.md](../UX-MATURITY-PLAN.md) Lift 1b. Findings live in git
> (not Notion) because they are technical inputs to design, not operator instructions —
> see [DOCS-PROTOCOL.md](../DOCS-PROTOCOL.md). The handoff leg is
> [`design_handoff/SYNC.md`](../../design_handoff/SYNC.md) §"Findings + vitals".

Legend: ✅ done · ⏳ in flight · ⚠️ needs attention · 🔴 blocker / owner-gated.

---

## 1. The round at a glance

| | |
|---|---|
| **Cadence** | Once per quarter. Target: sessions inside the two weeks before a DAWN round opens. |
| **Participants** | 5 members, recruited from the beta list (`/admin/beta`, backed by `contacts` + `beta_admission_waves`). |
| **Surface** | The Vercel preview of the current `design-sync/*` branch. Never production, never localhost. |
| **Length** | 60 minutes: 5 consent + warm-up, 45 tasks, 10 debrief. |
| **Tasks** | J1-J5, §5. Every participant runs all five; J5 only if they operate a Space, else swap in the J5 observer variant. |
| **Roles** | One moderator (reads the script, never helps). One notetaker if available; otherwise the recording is the notetaker. |
| **Output** | One `docs/research/findings/YYYY-MM-DD.md`, dated the day the LAST session ran. |
| **Thank-you** | A Zap grant per participant (§2). |

**Why five.** Five is the point where a moderated round stops finding new problems and
starts repeating them. A sixth session is worth less than a second round a quarter later.

## 2. Recruiting and the thank-you (🔴 owner action, ~2 hours per quarter)

The only genuinely human step in this lift. Nobody else can do it.

| Step | How |
|---|---|
| 1. Pull the pool | `/admin/beta` — admitted members with real activity, mixed by tenure. Skip anyone who sat a round in the last two quarters. |
| 2. Check eligibility | The member's `analytics` consent scope must be granted (§3). |
| 3. Invite | 8 invites to land 5 sessions. Name the time ask and the thank-you up front. |
| 4. Mix | Aim for 3 members + 2 operators (someone who runs a Circle or a Space), so J5 is observed at least twice. |
| 5. Pay the thank-you | Within 24 hours of the session: `/admin/members` → Grant Zaps, reason `Research round YYYY-QN`. Janitor-only, and the reason field is required, so the Vault log stays readable. |

The Zap amount is the owner's call and should be the same for every participant in a
round. It is a thank-you, not a bounty: never pay more for "good" feedback.

**Invite copy** (voice canon: plain, concrete, honest time ask, no narrated feelings):

> Subject: An hour of your time on the new Frequency
>
> We are rebuilding parts of the site and we want to watch real members use it before we
> ship. It is one hour on a video call. You use a test version, I watch, you talk. There
> is nothing to prepare and no wrong answers, because I am testing the site and not you.
>
> Thank-you is a Zap grant to your account.
>
> Two times that work this week: [A] or [B]. Either?

## 3. Consent

**How consent is modeled here.** The repo has a consent registry —
`lib/consent/scopes.ts`, ADR-069 Phase 5b — with four scopes: `email_lifecycle`,
`email_marketing`, `ai_memory`, `analytics`. Every scope is account-linked and recorded
in the consent ledger.

The rules that follow from that:

| Thing we do | Covered by | Rule |
|---|---|---|
| Read the participant's own funnel/telemetry alongside what we saw | `analytics` scope ("First-party usage data tied to your account") | Granted-only. A member who revoked `analytics` is **not eligible**: connecting the session to the ledger is half the value, and reading it anyway would break the scope. |
| Observe them, take notes | ⚠️ no scope covers it | Spoken consent, recorded in the notes header. |
| Record screen + voice | ⚠️ no scope covers it | Spoken consent, separately. A no here does not cancel the session. |
| Quote them anonymously in the findings file | ⚠️ no scope covers it | Spoken consent, separately. |

**⚠️ Known gap, flagged not invented.** There is no `research_session` scope. Adding one
is a change to `lib/consent/scopes.ts` plus an ADR, which is outside this document's
authority — raise it with the owner if quarterly rounds become routine. Until then the
spoken consent plus the notes header **is** the record, and this protocol must not claim
otherwise.

**Read this aloud, verbatim, before anything is opened.** Member-facing copy, so it obeys
[CONTENT-VOICE.md](../CONTENT-VOICE.md): plain sentences, no em dashes, no narrated
feelings.

> Thanks for doing this. Here is what it is.
>
> I am going to ask you to do five short things on a test version of the site. I want to
> see where it works and where it does not. I am testing the site, not you. If something
> is confusing, that is the site's fault, and it is exactly what I need to see.
>
> Three asks, and you can say no to any of them and we still do the session.
>
> One. Can I take notes while you work.
> Two. Can I record your screen and your voice, so I am not scribbling the whole time.
> Three. If you say something useful, can I quote it in our notes, with no name attached.
>
> You can stop at any point. You can tell me afterwards to delete the recording and I
> will. Say your answers out loud so they are on the record: notes, recording, quoting.

**Handling the recording.**

- Never record a password field, a payment field, or another member's messages. Pause,
  say "I am pausing the recording for this bit," resume after.
- Recordings stay in the round's private folder. **Nothing but the anonymized findings
  file enters git.**
- Participants are `P1`-`P5` in every note. No names, no handles, no avatars, no
  screenshots that carry either.
- Delete recordings when the findings file is written, or sooner on request.

## 4. Moderating

Five rules. They are the whole method.

1. **Read the task, then stop talking.** Silence is data.
2. **Never demonstrate, never point.** If they are stuck, the site is stuck. Wait a full
   30 seconds before you say anything.
3. **When asked "what should I do", bounce it back**: "What would you do if I was not
   here?"
4. **Prompt for narration, not for opinion**: "What are you looking at?" beats "Do you
   like it?" An opinion about a screen is worth nothing; a hesitation in front of it is
   worth everything.
5. **Timebox every task.** When the box runs out, mark it failed, say "let's move on,"
   and move on. A rescued task is a lost measurement.

## 5. The task scripts

One per journey, in order. Each has a setup, the words you read, what counts as done, the
timebox, and what to watch for. **Read the bold block verbatim** — improvising the task
is the most common way a round is wasted.

### J1 — Land → join the beta (timebox 6 min)

*Setup: a signed-out preview window, on the marketing home. Clear session.*

> **Imagine a friend sent you this link and said "you should look at this." Go ahead and
> look. Talk out loud about what you think this is, and then do whatever you would
> actually do next.**

- **Done:** they submit the beta form, or they say out loud that they would not.
- **Watch for:** how far they scroll before deciding what Frequency is · whether the
  proper nouns (Circle, Quest, Zap) land or bounce · which CTA they reach for · whether
  the hero fact dock is read or skipped · anyone saying "so is this an app or a place."
- **Note the moment** they first say what the product does in their own words, and
  whether they are right.

### J2 — Join → the first Circle found (timebox 8 min)

*Setup: a fresh account on the preview, signed in, landing on the feed for the first time.*

> **You just joined. Find a Circle you would actually turn up to.**

- **Done:** they open a Circle's page and say whether they would join it.
- **Watch for:** first move from the feed (rail? search? tab bar?) · whether "Circle" is
  understood without help · what they do when the nearest Circle is not near · whether an
  empty or thin listing reads as "nothing here" or "not loaded."
- **Deliberately vague** on purpose. If they ask "where do I look," bounce it back.

### J3 — First Circle → the first event RSVP (timebox 8 min)

*Setup: continue from J2, inside a Circle that has at least one upcoming event.*

> **Say you decided this one is for you. Find the next time they meet, and put yourself
> down for it.**

- **Done:** an RSVP is recorded and they can point at the confirmation.
- **Watch for:** whether they find the event from the Circle or go back to a global
  Events surface · whether the date, place and cost are answered before they commit ·
  what they expect to happen after the RSVP (a calendar entry? an email? a reminder?) ·
  whether they can tell afterwards that they are in.
- **Ask after:** "How would you get out of it if you could not make it?" Cancelling is
  part of committing.

### J4 — First practice log → the 7-day return (timebox 8 min + a question)

*Setup: continue signed in, on The Quest.*

> **Do a practice, and log it.**

then, once logged:

> **It is tomorrow morning. Show me how you would come back to this. Then tell me,
> honestly, whether you would.**

- **Done:** one practice logged; they show the path back and answer honestly.
- **Honest limit:** a seven-day return cannot be observed in an hour. This session
  measures the **first log** and the **stated intent**; the actual return rate is the J4
  funnel's job (`/admin/insights` Journeys panel). Never write "J4 passed" from a session.
  Write what they said, and let the funnel say what they did.
- **Watch for:** whether the reward (Zaps) is noticed, understood, or ignored · whether
  the streak reads as encouragement or as pressure · what they say the site is for after
  logging one thing.

### J5 — Operator: claim → the first published surface (timebox 12 min)

*Setup: an operator participant, signed in, with a claimable or newly claimed Space.*

> **This is your place, and it is listed here but it is not yours yet. Make it yours, and
> then get it to the point where you would be happy for someone to see it.**

- **Done:** the claim is completed and at least one operator-authored surface is published.
- **Watch for:** whether "claim" is understood as ownership · where they expect the
  console to be · whether they find the publish action or keep saving drafts · whether
  they can tell what is live versus what is a draft · every place they ask "will this
  charge me."
- **Observer variant** (a participant who runs nothing): show them a claimed Space, then
  ask **"If this was your place, what would you want to change first, and where would you
  go to do it?"** Record the where. A wrong first guess about where the console lives is
  the finding.

### After the five tasks (5 min, unscripted)

Two questions, asked in this order and no others:

> **What was the most annoying part of that hour?**
>
> **If you had to describe Frequency to someone at work tomorrow, what would you say?**

## 6. Note-taking template

One block per participant, filled during the session. Copy this verbatim.

```md
## P{n} — {YYYY-MM-DD} · {member | operator} · {device: desktop | phone} · {browser}

Consent (spoken): notes YES/NO · recording YES/NO · quoting YES/NO
Preview URL: {vercel preview}   Branch: design-sync/{...}

### J1 land → join beta        [ ] done  [ ] failed  [ ] timed out   time: __:__
Observed:
Quote:
Tripped on:

### J2 join → first Circle     [ ] done  [ ] failed  [ ] timed out   time: __:__
Observed:
Quote:
Tripped on:

### J3 Circle → event RSVP     [ ] done  [ ] failed  [ ] timed out   time: __:__
Observed:
Quote:
Tripped on:

### J4 practice log → return   [ ] done  [ ] failed  [ ] timed out   time: __:__
Observed:
Stated intent to return: yes / no / unsure — because:
Tripped on:

### J5 claim → published       [ ] done  [ ] failed  [ ] timed out  [ ] observer variant
Observed:
Quote:
Tripped on:

### Debrief
Most annoying:
Describes Frequency as:

### Moderator notes
Anything I said that I should not have:
Rig problems (preview slow, auth, seed data):
```

**"Tripped on" is the load-bearing field.** It is what the DAWN handoff carries out. Write
it as a place plus a behavior, never as a solution: *"P3 hunted the rail for Events for 20
seconds before using search"* — not *"the rail needs an Events link."*

## 7. The findings file

One file per round: `docs/research/findings/YYYY-MM-DD.md`, dated the day the last session
ran. Shape, required sections, and the rules against rewriting history are in
[findings/README.md](findings/README.md). Write it within 48 hours, while the sessions are
still in your head.

**It is a technical input to design, so it lives in git** (DOCS-PROTOCOL router step 1).
It is not an operator instruction and never goes to Notion. If a round produces something
an operator must *do differently* (how to run a Circle, how to moderate), that part goes
to the Notion training page as its own paragraph, and the findings file just links to it.

## 8. The gate and the metric

| | |
|---|---|
| **Gate** | 🔴 **None.** A `check:research-freshness` script existed until 2026-08-12 and ran in **no** workflow; its own output ended *"Nothing a PR can fix, which is why this exits 0"*, so it could not fail. It was deleted (ADR-1011). This table previously said it "warns in CI", which was never true. A human recruiting cadence cannot honestly be build-blocked, and a guard four documents describe while nothing runs it is worse than no guard. The status this section tracks is stated below and in [`UX-MATURITY-PLAN.md`](../UX-MATURITY-PLAN.md) Lift 1: **no moderated round has ever run — this directory holds only its `README.md`.** Closing it is 🔴 owner action (§2: recruit five members). |
| **Metric** | Age of the newest findings file (target: under 100 days), and J1-J5 conversion from the Journeys panel, reviewed in every DAWN round note. |

---

*Companion: [UX-MATURITY-PLAN.md](../UX-MATURITY-PLAN.md) Lift 1 · the handoff contract in
[`design_handoff/SYNC.md`](../../design_handoff/SYNC.md) · voice rules in
[CONTENT-VOICE.md](../CONTENT-VOICE.md) · presentation rules in
[PRESENTATION.md](../PRESENTATION.md).*
