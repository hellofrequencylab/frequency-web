# Frequency: Demographic, Content & SEO/AIO Guide

> **Status: LOCKED (June 2026).** Companion to [`docs/NAMING.md`](NAMING.md).
> This guide governs ALL written output: game UI copy, notifications, practice
> pages, Journey cards, website pages, blog/SEO articles, social posts, emails,
> and error states. When writing or reviewing any copy, apply this guide.
> Naming always defers to `docs/NAMING.md`. If this guide and the naming canon
> ever conflict, the naming canon wins.

> **Punctuation hard rule (read first):** do not use em dashes (the `—` character)
> anywhere in brand/member-facing copy. Use periods, commas, parentheses, or
> rewrite the sentence. Hyphens in compound words (post-breakup, third-place) are
> fine; the banned character is the long dash.

---

## 1. What Frequency is (write from this, never paste it)

Frequency is community infrastructure for real-world connection. A worldwide
community framework (Circles, Hubs, Nexuses, The Quest) plus brick-and-mortar
third spaces (Outposts, Frequency Labs). The mission: help people calm down, find
friends and lead in their own communities, by bringing them together in person.
Keep the science inside the pages, never in the pitch.

The feel: summer camp for adults. A gamified journey into practices that change
people's lives. Dead serious about the mission, light about the delivery. The
metric that matters is whether people come back, not whether we acquired them.
We do not measure screen time. We measure whether you showed up Thursday.

**The spirit, in one plain line: Get people together. Do things on purpose.**
That is Frequency in seven words, and unlike the movement register (§6d) it is
repeatable, not rationed, because it is plain, not grand. It names what we do and
why: intentional connection. A Circle is a few friends doing life on purpose. The
Quest is a path you choose to walk. A Practice is something you decide to do, on a
rhythm, with other people. Use it as a rallying line, a section header, or a close,
and let it sit next to the concrete proof rather than carry a page alone. Keep it
plain and never dress it up: the second it becomes "gather to manifest your
purpose," it is dead.

The big frame (used RARELY, see Section 6): this is a movement of community
connection. We never call ourselves a revolution in routine copy. The work says
it; the copy doesn't.

## 1a. The Community Collective positioning (ADR-811)

Frequency is **a Community Collective**: we exist to support every community effort and to help everyone in
it succeed, together. Collaboration and shared success are the through-line of all outward copy. Say it as
invitation, never as guilt (guilt makes people leave, and it fails the skeptic test). The commercial story
rests on **four brand promises**, stated plainly and only where they are true:

1. **We never take a cut of your bookings.** (We earn only on the business the network brings you.)
2. **One honest price, no surprise invoices.**
3. **Month to month. Take your data and leave anytime.**
4. **See exactly what the network earned you.**

Pricing copy never nickel-and-dimes: talk in terms of belonging and shared success, and reserve the
mission/"back the build" language for an opt-in Founding Steward, never a wall. The physical-spaces
ambition is described concretely (what the money builds), never as a rescue plea. Naming defers to
[NAMING.md](NAMING.md): "Community Collective" (brand) and "the Collective plan" (tier) stay legible;
no em dashes.

🔴 **AMENDED (ADR-1350, 2026-09-15, LIVE-253): a paid tier is NOT framed as "buying down your rate".**
This paragraph said to, and eighteen public strings obeyed it, which put the fee ladder in the first
sentence of every pricing surface and taught readers that a free Space is the small version of a paid
one. [`CORE-MODEL.md`](CORE-MODEL.md) §1 and §2 are the live argument and it is the opposite: people
join free, businesses host free, **you pay when you start charging**, because a plan is what the
*repeat* runs on ([ADR-914](DECISIONS.md): never gate the transaction, gate the repeat). The rate and
the meters are still stated, because both are true; neither is the reason. Write the reason from
`PLAN_STORY.paid` in [`lib/pricing/plan-story.ts`](../lib/pricing/plan-story.ts), which every pricing
surface interpolates, and never retype it. That module is a **leaf with no imports of its own**
([ADR-1368](DECISIONS.md)), which is what lets even a page-editor block default read the sentence
instead of arguing it again; import it from there rather than through `lib/pricing/pricing-page.ts`,
which re-exports it for existing callers but carries the whole pricing engine behind it.

