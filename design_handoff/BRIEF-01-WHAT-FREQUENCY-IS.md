# Frequency brief 01 — What Frequency is (for Claude Design)

> Part of the project-orientation set for Claude Design (with 02 Audience & voice,
> 03 Strategy & business, 04 Marketing & funnels, 05 Design direction). Sources:
> `docs/OVERVIEW.md`, `docs/PLATFORM-VISION.md`, `docs/GLOSSARY.md`,
> `docs/THE-QUEST.md`, `docs/REWARDS-ECONOMY.md`, `docs/ON-AIR.md`, `docs/SPACES.md`.
> On names, `docs/NAMING.md` is the law (summarized in brief 02).

---

## 1. The one-paragraph version

Frequency is a platform for **place-based, in-person community practice**: local
Circles gathering around shared interests, growing into neighborhood Hubs and area
Nexuses, wrapped in a gamified physical-world engagement layer (QR, NFC,
geolocation). The mission, locked May 2026: **"Shared interests into real-world
community: a free global mission, a game that drives people offline, and physical
spaces where it lives."** The game is the engine that drives offline action, not
decoration. The north-star metric is **WAM — weekly active members** (people who
actually practiced this week), never screen time.

## 2. Two entities, one community

One community graph spans two legal entities:

| Entity | Nature | Funds itself by |
|---|---|---|
| Frequency Foundation | Nonprofit (501c3) — free membership, seed programs, Circles, Meetups, loneliness work | Donations, grants |
| Frequency Labs | For-profit — physical "third spaces," Lab subscriptions, practitioner marketplace, paid depth | Commerce (Stripe Connect) |

The graph and the game are entity-blind and shared; **money is hard-partitioned by
entity** and "points are not money" is law.

**The flywheel:** online community forms → people meet in person (gamified) → local
density grows → density seeds a Lab (a physical venue) → subscriptions fund more
practice. The density heatmap is a product feature: it decides where the next Lab
opens.

## 3. The vocabulary (what everything is called)

### Structure and place

| Term | Meaning |
|---|---|
| Circle | The atomic unit: a local practice group (in-person cap 50, online cap 100); one topic + a place |
| Hub | A cluster of up to 5 Circles in a locale (emergent, not appointed) |
| Nexus | A cluster of Hubs (~2,500-member cap); the top community unit |
| Outpost | A Nexus's brick-and-mortar home base (one per Nexus; the seed toward a Lab). Circles never meet in Outposts |
| Frequency Lab | A standalone for-profit physical venue (a "third space"); flagship → franchise model |
| Channels | The seven global topical forums (Spirituality, Movement, Holistic Health, Human Relating, Activism, Creative, Business Support); verb "tune in" |
| Space | The white-label tenant unit — a business, nonprofit, practitioner, or venue running its own branded presence on the platform |

### The game (The Quest)

| Term | Meaning |
|---|---|
| The Quest | The year-round game (brand name) |
| Quest | One 13-week season instance with exactly three official Journeys (Mind/Body/Spirit) |
| Season | 13 weeks aligned to nature: Stretch (summer) · Shed (autumn) · Sit (winter) · Sprout (spring). Season 1 = Stretch |
| Journey | A ~4-week group program a Circle moves through together (Phases → Modules → Lessons); official or member-built; all free |
| Run | One Circle taking one Journey cohort-style — the flagship mechanic (cohorts complete at 85–96% vs 5–15% solo). Kickoff meetup + weekly check-ins |
| Practice | The atomic real-world act a member does and logs — the north-star act |
| Anchor practice | One practice done daily all month (the keystone habit) |
| Expression Challenge | The capstone that completes each Journey: in person at a Circle (+50 Zaps) or posted solo online (+30 Gems) |
| Pillars | Mind / Body / Spirit / Expression — the taxonomy Journeys organize by |
| Circle Meetup / Weekend Gathering | The two standing weekly Run touchpoints |
| Zaps ⚡ | The real-world currency: seasonal status XP, never spendable; rolls into Gems 5:1 at season end. Rule: real life → Zaps |
| Gems 💎 | The online currency: continuous, spendable in the Vault Store, daily-capped. Rule: online → Gems |
| Season ranks | Completion-based: Ghost (0) → Initiate (1) → Adept (2) → Master (3) Journeys finished this season |
| Amplitude | Lifetime XP: cumulative Zaps ever earned; never resets |
| Trophy | Minted when a Journey finishes (+75 Zaps) |
| Certificate | The season capstone for finishing all three Journeys |
| The Vault / Vault Store | Where rewards accrue / where Gems are spent (cosmetics → merch) |
| Spark | A light, capped surprise bonus on top of deterministic payouts |
| Welcome Back | +10 Zaps on the first log after a 7+ day gap (no streak shame) |
| Streak freeze | Earnable and buyable with Gems — a miss is forgiven, not punished |
| Frequency Signature | A member's four-Pillar practice balance (a derived identity visual) |

