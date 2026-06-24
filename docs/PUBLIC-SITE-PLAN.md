# Public Site & Funnel Plan

> **Status: PROPOSED (June 2026).** Companion to [`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md)
> (voice, always wins on register) and [`docs/NAMING.md`](NAMING.md) (terminology,
> always wins on names). Grounded in the feature survey, the existing-public audit,
> and 2024 to 2026 landing/funnel/SEO research.
>
> **Punctuation hard rule:** no em dashes or en dashes anywhere in this plan or any
> copy it specifies. Periods, commas, parentheses, or rewrite.

**Legend:** ✅ done (exists, keep) · 🛠 improve (exists, leaks, fix it) · 🆕 new (build it)

---

## The answer first

The public site exists to **turn the right stranger into someone who shows up Thursday.**
Not a signup. Not a session. A folding chair with their name on it, occupied, again.

Everything ladders to that one conversion. We run **two funnels, never one**: the Seeker
(find your people, route them to `/circles`) and the Latent Leader (host one Circle, we
hand you the format from `/programs`). Five intake personas branch off those two doors as
the first, lowest-friction question on `/start`. The funnels and the page-structure
playbook below are the working core of this plan; everything else supports them.

**Guiding principles (from the research, all inside the locked voice):**

| Principle | What it means here | Source |
|---|---|---|
| Optimize for return, not acquisition | Stat bars lead with "Circles met last week" and "showed up Thursday," never signup counts. Never measure time on site. | CONTENT-VOICE §9; Amplitude 7% rule |
| Match awareness stage to surface | SEO pillars are Problem-Aware (reader's words, no product name). How-it-works/Quest are Solution-Aware. Pricing/start/join are Most-Aware. | Schwartz; CONTENT-VOICE §8 |
| Answer-first, one concept per section | Each H2 block stands alone and is liftable verbatim by an answer engine. | RAG passage retrieval; AEO 2026 |
| Name the situation, never the feeling | "A hundred contacts. No one to call on a Tuesday." Never "you feel lonely." | CONTENT-VOICE §3b; PAS-minus-agitate |
| Proof over claims | Real photos of real rooms, full first names, first-party return stats. Also our E-E-A-T and AI-citation moat. | CONTENT-VOICE §6f, §8c |
| Anti-culty trust = transparency + humans | Self-aware about the game ("we made it a game so you'd actually do it"), honest thinness, real founder. | CONTENT-VOICE §6e; wellness-skeptic 2025 |
| Honest thinness beats fake breadth | City pages only where real Circles exist; empty states recruit a leader, never fake listings. | CONTENT-VOICE §7c; Timeleft depth-before-breadth |
| Soft CTA top of funnel, hard CTA only at commercial intent | Pain pages route to "find a Circle near you," not a signup wall. | message-match; intent mapping |

---

## The audiences + their pains

Two locked readers carry the brand. Five intake personas branch off them and are the
single decision at the top of `/start`.

### The two locked readers

| Reader | Verbatim pain | Message that lands | Feature(s) that relieve it | First action that proves value |
|---|---|---|---|---|
| **The Seeker** (high-functioning lonely) | "I have a hundred contacts and no real friends" · "It's hard to make friends as an adult" · "I moved here and don't know anyone" · "I'm always wired / I can't switch off" · "I doomscroll and I hate it" · "I'm fine but I'm not okay" | "Making friends after 30 is genuinely hard. Here's a room that meets every week, near you. No app to doomscroll." | Circles (`/circles`), Events (`/events`), Network (`/network`), Practices + Mindless (`/practices`, `/on-air`), Feed proof-of-life (`/feed`) | RSVP one Circle near them this week (leading), then attend (the true aha) |
| **The Latent Leader** | "I want to bring people together but I don't know how" · "I tried hosting something and nobody came back" · "I don't want to do this alone" | "You don't have to build a community. Host one Circle. We hand you the format, the first-night script, and backup." | Programs (`/programs`), Circles create flow (`/circles`), Messages Rooms (`/messages`), Crew dashboard (`/crew`), Hubs/Guides (`/hubs/[slug]`) | Read the host format, then start one Circle with a standing time |

### The five intake personas (branch points on `/start`)

| Persona | The pain | Message that lands | Feature(s) | First action |
|---|---|---|---|---|
| **Visitor / Seeker** | "Find my people, near me, this week." | "Three Circles meet near you this week. Save one." | Circles, Events, Discover, Network | Save/RSVP a nearby Circle |
| **Practitioner** (coach/healer) | "Fill my room and sell what I offer without another platform." | "A branded home, a booking calendar, and a place your people already are." | Space Profiles (`/spaces/[slug]`), Availability Booking, Space CRM, QR Studio | Claim a Space, set first bookable window |
| **Partner / Business** | "Turn foot traffic into regulars." | "Members walk in, scan the plaque, become regulars. Real-world, not a digital claim." | Partners + Offers (`/partners`), Memberships, Check-in, Space Email | Claim Space, set up a check-in node |
| **Community Builder / Leader** | "Host one thing that sticks." | "Host one Circle. We hand you the format. You are not alone in this." | Programs, Circles, Crew, Hubs | Start one Circle from the first-night format |
| **Investor / Lab Champion** | "Put a Lab in my town." | "See where a Lab could open, and who is already showing up there." | The Lab page, Nexuses/Outposts (`/nexuses/[slug]`), Resonance/first-party data | Request a real contact path + see local density |

---

## The funnels

Two primary funnels, every step bound to a shipped feature and route. The current public
surface is **inverted at the top**: strong acquisition pages all soft-close into the
narrow `/beta` form, with no path to browse `/discover` first. Each fix below names the
exact route it changes.

### Funnel A: The Seeker

| Step | Surface / route | The job | Current leak | Fix |
|---|---|---|---|---|
| Entry | `/` home, SEO pillars 🛠/🆕, `/discover` ✅ | Name the pain in their words, prove it's real | Pillars hedge ("the beta"); pillar SEO clusters do not exist yet | Build pain-first pillar pages (H1 = their query); home hero leads with one real Circle photo + one CTA |
| Value moment | `/discover/circles`, `/circles`, `/discover/events` | "A room near me, this week" | Pillars redirect to root/beta instead of letting skeptics browse | Every pillar gets a soft CTA: "Find a Circle near you. Bring nothing." routing to `/discover` |
| Proof | Live proofs on `/` ✅, `/feed` ✅, real gathering photos | "It's real and active" | Proof is present but signup-count framed in places | Lead stat bar with "212 Circles met last week" and "showed up Thursday," real first names |
| CTA | `/start` 🛠 self-ID, `/join/[token]` ✅ | One low-friction next move | `/start` flows mostly unpublished; full nav on join surface | 4-step self-ID quiz, account last, ~1:1 attention ratio, magic-link only |
| Activation | `/crew` Quest map, first RSVP, first Practice | Do one real thing in week one | Wizard ends at `/feed` (vanity completion) | Re-point wizard terminal to "Circles near you this week"; activation = RSVP in 7 days, attend = aha |

### Funnel B: The Latent Leader

| Step | Surface / route | The job | Current leak | Fix |
|---|---|---|---|---|
| Entry | Leader landing 🆕, leader-track articles 🆕 | "Permission + rails" | Leader track is under-narrated; only a passing home line | Build a leader landing as strong as the Seeker home, plus the four §7b articles |
| Value moment | `/programs` ✅, "Why groups die" guide 🆕 | "Structure, not charisma" (Priya Parker frame) | Programs exists but has no public on-ramp from a story | Lead with "Your last event didn't fizzle because of you" then hand the format |
| Proof | Real Host stories 🆕, Hub pages `/hubs/[slug]` ✅ | "Real people did this with these rails" | No Host testimonials on the public surface | Add bylined Host stories with photos; show Hub density |
| CTA | `/start/[flow]` (builder branch) 🛠 | "Start one Circle" / "Become Crew" | Builder branch content light | Branch terminal action to "Get the first-night format" and Circle create |
| Activation | `/circles` create, `/crew` Tasks, `/messages` Rooms | Host a standing Circle, not alone | No co-host recruitment prompt | Recruit a co-host (Meetup pattern); first Trophy attaches to a real gathering |

---

## The public sitemap

Grouped by funnel stage. Audit is vs what exists today under `app/(marketing)/`,
`app/(help)/`, `app/discover/`, `app/onboarding/`, `app/join/`.

### Top of funnel: discovery / SEO (Problem-Aware, soft CTA only)

| Page | Status | Audience | One-line purpose |
|---|---|---|---|
| `/` home splash | ✅ keep, 🛠 lead with joinable action | Seeker | Place to People to Path; one real CTA, live proof |
| `/discover` + `/discover/{circles,events,topics,practices,journeys,partners}` | ✅ keep | Seeker, AI engines | Browse real activity with no signin; AEO surface |
| `/friendship-as-an-adult` (pillar) | 🆕 | Seeker | "Why is it so hard to make friends after 30" answered, then a Circle |
| `/cant-switch-off` (pillar) | 🆕 | Seeker | "How to calm down fast" answered, then Mindless + a Circle |
| `/loneliness` (pillar: high-functioning loneliness, third places) | 🆕 | Seeker | Own "third place / third space" + belonging cluster |
| `/life-after-the-feed` (pillar) | 🆕 | Seeker | "How to quit doomscrolling" answered, then real plans |
| `/new-in-town` (pillar) + city variants | 🆕 | Seeker | "How to meet people in [city]" answered, gated on real Circles |
| `/research` (first-party data) | 🆕 | Seeker, AI engines, press | One citable original-data piece per quarter (return rate, weeks-to-belonging) |
| `/discover/[city]` programmatic | 🆕 (activity-gated) | Seeker | "Circles in Encinitas," real names + counts + local FAQ only |

### Middle of funnel: how-it-works / proof (Solution-Aware)

| Page | Status | Audience | One-line purpose |
|---|---|---|---|
| `/the-community` | ✅ keep, 🛠 add browse-don't-redirect | Seeker, Leader | The Pillars, Channels, Circles; ritual-first ("meets Thursday at 7") |
| `/the-quest` | ✅ keep | Seeker | The game loop, framed self-aware; first Trophy = real gathering |
| `/the-lab` | ✅ keep | Seeker, Investor | The third place; physical specifics competitors can't offer |
| `/how-it-works` | ✅ keep, 🛠 three-step plan | Seeker | The plan: Find a Circle / Show up Thursday / Come back |
| `/demo` | ✅ keep | Skeptic | "Watch a Circle" transitional CTA for the not-yet-ready |
| `/about` | ✅ keep | All, Investor | Moonlight Beach origin, trust, the rationed movement line |
| `/lead` (Latent Leader landing) | 🆕 | Latent Leader | Permission + rails; as strong as the Seeker home |
| `/lead/host-a-gathering` | 🆕 | Latent Leader | "How to host a gathering that doesn't fizzle" (HowTo) |
| `/lead/start-a-circle` | 🆕 | Latent Leader | The rails: format, script, first-night plan (HowTo) |
| `/lead/why-groups-die` | 🆕 | Latent Leader | Structure not charisma (Priya Parker frame) |
| `/spaces` overview | 🆕 (public marketing view) | Practitioner, Business | Branded home + booking + CRM for creators |
| Host / member stories | 🆕 | All | Bylined real proof, photos, full first names (E-E-A-T) |

### Bottom of funnel: join / activation (Most-Aware, hard CTA)

| Page | Status | Audience | One-line purpose |
|---|---|---|---|
| `/start` + `/start/[flow]` | 🛠 rebuild as self-ID quiz | All 5 personas | One decision (who are you), then one next action per branch |
| `/join/[token]` | ✅ keep | Referral | Inviter-personalized Circle invite; strongest referral lever |
| `/beta` + `/beta/confirm` | ✅ keep (until GA) | Convinced visitor | Founding cohort signup, double opt-in |
| `/pricing` | ✅ keep, 🛠 add "what membership funds" detail | Seeker, Leader | 3 transparent tiers; access not extraction |
| `/onboarding` + `/onboarding/beta` | 🛠 trim to handle + region, branch by persona | New signups | Persona-branched first action, terminal = "Circles near you" |

---

## Page structure playbook

The reusable kit: one section-by-section blueprint per page type, so no page is
hand-rolled. Canonical scroll order is a sequence of answers to the visitor's question at
each scroll depth (Replo, involve.me, StoryBrand). Voice rules are inline; build with the
templates in `@/components/templates` per PAGE-FRAMEWORK. **Test every fold on a real
phone (83% of traffic).**

### Home / hero (`/`)

| Section | Its job | What goes in it |
|---|---|---|
| Hero | Answer "what is this, who's it for" in 10-20s | Plain pain-or-promise headline (6 to 12 words), subhead naming the reader + mechanism (15 to 25 words), one real Circle photo (never stock or "energy" art), one direct CTA, a first-party stat ("212 Circles met last week"). Proper nouns carry the magic; sentences stay plain (§3a). |
| Problem | Reflect the situation in their words | One verbatim pain line. Name the situation, never the feeling (§3b). No agitation (PAS minus agitate). |
| Empathy / guide | Position Frequency as guide, member as hero | "Making friends as an adult is genuinely hard. So we built the rails." |
| How it works (3 steps) | Make yes easy | "Find a Circle near you." / "Show up Thursday. Bring nothing." / "Come back." |
| Proof | "It's real" | Live counts, real gathering photos, full first names, short raw clips near the CTA. |
| Offer + risk reversal | Remove the last objection | "Free to start. Bring nothing. Leave whenever. Ghost is a real status, not a guilt trip." Social risk reversal, not money-back. |
| FAQ | Kill objections inline | "Is this culty?" "I'm not spiritual." Answer-first, plain. |
| Closing CTA | One path out | Same CTA verbatim as hero. One transitional soft CTA ("Watch a Circle" to `/demo`). |

### Persona landing (`/lead`, `/start/[flow]` branches)

| Section | Its job | What goes in it |
|---|---|---|
| Hero matched to the click | Message match (scent trail) | Repeat the self-ID label they clicked. Builder lands on "Host one Circle," not the Seeker hero. |
| The one job | JTBD: one functional job per surface | Leader: "You don't have to build a community. Host one Circle." |
| The rails | Reduce anxiety (the blocking force) | Format, script, first-night plan, backup. Name the awkward first five minutes out loud. |
| Proof | Anti-culty trust | Real Host stories, photos, honest counts. |
| Single CTA | One next action | "Get the first-night format." Risk reversal beneath: "We're in it with you." |

### How-it-works (`/how-it-works`)

| Section | Its job | What goes in it |
|---|---|---|
| Three-step plan | A complicated plan kills action (StoryBrand) | Exactly three steps, shown visually. |
| Success picture | Show the modest, concrete After (BAB capped at human scale) | "A standing Thursday thing. Same chairs, mostly the same people." Never "transform your life" (banned §5d). |
| Stakes | One honest, rationed line | At most one line; no twisting the knife. |
| FAQ + soft CTA | Satisfy research intent | "Find a Circle near you." |

### Pricing (`/pricing`)

| Section | Its job | What goes in it |
|---|---|---|
| Tier table | 2 to 3 tiers, access not charity | Member (free forever), Crew ($10/mo, free during beta, founder-locked), Pay-It-Forward. Scannable table, check icons, semantic tokens (no hardcoded hex). |
| What it funds | Anti-extraction proof | Concrete operating detail: heating the thermal circuit, insurance, the room's lights. Where money goes, not abstractions. |
| Risk reversal | Defuse | "No card today. Founder pricing locked for life. Leave anytime." |
| FAQ | "Is leadership for sale?" | "Earned, not bought." No fake scarcity, no countdowns. |

### Feature / benefit page (`/the-quest`, `/spaces`)

| Section | Its job | What goes in it |
|---|---|---|
| Pain-frame hero | Enter through the pain, not the feature | "I need something to pull me off the screen." |
| The mechanism (Solution-Aware) | Now name the proper noun | Zaps, Gems, Journey, Trophy. Self-aware honesty (§6e): "Yes, it's meditation. We made it a game so you'd actually do it." |
| One concept per section | AEO + scannable | Each benefit its own block, liftable verbatim. |
| Proof + soft CTA | Show it working | Real numbers, then "See what a month of the Quest looks like." |

### Local / SEO page (pillars + `/discover/[city]`)

| Section | Its job | What goes in it |
|---|---|---|
| H1 = the search query | Message match | The reader's exact words ("How to make friends in Carlsbad"). |
| Answer-first block | Win the AI citation | First 1 to 3 sentences fully answer, then depth. One concept per section (§8a). |
| Real local data | Pass scaled-content-abuse bar | Real Circle names, real attendance counts, local FAQ, real photos. "Remove the city name, is it still useful?" |
| Empty state (if thin) | Honest thinness | Recruit a Latent Leader to seed the city; never fake listings. |
| FAQ + schema | AEO | FAQPage + Event schema, soft CTA to `/discover`. |

### About / trust page (`/about`)

| Section | Its job | What goes in it |
|---|---|---|
| Origin story | E-E-A-T, "they learned" | Moonlight Beach 2020: 500+ mornings, the collapse, the deliberate rebuild. |
| Values | Anti-culty | Guru-free, leaderful, pay-it-forward, third-place. |
| The rationed movement line | One per piece, plain (§6d) | "We think the answer to the loneliest era in history is a folding chair with your name on it." |
| Human behind it | Trust bar for wellness | Founder letter, real credentials, real photos. |

---

## Member-facing informational pages

The in-app informational layer that retains and activates existing members. Today the
Help Center is skeletal ("articles coming soon"), a major retention leak: members with
tactical questions have nowhere to land, and help articles are a primary SEO/AIO asset.
Structured by member lifecycle.

### New (joined, not yet shown up)

| Page | Status | Lifecycle job |
|---|---|---|
| `/help/getting-started/what-happens-at-a-gathering` | 🆕 | Defuse the "is this awkward" anxiety before first attend |
| `/help/getting-started/how-do-i-rsvp` | 🆕 | The literal first action |
| `/help/getting-started/what-if-i-miss-a-week` | 🆕 | "Ghost is a real status, not a guilt trip" |
| `/help/getting-started/what-is-a-circle` | 🆕 | Define the core unit (answer-first, schema) |
| In-app "Your first week" checklist (`/feed`) | 🆕 | Endowed-progress: step 1 pre-checked, steps tied to RSVP/attend, Zaps as fact not guilt |
| `/onboarding` daily Dispatch from Vera | ✅ keep | "I want to show up but don't know what to do today" |

### Practicing (showing up, building the habit)

| Page | Status | Lifecycle job |
|---|---|---|
| `/help/the-quest/how-zaps-work` | 🆕 | "Real life is the high score" explained plainly |
| `/help/the-quest/what-is-a-journey` | 🆕 | The 4-week container, swap-freely rule |
| `/help/practices/what-is-mindless` | 🆕 | The timer, Be Still vs Get Moving, the five-minute rule |
| `/help/the-quest/seasons-and-ranks` | 🆕 | Ghost to Master, why it resets (nobody locked out) |
| `/library` + `/programs` | ✅ keep | Curated, working assets; not generic templates |
| `/journal` (Your Record) | ✅ keep | "Proof I was here and what I contributed" |

### Leading (Crew, Host, Guide)

| Page | Status | Lifecycle job |
|---|---|---|
| `/programs` host frameworks | ✅ keep, 🛠 surface from `/lead` | The rails for running and growing a Circle |
| `/help/leading/start-a-circle` | 🆕 | First-night plan, format, backup (HowTo) |
| `/help/leading/why-groups-die` | 🆕 | Structure not charisma; how to get the return |
| `/help/leading/what-crew-training-involves` | 🆕 | The path Member to Crew to Host to Guide |
| Spaces operator help (CRM, Email, Booking) | 🆕 | Practitioner/Business retention; honest "payment coming soon" |

Voice for all member help: question H2s, answer-first, one concept per section, FAQ +
schema, plain sentences, no health claims (relational register only), no em/en dashes.

---

## SEO + AIO strategy

AI citation is a primary acquisition channel; our demographic asks machines these
questions late at night. The killer asset (original research, city content, leader-track
deep dives, help articles) is currently missing.

### Topic clusters / pillar pages

Nine clusters: five Seeker, four Leader. Each is one deep pillar page + 4 to 8 internally
linked spokes. Clustered content drives ~30% more organic traffic and holds rankings
~2.5x longer. Map each query to exactly one canonical page (no cannibalization).

| Pillar | Canonical page | Sample spokes |
|---|---|---|
| Adult friendship | `/friendship-as-an-adult` | "why is it so hard after 30," "I have no friends," "making friends at 40" |
| Always-wired stress | `/cant-switch-off` | "how to calm down fast," "always tired but wired" |
| Loneliness + belonging | `/loneliness` | "high functioning loneliness," "third places near me," "lonely but not alone" |
| Life after the feed | `/life-after-the-feed` | "how to quit doomscrolling," "social media replacement" |
| New-city connection | `/new-in-town` + city variants | "how to meet people in [city]" |
| Host a gathering | `/lead/host-a-gathering` | "why my event fizzled," "recurring events" |
| Start a Circle | `/lead/start-a-circle` | "first-night format," "how to run a small group" |
| Why groups die | `/lead/why-groups-die` | "purpose of a gathering," "host authority" |
| Becoming a Host | `/help/leading/what-crew-training-involves` | "how to lead a community group" |

### Search-intent to page mapping

| Intent | Awareness | Page | CTA |
|---|---|---|---|
| "how to make friends as an adult" | Problem | `/friendship-as-an-adult` | soft: "Find a Circle near you" |
| "third places near me" | Problem | `/loneliness` then `/discover/[city]` | soft: browse |
| "how does Frequency work" | Solution | `/how-it-works`, `/the-quest` | soft: "Watch a Circle" |
| "Frequency pricing" | Most-Aware | `/pricing` | hard: join |
| "how to host a meetup that lasts" | Problem (Leader) | `/lead/host-a-gathering` | soft to `/lead`, then Crew |
| "Circles in Encinitas" | Most-Aware (local) | `/discover/encinitas` | hard: RSVP |

### pSEO opportunities

- City + connection: "ways to meet people in [city]," "Circles in [city]," gated on
  real Circle density (sitemap.ts already activity-gates event hubs; keep that discipline).
- Each city page carries real local data (Circle names, attendance, local FAQ, photos);
  fails the "remove the city name" test = do not ship.
- Empty city states recruit a Latent Leader to seed it rather than fake breadth.

### llms.txt / structured data

- **Audit `robots.ts` first:** explicitly ALLOW GPTBot, ClaudeBot, PerplexityBot,
  OAI-SearchBot, Applebot, Google-Extended. One blocked bot = invisible to that engine.
- Keep the self-maintaining `/llms-full.txt`; add a short curated `/llms.txt` (brand
  summary + key URLs). Agent-context hygiene, **not** a ranking lever (~10% adoption).
- One typed JSON-LD helper, composed not hand-rolled (mirrors PAGE-FRAMEWORK): Organization
  (sameAs + knowsAbout + founder + foundingLocation), Article+FAQPage on articles, HowTo on
  leader guides, Event on `/discover/events`, LocalBusiness on Outpost/Lab pages.
- Pursue a Wikidata item + consistent local press for Knowledge-Graph entity resolution;
  until then AI describes the pain but won't name Frequency.

### Answer-engine wins

- Answer-first chunking: question H2 in the reader's words, a 1 to 3 sentence complete
  answer, then depth, then one concrete Frequency mechanism. Re-indexing runs roughly 2 to
  7 days on Perplexity, 7 to 21 on ChatGPT, 14 to 45 on Claude and Google AI Overviews.
- First-party data moat: one original-data piece per quarter (`/research`), headline the
  stat with method + n, relational register only. The source AI quotes for "do friendship
  groups actually work."
- Off-page: genuinely helpful (never astroturf) Reddit presence in adult-friendship + city
  subs (Reddit is ~40% of AI citations), plus YouTube answering the pillar questions.

---

## Build sequence

Prioritized by funnel lift. Effort is rough (S = days, M = ~1 to 2 weeks, L = multi-week).

### Phase 1: Stop the leaks + open the gate (biggest immediate lift)

| Move | Why | Status | Effort |
|---|---|---|---|
| Audit `robots.ts` to allow all AI crawlers | One blocked bot = invisible to that engine; gates everything | 🛠 | S |
| Rebuild `/start` as 4-step self-ID quiz, account last, magic-link, ~1:1 attention | Persona-branched first action is the single biggest activation lift (+20 to 35%) | 🛠 | M |
| Re-point onboarding terminal from `/feed` to "Circles near you this week"; trim wizard to handle + region | Activation = first RSVP in 7 days, not profile completion | 🛠 | M |
| Add browse-don't-redirect soft CTAs on all three pillar pages and the home hero | Skeptics can explore before joining; fixes the inverted top of funnel | 🛠 | S |
| Lead all stat bars with return proof ("Circles met last week," "showed up Thursday"), real photos | Optimizes for return, the north star; E-E-A-T | 🛠 | S |
| Ship 6 to 8 core Help articles (new-member lifecycle) + FAQ/Article schema | Help is skeletal = retention leak; fastest AI-citation wins | 🆕 | M |

### Phase 2: Build the two missing funnels

- Latent Leader landing `/lead` + the four leader-track articles (HowTo schema). The
  growth engine; currently under-narrated. (L)
- Two pillar pages first (adult friendship, loneliness) as full clusters with answer-first
  chunking and one typed JSON-LD helper. (L)
- "Your first week" in-app checklist (endowed-progress, Zaps as fact). (M)

### Phase 3: Moat + scale

- `/research` first-party data engine, one citable piece per quarter. (M, recurring)
- Activity-gated `/discover/[city]` programmatic pages with real local data. (M)
- Organization schema + Wikidata + local press for entity resolution. (L)
- Remaining pillars + spokes, Reddit/YouTube off-page presence. (L, recurring)