🔴 **AMENDED again ([ADR-1709](DECISIONS.md), 2026-10-06): selling is what Business is for.** The three
lines stand, and LIVE-253's rule stands with them: no tier is framed as buying down a rate, and **you pay
when you start charging** is still the reason. What changed is which tier "starting to charge" means.
ADR-914's "never gate the transaction" is superseded: hosting is free and that is the point, tips stay
open at 0% on every tier, and paid tickets, paid memberships, donations, shop checkout and booking
deposits open at Business. Write the ladder as five tiers, one verb each (members join, Crew hosts, a
Space runs, Business sells, Collective connects), from `PLAN_STORY.ladder`, `.paid` and `.selling`.
Never say a free Space or a personal account sells. Crew is "contribute what you want" and sells a host
kit and backing the community, never a lower fee. Collective is named in member copy as the plan for
groups of groups.

---

## 2. The demographic: two readers, eleven archetypes

All content serves one of two readers. Before writing anything, decide which
one it's for. The archetypes in 2d and 2f say who is actually inside each
reader. They are internal names: members never see them (2g). Decision record:
ADR-1715, which links the research behind it.

### 2a. The Seeker (the "high-functioning lonely")
- Late 20s to 50s. Capable, employed, looks fine on paper.
- The core: practice skews toward college-educated women aged 25 to 44.
  Loneliness peaks at 30 to 44 for men and women alike.
- Often relocated, post-breakup, post-kids-left, new-to-town, or simply
  drifted out of friendships the way adults do.
- Digitally saturated and tired of it. Knows the feed is hurting them.
- Wellness-adjacent: has tried meditation apps, maybe breathwork, maybe cold
  plunges. Allergic to anything culty, salesy, preachy, or precious.
- Does NOT identify as "spiritual" at the front door. Will go deep once trust
  is earned.
  - AMENDED (owner directive, 2026-07-28): this governs BODY COPY, not names.
    Category and Channel NAMES may use plain wellness and spiritual terms out
    loud: Spirituality, Meditation, Holistic Health, Functional Medicine. A
    door can say what is behind it. The rule that survives untouched: never
    write CONTENT with heavy spiritual flair. The card, the one-liner, the
    empty state, the notification stay in the plain register; the name is a
    label, not a sermon.
- Their words for their pain (use these, never clinical or mystical terms):
  - "I'm always wired / I can't switch off"
  - "I have a hundred contacts and no real friends"
  - "It's hard to make friends as an adult"
  - "I moved here and don't know anyone"
  - "I doomscroll and I hate it"
  - "I'm fine but I'm not okay"

### 2b. The Latent Leader
- Feels the pull to gather people. Has no container, framework, or permission.
- Most often a Gen X or older millennial woman, often a parent, already the
  one who organizes. About one adult in ten leads any group at all, which is
  why this reader is the growth model.
- May have tried hosting something that fizzled.
- Doesn't want to "build a community" from scratch. Wants rails: a format, a
  script, a structure that already works, and backup.
- Their words:
  - "I want to bring people together but I don't know how"
  - "I tried hosting something and nobody came back"
  - "I don't want to do this alone"
- This person becomes Crew, then Host. Leader-track content is never an
  afterthought.

### 2c. What both readers share
They have been marketed at their whole lives. They can smell hype, jargon, and
manufactured intimacy instantly. The only register they haven't been sold in is
plain. Write plain.

### 2d. Who is inside the readers

| Archetype | Reader | Who | Comes for |
|---|---|---|---|
| Wired Professional | Seeker | Women 25 to 44, college-educated, often single | Mindless, Practices, Journeys, calm Events |
| Transplant | Seeker | 22 to 39, just moved or fully remote | Events this week, Circles near them |
| Activity-First Man | Seeker | Men 18 to 34 | Run and walk Circles, sauna and sober socials, Get Moving |
| Evidence-First Skeptic | Seeker | 30 to 60, neither spiritual nor religious | The plain Mindless timer, cited articles |
| Host-Connector | Latent Leader | Gen X and older millennial women, often parents | Starter Circles, the host kit |
| Gathering Host | Latent Leader, becoming a Builder | Gen Z and millennial organizers | A recurring gathering that starts to charge |
| Mission Patron | Supporter | 45 to 65, college-educated | Crew, so Frequency stays free for everyone |

