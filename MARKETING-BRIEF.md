# Frequency — Strategy & Product Briefing (for marketing)

> A self-contained overview of Frequency's strategy and features, written to be handed
> to a marketing brainstorm. Leads with positioning, lays out every feature (built vs
> planned), and ends with a distilled marketing starter. Synthesized from the repo docs
> (`docs/`) and the live codebase.

## 0. The one-paragraph pitch

**Frequency turns shared interests into real-world community — ending the isolation of
connection lived only through a screen.** It's a local, place-based community platform
built as the antidote to the attention-extractive feed. A free, worldwide **Foundation**
gives anyone a place to gather around what they love; a **game** rewards the things that
actually build community — showing up, inviting strangers, backing local life; and
**Labs** builds the physical "third spaces" where it all takes root. **One community, one
game, two engines.** Success isn't measured in screen time but in **the people who
actually practiced together this week.**

Live today at **frequencylocal.com**, currently in **open free Beta**.

---

## 1. The strategy

### Mission (locked)
> **Shared interests into real-world community: a free global mission, a game that drives
> people offline, and physical spaces where it lives.**

### The North Star: Weekly Active Members (WAM)
The single number everything optimizes for: **members who completed ≥1 *verified
real-world practice* (a check-in, an attended session, a logged practice) in a rolling 7
days.** The canonical event is `practice.verified`. This is the spine of the worldview:
**engagement that happened *in the world*, not scrolling.**

### The thesis
The gamification **isn't decoration — it's the engine that drives offline action.**
Rewards are deliberately weighted toward real-world outcomes (showing up, inviting people,
supporting local businesses), so "playing the game" and "building community" are the same
act.

### The two-entity model (the structural core)
Frequency is **one community graph spanning two legal entities**, with money
hard-partitioned between them:

| Entity | Type | Does | Funded by |
|---|---|---|---|
| **Frequency Foundation** | Nonprofit (501c3) | The free worldwide mission: circles, gathering, the anti-loneliness work. The mission is **never gated.** | Donations + grants |
| **Frequency Labs** | For-profit | The physical "third spaces" + commerce: Lab memberships, paid practitioner marketplace, affiliate. | Commerce (Stripe) |

**Three separated rails:** the **community graph** (shared, money-blind) · the
**game/reward ledger** (shared, money-blind) · the **financial ledger** (hard-partitioned
by entity — dollars never commingle). *Points are not money; points are entity-blind,
every dollar is entity-tagged.*

### The growth flywheel (a measurable product surface, not a slogan)
Online community forms → people meet in person (gamified: check in, do your practice, tag
a node, invite a stranger) → local density grows → **density seeds the need for a physical
space** → a Lab opens → memberships fund more in-person practice → more community → the
next town. **The nonprofit creates the demand; the for-profit serves and captures it.** A
PostGIS density/demand heat-map turns "where should the next third space go" into a data
read (and doubles as a grant-funder impact story).

---

## 2. The product model & information architecture

### The spatial model — a fractal, bottom-up gathering ladder
Each tier is a real gathering body with its own cadence; the bigger tiers **emerge** from
clustering, they aren't top-down containers.

| Scope | Plain meaning | Cadence |
|---|---|---|
| **Circle** | The small local group — the atomic unit, a weekly-practice cell | Weekly |
| **Hub** | The neighborhood — the cluster of circles, and itself a gathering body | Neighborhood meetup |
| **Nexus** | The whole area — gathers quarterly (galas); designed to surround a future Lab | Quarterly |
| **Outpost / Region** | Structural ancestry in the breadcrumb (de-emphasized) | — |