### Mindless (the timer)

| Term | Meaning |
|---|---|
| Mindless | The one member-facing practice timer. Tagline: "Get out of your head, and into your life." Verb: "tune out" |
| Be Still / Get Moving | Its two modes (Meditate·Breathe·Sigh·Stillness·Ritual·Journal·Just Log / Walk·Run·Yoga·Strength·Stretch·Play) |
| Airtime | Accumulated session time |
| Dispatch from Vera | Vera's daily one-per-member assignment card |

("On Air" is the internal codename; never member-facing.)

### People and AI

| Term | Meaning |
|---|---|
| Community ladder | member → Crew → Host → Guide → Mentor. Crew = the paid tier; Host runs a Circle |
| Vera | The one AI persona: onboarding concierge, help voice, encouragement, host copilot. Doctrine: "a bridge to humans, not a destination" — a member who talks to Vera every day is a bug, not a win |
| Catalyst | The recruiter apex title |

### Commerce

| Term | Meaning |
|---|---|
| Market | The umbrella browse surface: Products · Services · Tickets across Spaces + paid members |
| Classifieds | The peer board: offer / free / lend / request; connect-only, settled offline |
| Frequency Store | First-party branded retail |
| Shop | The per-Space storefront tab |
| Housing | ID-verified roommate/rental matching board, members only |
| Trust Score | One derived reputation read consumed by every commerce/connection vertical |

### Physical triggers

| Term | Meaning |
|---|---|
| Nodes | Physical earn triggers: QR codes, NFC plaques, geocache "ghost nodes" — server-verified, exactly-once |
| QR Studio | In-app code authoring: dynamic links, styled codes, referral codes, scavenger hunts |
| Check-in | Verified attendance at an event (the "showed up Thursday" moment) |

## 4. The product surfaces

**Member:** Feed · Community (Circles, Events, Broadcast) · Connect (Messages,
Friends, Directory) · Progress (the Crew home: Quest, Vault/Store, challenges) ·
Journeys (player + builder) · Mindless · Market/Classifieds/Store · `/discover`
(the public read-only SEO layer) · Help center.

**Operator (Space owners):** every Space gets Members / QR / CRM / Email, plus
per-type surfaces (booking, memberships, check-in/tickets, donations, enrollment)
in a `/manage` console. Admins get Studio (CRM/marketing/QR Studio) and a
janitor-level `/admin`.

**Public marketing site:** frequencylocal.com — long-form editorial pages
(covered in brief 04).

## 5. How the loop interlocks

Daily practice logs (10/15/25 Zaps by cadence) advance Journeys → finishing a
Journey pays +75 Zaps and a Trophy and IS the rank advance → three Journeys =
Master rank + Certificate → at season end, Zaps roll into Gems 5:1, season
trophies mint, counters zero → Gems are the durable spendable currency → Amplitude
accrues for life. Streaks, Spark, and Welcome Back sit on top.

Design-relevant laws baked into the economy:

- Numbers stay deliberately small: "recognition, never payment."
- Cooperative and local only — **no global leaderboard**.
- Free members earn everything at full rate; Crew unlocks spending ("everyone
  plays, only payers cash in").
- No streak shame, ever. The anti-Duolingo posture is a brand pillar.

## 6. Where the product is right now

- **Free open beta.** Everyone gets Crew status free; memberships are free
  (billing gated off); event ticketing/transactions exist behind flags.
- Live: the full community + game backbone, Journeys v2, Mindless, the rewards
  economy v3 (Season 1 "Stretch"), Spaces + operator consoles, QR platform,
  commerce surfaces (Market/Classifieds/Store), SEO/discover layer.
- Held for later phases: real money movement, white-label micro-sites, native
  mobile apps (the web app is the proving ground; mobile is the intended primary
  doorway).
- **Design guardrail that follows:** money is dark in all marketing — no flow ever
  ends on a $ / paid / sale moment. Business stories land on Captured, Booked,
  Return (see brief 04).

## 7. Canon notes

- `docs/NAMING.md` wins every naming dispute (brief 02 carries the map).
- Retired concepts that still linger in older docs (never design with them):
  the Echo/Signal/Beacon/Conduit/Luminary rank ladder, Side Quests, Practice
  Shelf, Circle Current, "Makers," "points."
- Demo content in the beta is honestly labeled and visually receded (the `.dimmed`
  treatment in the styles handoff) — newcomers never mistake it for real members.