### 2e. Three rules the archetypes add
1. **Men come through activities.** Never pitch a man on finding friends. Lead
   with the run, the sauna, the game night, Get Moving. The friendship happens
   on the way.
2. **Write for the spiritual and the skeptic at once.** About a fifth of adults
   are spiritual but not religious and about a fifth are neither. Plain surface
   copy with depth inside the page is the only register both accept.
3. **Supporters pay so it stays free.** Crew copy speaks to the Mission Patron:
   what their support keeps open for others. Never guilt, never a wall.

### 2f. The Builders (the Space side)
People who run a Space are mostly women, mostly solo, often part-time, often in
a second career. Their shared pains: finding clients, uneven income, too many
tools, burnout. Write to them in the same plain voice. A Builder is also a
Seeker who happens to run a practice.

| Archetype | Who | Comes for | Tier path |
|---|---|---|---|
| Portfolio Teacher | Women 28 to 45 teaching at several studios, part-time | A page, workshop tickets, a student list they keep | Free Space, then Business |
| Second-Act Practitioner | Career-changers 45 to 62: coaches, bodyworkers, energy workers | Booking, intake, a CRM with notes | Free Space, then Business |
| Studio Keeper | Owners of studios with 1 to 10 staff | Schedule, memberships, staff seats, migration help | Business, then Collective |
| Network Steward | Leaders of many small groups and small nonprofits | One home for many groups, dues, donations | Non Profit or Collective |

Their own words are added here only from real practitioner conversations.

### 2g. Archetype names are internal
Archetype names are for planning, briefs, analytics and AI prompts. They never
appear in member-facing copy. Copy speaks to the person in their own words.

---

## 3. The voice: one voice, every surface

The persona: **a camp counselor you actually respect.** Takes the person
seriously, takes the activity lightly. Equal parts Calm (the register of a good
friend or a steady therapist: plain, warm, problem-first) and Duolingo (playful,
expressive, your biggest cheerleader, persistent without being creepy), plus one
ingredient neither has: **dirt under the fingernails.** Frequency is an in-person
brand. Copy can and should reference physical reality: rain, folding chairs,
someone bringing oranges, the awkward first five minutes. Concrete detail is the
antidote to kitsch.

### 3a. The cardinal rule
**Proper nouns carry the magic. Sentences stay plain.**

The world-building lives in the locked nouns: Zaps, Gems, Quest, Journey, Circle,
Outpost, Ghost, Catalyst, the Vault. The sentences around those nouns sound like
a person texting a friend.

- GOOD: "You earned 40 Zaps this week."
- GOOD: "New Quest drops Monday."
- BAD: "Feel the current of your circle's energy."
- BAD: "Tap into the frequency of connection."

### 3b. Never narrate the reader's feelings
Do not tell people what they are feeling or will feel. Name the situation
accurately and let them feel whatever they feel. Describing someone's inner
experience for them is the number one cause of cringe.

- GOOD: "Four practices for the weeks when everything is too loud."
- BAD: "Feel the stillness wash over you as you drop into presence."
- GOOD: "Day 3. You showed up again. That's the whole thing."
- BAD: "You're radiating commitment energy."

Allowed softeners (sparingly): "You might notice..." / "Some people find..." /
"Try it and see what happens." These offer, they don't prescribe.

### 3c. Voice qualities (test every piece against all four)
1. **Plain.** Simple words, short sentences, active voice. If a 12-year-old
   wouldn't understand the sentence, rewrite it.
2. **Warm.** On the reader's side, never above them. Zero shame, zero guilt
   mechanics, even in streak/retention copy.
3. **Playful.** Jokes are structural, not decorative. Deadpan beats whimsy. The
   game is allowed to be a game.
4. **Real.** Physical, specific, honest about effort and time. Numbers over
   adjectives. "Five minutes before coffee" beats "a transformative moment."

### 3d. The skeptic test (the law)
Read the copy aloud to an imaginary person who would say "that's not really my
thing." If it doesn't still sound like it could be for them, rewrite it. This
applies to every card, headline, notification, and meta description. Depth is
allowed inside pages. The surface always passes the skeptic test.