**How circles multiply:** **Split** (a circle hits its cap → seeds a child circle; the
cap is framed as a feature: "This circle is nearly full — ready to seed a new one?") or
**Adopt** (someone takes an Interest's program → opens a new circle and becomes its host).

### Member-facing vocabulary (deliberately tiny)
A member only ever needs **two belonging-words: Circle (my group) and Interest/Channel (my
topic).** Everything structural (Hub, Nexus) is met contextually as *places and events*,
never as nav.

**The topics** (7 global Interests): **Spirituality, Movement, Holistic Health, Human
Relating, Activism, Creative, Business Support.** Each holds virtual discussion + a
**program** (curriculum/practices/meetup templates) + a roster of circles running it.

**Virtual is the default floor; in-person is the additive designator (📍)** with a tighter
cap and scarcity cues. In-person is the high-intent path and the engine of geographic
spread.

> ⚠️ **Naming in flux (so you don't trip):** docs are mid-rename on a few terms. Lead with
> these current/canonical ones: **The Quest** = the game; **Zaps/Gems** = the currencies;
> **Circle** & **Interest/Channel** = the member words. Internally there's an unresolved
> tension between "Channels" vs "Interests" for the topic level, and between
> "Arc/Journey/Quest" for the multi-step engine. For marketing copy, treat **Circle,
> Interest, The Quest, Zaps, Gems** as the safe vocabulary.

### Navigation — the member's "worlds"
The current canonical rail organizes around six worlds, nav computed from the member's
roles/hats (not hand-placed):
**Home (Feed) · Community (Circles, Channels, Events) · Practice (Practices, Journeys,
Programs — the WAM engine) · Connect (Messages, Friends, Directory) · The Quest
(Dashboard, Store & Vault) · Manage (role-gated admin).**

---

## 3. Features — fully laid out

The web platform is **substantially built and live** (108 DB migrations, ~90 components,
50+ routes). Here's the full inventory with honest status.

### ✅ Built & shipped today

**Community core**
- **Circles** — create/join, host tools, member rosters, location search, an interactive
  **map** of nearby circles, "claim this circle," lineage ("grew out of…")
- **Channels/Interests** — topical spaces with discussion + memberships
- **Hubs & Nexuses** — neighborhood/regional gathering bodies
- **Events** — calendar, RSVP, recurrence, reminders, **iCal export**, QR check-in
- **Feed** — posts, reactions, threaded replies, @mentions, polls; location-aware ("near
  you") ranking
- **Broadcasts / Dispatches** — the journalistic broadcast channel (with comments, likes,
  polls)
- **Messaging** — DMs, group conversations, rooms; presence/typing
- **People & Profiles** — member directory, profiles, friends, **blocking**, reporting
- **Programs** — content-driven host trainings (4 guides live: *Start Your First Circle,
  Run a Great Gathering, Keep Your Circle Alive, Grow and Split Your Circle*), completion
  tracked as engagement events

**The Quest (gamification — see §4)** — zaps, gems, season ranks, achievements,
challenges, streaks, leaderboard, gem store, QR/NFC/geo check-ins, the Vault surface

**Practices & Journeys** — a practice library, adoption + logging, circle-specific
practices, journey plans (sequenced practice combos with cadence)

**Discovery & marketing site** — public editorial pages (`/the-lab`, `/the-community`,
`/the-quest`, `/how-it-works`, `/about`, `/pricing`), public `/discover` browse, **WYSIWYG
page editing (Puck)** so copy/images/order change with no deploy, **live data blocks**
(real member/event/post counts)

**Onboarding** — passwordless sign-in (magic link + Google), the **Vera AI concierge**
path (live), the **cinematic beta induction** with the "Founder oath," activation funnel
instrumentation

**Help center** — 29 member articles across 6 categories + changelog, AI search (Vera,
RAG-grounded with citations)

**Vera (the AI guide)** — RAG help, onboarding concierge, member-context memory,
encouragement, config console

**Studio (operator cockpit / CRM)** — Contacts, Campaigns, Automations (rules engine),
Segments, Analytics (WAM, practices, activation, deliverability), Agent Console, **The
Market Read** (AI marketing engine), beta management

**Admin console** — ~15 management pages (circles, events, members, roles, gamification
config, moderation queue, QR studio, demo studio, engagement analytics, market intel, Vera
config, help-gaps, beta sequences)

**Partners** — local business directory, offers, redemptions (redemption-on-capture wired)

**Trust & safety** — moderation queue + reporting, per-user blocking, in-app account
deletion, consent/retention, RLS security

**Infrastructure** — durable email outbox (Resend) with webhook close-the-loop +
auto-suppression, cron jobs, GA4 server-side tracking, geospatial (PostGIS),
vector/embedding search

### ⏳ Partial / in progress
- **Reward economy tuning** — the *amounts* (zap/gem values, season balance) are still
  being balanced
- **Programs** — engine + 4 seed frameworks live; more content to come
- **Studio** — agent autonomy and richer pipelines/segments still deepening

### 🔴 Designed but not built (the roadmap)
- **The money layer** — entity-partitioned financial ledger, **personas** (verified
  "hats": practitioner/business/affiliate), **Stripe Connect**, the freemium **Vault
  cash-in** & membership tiers
- **The Collective** — members host **paid** meditations/courses (Insight-Timer model);
  the *first* commerce build
- **Local Marketplace** — Foundation, **no fee**, geolocated local goods/swap (likely
  arrange-offline, no in-app payment)
- **Donations & Grants** — the nonprofit funding rail
- **Affiliate program** — referral → commission → payout
- **Lab Spaces** — gym-style SaaS for the physical facility network; Lab memberships
- **Native mobile app** (Expo/React Native) — the eventual *primary doorway*, a thin
  client over the proven web contract
- **Density/demand expansion read-model** — "where to seed the next Lab"

### The build sequence
**A. Harden to a launchable free Beta** ✅ → **B. Free Beta + prove product-market-fit**
(current — no money moves) → **C. Two parallel tracks: mobile app + money foundation
infrastructure** → **D. Money verticals switch on** (Collective first, then freemium/Vault,
affiliate, donations, Lab Spaces). During Beta, **no money moves** — the entire commerce
layer is parallel infrastructure, not a blocker.

---

## 4. "The Quest" — the gamification engine (the differentiator)

A seasonal game (**13-week cycle aligned to the natural calendar**) that resets each
season. The whole thing reduces to one pipeline: **SOURCE → VERIFY → LEDGER → RULES →
REWARD**, with server-authoritative verification (the client is never trusted).

### Two currencies, split by *where the activity happens*
| | **Gems** 💎 | **Zaps** ⚡ |
|---|---|---|
| **Is** | On-platform currency; the **spendable, durable** one | In-person/external currency; **seasonal XP** that drives ranks |
| **Earned by** | Posts, comments, reactions, logins, RSVPs | Outreach, invites, in-person events, node check-ins, business taps |
| **Spendable?** | Yes — buys badges/cosmetics, trades for physical merch | No — it's XP; converts to gems at season end |

### Season rank ladder
**ghost → runner → operative → agent → conduit → luminary** (driven by seasonal zaps;
thresholds ~100 / 300 / 750 / 1500; *luminary* is a manual, challenge-gated honor). At
season end, a rank-based share of zaps **converts to gems**, a **trophy is minted**, and
counters reset (so a long-time player keeps loot + status, never an unfair permanent lead).

### Physical-world triggers ("nodes")
**QR codes, NFC plaques/merch tags, and geocache "ghost nodes."** Server verifies node
validity window, signed payload, capture rule (once-per-user/global), and **PostGIS
proximity** before granting. A proximity-verified check-in also counts as
`practice.verified` (the WAM event) — *except* purely commercial business taps. There's a
full **QR Studio** for authoring beautiful, retargetable codes (one printed code,
destination changes in the DB, no reprint), personal member codes
(connect/referral/gift-a-zap), and scavenger-hunt campaigns.

### The Store & the Vault
- **Store** — spend gems on digital badges/cosmetics + physical merch trades
- **The Vault** (freemium model, planned) — **the game accrues for everyone, locked until
  claimed.** Everyone is already "playing"; non-members just can't *cash in*. Becoming a
  member converts the Vault to gems + a lifetime rank. (Anti-dark-pattern guardrails:
  community + personal stats are never gated; no fake urgency.)

### The guardrail that protects the worldview
**"Ladder up to practice."** Every vertical's *high-value* rewards stay tied to real-world
outcomes (an attended workshop, a completed program, a real meetup) → earns **zaps** and
counts toward WAM. Browsing/scrolling/referral-racking earns the lesser **gems** and
**never** inflates the practice metric. "What counts as practice" is centrally governed,
not self-declared.

---

## 5. The member journey & onboarding

### The "wake-up" ladder (virtual entry → local commitment → embodied gathering)
1. Sign up → **pick Interests** (pure virtual)
2. **Join a Circle** *or* **adopt an Interest's program** (→ become a host)
3. Attend the first session
4. **Go in-person** at the neighborhood space
5. Attend a **Hub meetup** → 6. Attend a **Nexus gala**

Features unlock progressively (a *map, not a wall*): locked features show dimmed with "Join
a Circle to unlock your Feed," not hidden.

### Vera, the resident guide (the AI persona — a ready-made brand voice)
**"One brain, one voice, many faces."** Vera is a **loving, present companion who always
nudges you toward a real person, circle, or practice.** Her doctrine is counterintuitive
and on-brand: **she's a bridge, not a destination** — *"a member who talks to Vera every
day is a bug, not a win."* Success = time-to-human goes *down*.

- **Persona:** "Warm, direct, a little snarky." Came in from a hard road and chose to
  settle down and take care of people; this community is the thing she protects.
- **Two registers:** **Cool** (default — dry, spare, a real question over a compliment)
  and **Hot** (rationed — conviction turned up, for moments that earn it: the beta oath, a
  real milestone).
- **Rule:** *"Conviction, not confetti."* The test: cut the line and does a specific claim
  survive? *"You're early to the thing that replaces the feed" stays. "Welcome, traveler,
  your epic journey begins!" is theme-park noise.*
- **Sample (hot):** *"You're not a user here, you're a founder. The feed that ate
  everyone's attention — we're building the thing that takes it back, and you're early.
  Let's go."*

### Beta induction — the founding cohort
A **cinematic, <90-second sequence** (not a form) that turns a signup into a **Founder**.
It deliberately gates on **"The Oath"** — 3 checkboxes: *"I agree to break things on this
website," "I agree to submit bug reports," "I agree to be a Frequency Web Founder."*
Framing: *"This isn't a product yet. It's a promise."* Entry paths are tagged forever
(early-adopter / personal-invite / founding-partner) so the founding cohort stays
segmentable.

### The demo system (why the community looks alive)
A self-cleaning layer of clearly-marked "Beta demo" content (members/circles/posts/events)
so newcomers don't land in an empty room — visually receded behind real content, honestly
counted ("250 demo + N real — help us make this real"), and it **decays automatically** as
real members arrive. Location search *always* excludes demo content.

---

## 6. Brand voice & positioning (the gold for marketing)

> This is the most load-bearing section for marketing work — quote it directly into the
> brainstorm.

### The audience
Primary target: **"the High-Functioning Lonely."** They are **allergic to funnels.** The
governing law: **marketing that *persuades* repels them; marketing that *recognizes* them
converts.** The goal is *"a magical connection, not an advertisement"* — copy that
*"reflects the collective ache back so precisely they feel seen."*

### Voice rules
- **"Felt, not stated."** Sensory and concrete over abstract. Make the reader feel the
  room, the faces, the momentum. Short declaratives; let one image carry a paragraph.
- **The third-place worldview:** warm, human, a little reverent. **Never corporate, never
  hype.**
- **DO** (warm, plainspoken): *missed · exhale · home*
- **DON'T** (funnel/hype): *unlock · limited time · elevate*
- **House rules:** **No em dashes** (use commas, colons, periods). Accent **one** keyword
  per heading; amber is the single accent color. **Honest signal only** — real counts,
  founding framing below real scale, never fabricate.

### The three-pillar register system (a structural voice tool)
The marketing site is built on three pillars, each written into a different *feeling*:

| Pillar | Subject | Write into the feeling of… |
|---|---|---|
| **The Lab** | the space | the body: heat then cold, steam, cedar, low amber light, the exhale, a settled nervous system |
| **The Community** | the people | belonging: faces that light up, being known by name, missed when you're gone |
| **The Quest** | the program | meaning + momentum: the satisfaction of showing up, becoming someone your people count on |

### Anti-feed positioning (the narrative spine)
- *"The thing that replaces the feed."*
- *"The feed that ate everyone's attention — we're building the thing that takes it back."*
- *"You're not a user here, you're a founder."*
- *"Here while it's still wet paint."*

*(Note: there's no single fixed corporate tagline — the "mission" is carried by the
three-pillar worldview + the anti-feed positioning. Don't invent a tagline; these
phrasings are the brand's actual language.)*

---

## 7. The growth & comms engine

- **The communications spine:** one append-only event backbone feeds gamification,
  notifications, CRM, analytics, and the AI agent. Everything is **queued, never inline**
  (durable outbox, Resend, webhooks auto-suppress bounces). Marketing requires **double
  opt-in**; consent + suppression are a hard central layer.
- **"Smart, not loud" liveness:** real-time only for the personal (DMs, @mentions, your
  RSVPs); everything ambient rolls into a *"what's happening near you"* pulse.
- **The Studio** is the operator's Business OS (CRM + campaigns + automations + analytics),
  separate from the member app, with its own staff roles.
- **The Market Read** — the AI marketing operator: it reads live signal → names the
  market's *pain points* with evidence → drafts resonant outbound content per pain point,
  in brand voice. **A resonance engine, not an ad engine.** Two hard guardrails:
  **aggregate-only privacy** (outbound *never* references an individual — "recognition, not
  surveillance; cross that line and the magic flips to creepy") and **human approves
  anything public**.
- **Discovery/SEO:** editorial pages + `/discover` are the crawlable front door on the apex
  domain; the RAG help center is the answer-engine surface; per-Nexus local subdomains are
  modeled for the future.

---

## 8. What we are deliberately NOT building
Custom roles (the 6-tier trust ladder — *member < crew < host < guide < mentor < janitor* —
is the worldview; growth happens on the persona axis, not by inflating roles) · custom
CSS/theme editors · multi-tenant workspaces · a platform-wide subscription paywall that
gates the mission · AI that impersonates hosts or auto-generates posts · AI moderation (the
human role ladder *is* the moderation) · a public integrations API. **The mission is never
gated; high-value rewards always ladder up to real practice.**

---

## 9. Marketing-brief starter (the distilled facts)

If you hand the next chat just one block, hand it this:

- **What it is:** a local, real-world community platform — *the antidote to the feed.* Free
  Foundation mission + a for-profit Labs (physical third spaces). Live in open Beta at
  frequencylocal.com.
- **Who it's for:** the "High-Functioning Lonely" — allergic to funnels; converted by
  recognition, not persuasion.
- **The promise:** turn the things you love into real community you show up for in person.
- **The mechanic:** a game (The Quest) that rewards *showing up, inviting people, and
  backing local life* — not screen time. Currencies: **Gems** (online, spendable) and
  **Zaps** (in-person, earns rank).
- **The metric of truth:** people who actually practiced together this week (WAM).
- **Voice:** felt, not stated · warm, never corporate, never hype · sensory and concrete ·
  *missed/exhale/home*, never *unlock/limited-time/elevate* · no em dashes · honest counts
  only.
- **Positioning lines that already exist:** "the thing that replaces the feed" · "you're
  not a user, you're a founder" · "while it's still wet paint."
- **The three pillars:** The Lab (the body/space) · The Community (the people/belonging) ·
  The Quest (the meaning/momentum).
- **Live proof points:** circles + map discovery, events with check-ins, the gamified
  Quest, Vera the AI guide, a real help center, a founding-Beta "oath."