---

## 4. Tone map: tone flexes, voice doesn't

| Surface | Tone | Model |
|---|---|---|
| Game UI, notifications, rank/Zap copy | Light, quick, deadpan-playful | Duolingo |
| Practice pages, Journey intros | Slow, plain, unhurried, zero hype | Calm |
| Website marketing pages | Campfire-honest: name the problem, show the thing | Hybrid |
| Blog / SEO articles | The smart friend who knows the research | Calm + cited facts |
| Social posts | Show, don't tell. Real humans, real rooms, minimal caption | Duolingo energy, IRL proof |
| Email | Like a friend confirming plans. Short. | Hybrid |
| Mission / movement copy | Plain and rationed. See 6d. | Neither: just honest |
| Errors, empty states, boring copy | Still in voice. Personality lives here too | Duolingo |

**Notification rules specifically:**
- Helpful, motivating, persistent. Never guilt, shame, threats, or fake urgency.
  (We deliberately reject Duolingo's guilt mechanics; our brand promise is the
  opposite of manipulation.)
- Every notification earns its interruption: it contains a fact (Zaps earned,
  Quest dropping, Circle meeting tonight) or a 5-minute invitation.
- GOOD: "Your Circle meets tonight at 7. Bring nothing."
- BAD: "Don't lose your streak! Your Circle misses you!! 😢"

---

## 5. The word library

### 5a. Use
- Concrete nouns: room, table, walk, breath, chair, street, morning, coffee
- Plain verbs: show up, sit, try, come back, meet, start, breathe, walk
- Honest time asks: "five minutes," "before your coffee," "on the drive home"
- Numbers: "30 seconds of cold water," "a 7-day streak," "40 Zaps"
- The locked game and community nouns (see `docs/NAMING.md`), capitalized exactly
  as canonized
- Sensory outcomes: "your jaw unclenches," "your shoulders drop"
- The reader's own pain language (Section 2a/2b verbatim phrases)
- The spirit line and its parts (§1): "get people together," "do things on
  purpose," "on purpose," "doing life on purpose." A Circle is friends doing life
  on purpose. Repeatable because it stays plain, so keep it plain.

### 5b. Avoid: vibe-verbs and narrated feelings
feel the current · tap into · drop into · sink into · tune into yourself · lean
into · hold space · feel the pulse · ride the wave · let it flow · align with ·
activate your · awaken your
("tune in" is allowed ONLY as the functional verb for Channels.)

### 5c. Avoid: wellness jargon at the surface layer
somatic · vibrational · energetic · embodied · sacred · ancient wisdom · chakra ·
prana · meridian · nervous system regulation (surface copy says "calm down fast"
or "stop feeling wired"; the science lives inside pages).
These words are permitted DEEP inside practice pages and articles, after the
plain entry has done its work. Never on cards, headlines, notifications, social
captions, or meta descriptions.

### 5d. Avoid: hype economy words
unlock · elevate · transform your life · limited time · level up your life ·
hack · optimize · supercharge · journey (as a verb or vague noun; "Journey" is
exclusively the canonical game object) · revolution (see 6d) · tribe · fam ·
community (as filler; show it instead of saying it)

### 5e. Punctuation and mechanics
- No em dashes in brand copy. Use periods, commas, or restructure.
- Sentence case for headlines and buttons. No Title Case Marketing Speak.
- Contractions always. "You're" not "you are."
- Emoji: rare, single, only in game UI and social. Never in practice pages.
- Exclamation points: max one per screen, usually zero.

---

## 6. Copy frameworks

### 6a. The three-layer model (Journeys, Practices, features)
Every Journey and major feature ships three layers of copy:
1. **The card** (8 to 12 words): the problem it solves, pure outcome, no method,
   no philosophy. Written for the skeptic. Example: "You're constantly
   distracted. This is for that."
2. **The one-liner** (~25 words): who it's for in plain language, and what you'll
   notice after a week. Still no method.
3. **The intro** (full body): the depth. Mechanism, context, science, and the
   spiritual frame if it has one. This is where the full Frequency voice and the
   deeper vocabulary are allowed.

The card and one-liner are for the "what could it hurt?" person. The intro is for
whoever the card made curious.

### 6b. The five-minute rule
Every Journey's first Practice must be completable in under 5 minutes in its
Initiate form. Entry copy always wins the "what could it hurt?" calculation:
state the time ask, state the concrete act, promise nothing mystical.

### 6c. Tier copy (Initiate / Adept / Master)
Tiers describe the form of the practice, never the person's skill. Never write
"for beginners." Write the size of the ask:
- Initiate: "The 5-minute version. Just the act."
- Adept: "The full practice." (default)
- Master: "The deep end. When you're ready to give it real time."

### 6d. Movement language: the ration rule
The mission (a movement of community connection; catching people when systems
fail) appears ONLY in: the manifesto/about page, founder letters, and rare
keynote moments. Maximum one movement-register sentence per piece, and it must be
plain. Members say "revolution"; the brand almost never does.
- ALLOWED (about page): "We think the answer to the loneliest era in history is a
  folding chair with your name on it."
- BANNED (anywhere): "Join the revolution of vibrational community."

### 6e. Honesty about the game
The Quest lowers the barrier to practices people would resist if labeled. We are
open about this when asked; the on-ramp is friendly, never bait. Copy can wink at
it: "Yes, it's meditation. We just made it a game so you'd actually do it."
Self-awareness builds trust with this demographic.

### 6f. Proof over claims
Wherever possible, show real numbers and real humans instead of adjectives. "212
Circles met last week" beats "a thriving global community." First-party stats are
also our strongest SEO/AIO asset (Section 8).

---

## 7. Content strategy: two tracks, one funnel

The community exists everywhere; the first Lab does not exist yet. Therefore
content leads with the community and the pain it solves. The funnel and the
growth model are the same shape: Foundation/community content seeds a market, the
Outpost and Lab anchor it later.

### 7a. Seeker track (top of funnel, global, informational)
Pain-first pillar clusters. Each pillar is one deep page surrounded by supporting
articles, all internally linked:
1. Adult friendship ("how to make friends as an adult," "why is it so hard to
   make friends after 30," "I have no friends")
2. Always-wired stress ("how to calm down fast," "can't switch off," "always
   tired but wired")
3. Loneliness and belonging ("feeling lonely but not alone," "high functioning
   loneliness," "third places near me")
4. Life after the feed ("how to quit doomscrolling," "social media replacement,"
   "dopamine detox that actually works")
5. New-city connection ("how to meet people in a new city," city-specific
   variants as Circles open)
6. Something to do (the activity-first reader, §2e rule 1): "run clubs near
   me," "sober social events," "things to do alone on a weeknight," "sauna
   meetups." Lead with the activity; the friendship is on the way.
7. Plain and proven (the evidence-first reader): "does breathwork actually
   work," "meditation without the woo," "simple breathing timer." Cite the
   research inside the page, keep the surface plain.

Target the pain, never the practice. The practice is the answer inside the page,
not the keyword.

### 7b. Leader track (activation, the growth engine)
For the Host-Connector (already the one who organizes, has never hosted on
purpose):
1. How to host a gathering that doesn't fizzle
2. How to start a Circle (the rails: format, script, first-night plan)
3. Why groups die (structure, not charisma)
4. Becoming a Host: what Crew training actually involves
5. Hosting with kids in the room or at home

For the Gathering Host (already runs something that is growing):
1. Making a recurring gathering sustainable (a rhythm, a co-host, a list)
2. When and how to start charging, plainly
3. Moving from a group chat to a Space

Frame: "You don't have to build a community. Host one Circle. We'll hand you the
format." Empower the natural connectors; never co-opt them.

### 7c. Local/programmatic layer
City and neighborhood pages follow real Circles into each market: "Circles in
Encinitas," "ways to meet people in Carlsbad." Only publish where real activity
exists. Honest thinness beats fake breadth.

### 7d. Positioning vocabulary for SEO
Own "third space / third place" and the connection-pain cluster. Do NOT chase
head-term "wellness" keywords; capture wellness-adjacent terms (breathwork,
meditation, yoga, mindfulness) only at the practice/article level, always entered
through the pain frame.

---

## 8. SEO + AIO/AEO rules

AIO (AI Optimization, also called AEO/GEO) means structuring content so answer
engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) cite Frequency
when people ask the questions our demographic asks. Our demographic
disproportionately asks machines these questions late at night. AI citation is a
primary acquisition channel, not a side bet.

### 8a. Page structure (applies to every article and pillar)
- H1 states the topic as the reader would search it.
- H2s are the literal questions people ask, in their words.
- The first 1 to 3 sentences under each H2 answer the question completely and
  plainly. Depth and nuance follow after the direct answer.
- One concept per section. Never mix a definition with a how-to in the same
  block. Don't bury key facts in long narrative.
- Specific and actionable beats abstract: steps, numbers, examples.
- End articles with a real FAQ section.

### 8b. Technical requirements
- FAQPage schema on every article with an FAQ. HowTo schema on guides.
  Organization + LocalBusiness schema (when Outposts/Labs exist). Event schema for
  public Circle events.
- Question-formatted title tags and meta descriptions where natural.
- Fast pages, crawlable, clean internal linking within each pillar cluster.
- Images and short video on key pages (AI Overviews are multimodal).

### 8c. The first-party data moat
Publish original findings from our own data: WAM/return-frequency stats,
Spiritome research results, circle attendance patterns, what predicts whether a
new member returns. Answer engines cite original sources; nobody else can publish
our numbers. Target: one original-data piece per quarter, each built to be THE
citable source for one question.

### 8d. Off-page AIO
- Reddit and YouTube are heavily ingested by answer engines. Maintain authentic,
  helpful presence in adult-friendship and city subreddits (genuinely useful
  answers, never astroturf) and publish video answering the core pillar
  questions.
- Earn mentions in original-reporting press and local publications; answer
  engines weight authoritative coverage.

### 8e. E-E-A-T
Bylines with real credentials where relevant, cite sources in articles, show real
photos of real gatherings, publish the research partnerships. Connection and
mental wellbeing content is held to a higher trust bar.

### 8f. Health claims line (hard rule)
Healing language stays in the emotional and relational register in marketing
copy: less alone, calmer, steadier, friendships, hope. No medical claims, no
"treats anxiety/depression," no cure language. Clinical findings appear only in
research content, carefully cited. This is both a Google trust issue and a
liability issue.

---

## 9. Metrics (what content success means)

**Primary:**
- AI citation share: how often answer engines cite/recommend Frequency for the
  pillar questions (manual prompt audits monthly + AI-referral traffic in
  analytics)
- Organic signups attributed to content, and crucially their RETURN rate (WAM is
  the north star; content that brings people who don't come back has failed)
- Branded search volume growth

**Secondary:**
- Pillar keyword rankings and featured-snippet/AI Overview presence
- Local pack rankings and Business Profile actions (once Outposts exist)
- Newsletter and Channel joins from content
- Leader-track conversions: article to Crew interest to Host

**Never optimize for:** time on site, pages per session, or any engagement metric
that rewards keeping people on screens. We are the antidote to the feed; our
analytics must not quietly become the feed.

---

## 10. Quick review checklist (run on every piece of copy)

1. Which reader and archetype is this for? (Seeker or Latent Leader, then the
   archetype in §2d or §2f. The archetype name stays out of the copy.)
2. Does the surface pass the skeptic test?
3. Are the proper nouns doing the magic while the sentences stay plain?
4. Did we narrate the reader's feelings anywhere? Cut it.
5. Any vibe-verbs, surface jargon, or hype words from Section 5? Cut them.
6. Is there a concrete detail, number, or honest time ask?
7. Is every name compliant with `docs/NAMING.md`?
8. No em dashes, max one exclamation point, sentence case?
9. If it's an article: question H2s, direct first answers, one concept per
   section, FAQ + schema?
10. Does it make any health claim? Rewrite to relational language.

---

*Companion docs: [`docs/NAMING.md`](NAMING.md) (terminology canon, always wins on
names). Decision record for §2: ADR-1715 (two readers, eleven archetypes).
Owner: Daniel (Vision Steward). Last locked: June 2026; §2 re-locked 6 October 2026.*
