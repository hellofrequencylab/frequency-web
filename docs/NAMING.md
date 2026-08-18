# Frequency Naming Canon: 2026 (single source of truth)

> **FINAL and locked (June 2026).** Repo is canonical over Notion. Supersedes all prior
> naming decisions (see ADR-208). If a term or case isn't covered here, it goes to
> OPEN QUESTIONS in the canon report, never guess.

## The Quest (the game)

- **The Quest** = the ongoing year-round game (brand name; never in schema).
- **A Quest** = one season's 13-week instance. Schema/code `quest` always means the
  season instance. "Seasonal Quest" is retired phrasing.
- Hierarchy: **The Quest → a Quest (season) → Journey → Practice** (no "Act" layer).
- A Quest ships **exactly three Journeys**, one each for **Mind, then Body, then Spirit**,
  run in sequence (~4 weeks each), each **capped by one Expression Challenge**.
- **Seasons:** Stretch (Summer) · Shed (Autumn) · Sit (Winter) · Sprout (Spring): 13 weeks
  each, natural calendar. (Schema seasons were numeric; named per this canon.)
- **Practice** = core atomic real-world act.
- **Challenge** = the **Expression capstone** that completes each Journey (a `season_challenges`
  row typed `expression`, linked to its Journey via `journey_id`). The season-wide
  **15-Challenge outreach engine is DORMANT** (kept, not seeded): not in active play.
- **Trophy** = the award minted when a member **finishes a Journey**. Rewards Economy v3
  (ADR-305): finishing a Journey mints a **Pillar Trophy** (Mind / Body / Spirit) and pays
  **+75 Zaps**. (Supersedes the v2 escalating-Gem-by-rank journey reward and the older flat
  30-Gem reward. See Economy below.)
- **Certificate** (Rewards Economy v3, ADR-305) = the **season capstone**: finishing **all
  three Journeys** in a Quest mints it alongside **Master** rank. It grants a **unique
  cosmetic + 100 Gems** (no extra Zaps). One per member per season. Distinct from the
  per-Journey Pillar Trophies (collect three Trophies, then the Certificate caps the set).
  **Member-facing name: "the Seal," PROPOSED, not yet locked** (a short, plain, on-canon
  proper noun that sits cleanly beside Trophy and the Vault). Until locked, schema/code may
  use `certificate`; any member copy that ships the name must flag it as proposed.
- **Validated creation** (Rewards Economy v3, ADR-305) = the canon term for the creation
  payout. A member who **publishes** a Journey / event / practice earns a small **Gem
  creation token** at publish; the **large payout** (Zaps + a Gem bonus) lands only when the
  asset is **first used by a distinct, established member** (email-verified, not the creator,
  not invited by the creator). *Use* = adopt a Journey, log a practice, RSVP to an event.
  Paid **once per asset** (idempotency key `creation_validated:{type}:{id}`), **uncapped**
  (the validation gate is the throttle), carrying an **actor** (the member who used it) and a
  **beneficiary** (the creator who is paid). Never "creation bounty."

- **Task** = volunteer assignment issued by central admin or a Circle
  (implemented by `crew_tasks`: global rows = central, `circle_id` rows = circle-issued, ADR-205).
- **Per-practice intensity tiers: RETIRED (June 2026).** The Initiate / Adept / Master
  practice-CONTENT tier system is removed (`practice_tiers` table + `default_tier` /
  `tier_override` / `default_intensity_tier` columns dropped); a Practice now carries a
  **weight class only** (below). The words **Initiate / Adept / Master are now SEASON RANKS**
  (see Season ranks), never a practice setting. The two no longer coexist.
- **Practice weight classes: light / standard / heavy** (`practices.weight_class`,
  Rewards Economy v2) = the per-log Zap payout **fallback** (8/12/15), used when a practice
  has no explicit `reward_zaps`. A property of the PRACTICE, distinct from the member's depth
  tier above. The two never mix. The explicit per-log VALUE is **`reward_zaps`** when set; the
  Quest library values it by CADENCE (Daily 10 / 3x-week 15 / Weekly 25, ADR-303).
- **Adopting for a term (ADR-920, Aug 2026): plain words, no new proper noun.** A member
  **adopts** a practice (the verb stays Adopt) **for a set stretch or ongoing**: member copy
  says "**a 2-week / 4-week / 8-week commitment**" (lowercase, descriptive) or "**ongoing**".
  Progress copy is "**Week N of M**" / "**Day N of M**". The end of a term is
  "**Practice complete**" (plain, never "graduated"/"expired"); the re-offer verb is
  "**Go again**" and the convert-to-ongoing verb is "**Keep it**". The optional
  when-will-you-do-it line is a "**cue**" internally (`member_practices.cue`); member copy
  asks the question ("When will you do it?") and never says the word cue. Schema:
  `term_weeks` / `starts_on` / `ends_on` / `retired_at` / `retired_reason` / `source` on
  `member_practices`. **Never** "subscription," "enrollment" (that is Journeys), or "streak"
  for the term itself.
- **Amplitude** = lifetime XP: cumulative Zaps ever earned, hosting-class acts at 2×.
  Never resets, never spent, never gates play. Levels derive from
  `50 · L · (L+1)`; displayed beside the season rank ("Beacon · 14,200").
  Supersedes the lifetime-rank DISPLAY (ADR-037); the `lifetime_rank` column stays
  (retro reward rules read it). Gem tiers (New→Legend) are RETIRED.
- **Practice Shelf: RETIRED (Rewards Economy v3, ADR-305).** The profile module of
  per-practice consistency/depth ladders (In Motion / Groove / Deep Groove / Full Cycle;
  N Deep) is cut. Achievements are the lean core set only (firsts, streak milestones,
  amplitude milestones, the 3 Pillar Trophies, the Certificate). The Deep Groove / N Deep
  award proper nouns are removed from the exceptions list below.
- **On Air** (ADR-229) = the practice timer mini-app at `/on-air`: the fullscreen
  sit (breath visualizer + timer), then the reveal (rewards → streak → stats →
  Dispatch). INTERNAL name only (code, routes, schema, git docs). Member-facing
  the app is **Mindless** and the verb is **"tune out"** ("tune back in" = done):
  the setup title and CTA, the Zap menu door (subtitle "Tune out"), the lotus
  buttons beside practices, the live-screen title (lotus mark, softly pulsing),
  the PWA shortcut, help and changelog. "Going on air" / "off air" are retired
  from member copy; "Connecting" was rejected (collides with the **Connect**
  tile). **Airtime** = timed practice minutes (`practice_sessions`): the stat
  keeps its name.
- **Mindless = THE one timer; Be Still / Get Moving = its two modes (ADR-360).**
  There is now **one** member-facing practice timer, **Mindless**, tagline
  **"Get out of your head, and into your life."** It carries two modes the member
  toggles between:
  - **Be Still** = the quiet sit (the former Mindless sit). Sub-modes: Meditate /
    Breathe / Stillness / Ritual / Journal / Just Log.
  - **Get Moving** = the moving timer (the former Movement timer). Sub-modes: Walk
    / Run / Yoga / Strength / Stretch / Play.

  Mode labels are EXACTLY `Be Still` and `Get Moving`. The mode auto-selects from
  the launching practice's `timer_kind` (`mindless` → Be Still · `movement` → Get
  Moving · `none` → Be Still, defaulting to Just Log); a generic open lands on Be
  Still and remembers the last mode used. The two former engines are reused under
  one door. **"Movement" is RETIRED as a separate member-facing timer name** (it
  is now the **Get Moving** mode; see Retired). Scoring stays INTERNAL: a practice
  may develop more than one Pillar via the existing `focus_details` map (e.g.
  breathwork = Body + Spirit, yoga = Body + Spirit), but this is never surfaced as
  a visible rubric, and there is **ONE Zap reward per session** (the "On Air is a
  stage, never a second economy" invariant holds). **"On Air" remains the internal
  name**; routes, schema, and `timer_kind` are unchanged.
- **The Zap button** (ADR-230) = the raised center action button (the engraved ⚡)
  and its menu of earning tools. Live row: share, Event, Contact, **Connect**
  (your personal code, /codes). Coming-soon row: Check In, Ghost Node, Partners.
  Member-facing name is **Zap**; the BACKEND keeps the Capture naming
  (`open-capture`, `captures`, capture flows): Zap is the function that captures.
  Menu heading: "Capture a moment." **Mindless** (the On Air timer's door,
  subtitle "Tune out", lotus art) sits in the menu as a full-width row
  BETWEEN the live and coming-soon rows: a door to the timer app, not a
  capture tile. On Air's other entries are the home JourneyBoard, practice
  pages, /on-air and the PWA shortcut (no header icon).
- **Dispatch / Dispatches** = the host-and-above wider announcement (`dispatches`, route
  `/nearby`). **This is the sole member-facing name; every visible label, help article,
  notification topic, and admin heading says Dispatch.** "Broadcast" is **retired from member
  copy and RESERVED** for a future feature, so it must not appear in any user-facing string;
  it now survives ONLY where a member never sees it: schema, `featureKeys: [broadcast]`, and the
  design token (`text-broadcast-*`). The verb "broadcast" as plain English (a contact is "never
  broadcast") is fine; the product noun is always Dispatch.
  - **The route used to be the fourth survivor, and it is gone (ADR-1020).** `/broadcast` became
    **`/nearby`** on 2026-08-12. A URL is not internal: a member reads it in the address bar,
    types it from memory, and pastes it into a message, so it was the one place the retired word
    was still reaching people. A permanent 308 in `next.config.ts` carries old links, already-sent
    notification emails, and bookmarks across.
- **`/nearby` is the ROUTE; "Around You" is the LABEL, and they are meant to differ (ADR-1020).**
  This pairing is deliberate. **A URL wants one short lowercase token** that survives being read
  aloud, typed from memory, and truncated in a link preview. **A label wants the voice**, in the
  reader's words, and may be more than one. `/around-you` would spend a hyphen and a second word
  on nothing a member gains; "Nearby" in the nav would spend the voice on a tidiness nobody sees.
  So: `key: 'nearby'`, `href: '/nearby'`, `label: 'Around You'` in `lib/nav-areas.ts`.
  **Do not "fix" the mismatch.** Where a route and its label diverge on purpose, say so at the
  registry row, and the same rule applies to any future pair.
- **Dispatch from Vera** (ADR-229) = Vera's daily personal assignment, shown at the
  end of an On Air session (`vera_dispatches`; one per member per day, cached:
  replays never regenerate). **Collision guard:** distinct from the leader-ladder
  **Dispatches** (`dispatches`, /nearby) above. Both are transmissions in the same
  radio family; "Dispatch from Vera" / "Vera Dispatch" always carries the qualifier.
- **Event Dispatch** (ADR-255) = a host's update about one event. The base action is
  **post an update to the event page**; at post time the host may also **send it as a
  Dispatch** and/or **text the group** (SMS, gated on A2P 10DLC). When sent as a
  Dispatch it rides the existing `dispatches` rail and renders **in the feed as a
  Dispatch with an event badge** (event-scoped, never the /nearby leader ladder).
  Third member of the Dispatch family; always carries the "event" qualifier. This
  supersedes the never-built `event_blasts` concept named in EVENTS-SYSTEM.md.
- **Season ranks (completion-based): Ghost → Initiate → Adept → Master** (4 values).
  Rank = **how many Journeys the member finished this season**: 0 → Ghost, 1 → Initiate,
  2 → Adept, 3 → Master. It advances **automatically the moment a Journey is finished**:
  no Zap threshold, no manual promotion, no challenge gate. `rankForCompletion(journeysFinished)`
  replaces `rankForZaps`. **RETIRED:** the old 6-rank Zap-threshold ladder
  (Echo / Signal / Beacon / Conduit / Luminary, 0/100/300/750/1500/3000) and the **Luminary
  double-gate** (`season_challenges_complete` no longer gates rank). The recruiter-ladder apex
  that reused "Luminary" is renamed **Catalyst** to avoid the collision.
- **Economy:**
  - **Zaps**: earned for completing in-person Quest activity (Practices, Challenges,
    Tasks), solo or with others. Everyone earns at full rate (the free game is the
    principle; ADR-141 visibility gating is the membership value; the old
    `MEMBER_ZAP_RATE` throttle is deleted).
  - At season end, **Zaps roll into Gems FLAT at 5:1** (floor division, `ZAP_TO_GEM_RATIO = 5`).
    Finishing a Journey pays **+75 Zaps + a Pillar Trophy** (Rewards Economy v3, ADR-305).
    Finishing all three caps the set with the **Certificate** (Master + a unique cosmetic +
    100 Gems). The Expression Challenge that caps a Journey pays **+50 Zaps in person at a
    Circle, or +30 Gems posted solo online**, and is required to finish the Journey.
    **RETIRED:** the v2 escalating per-Journey Gem bonus (Initiate 25 / Adept 50 / Master 100)
    and the older one-time final-rank Gem bonus. Recognition rides Trophies + the Certificate.
  - **Gems**: earned from online activity + the Zap rollover; spendable. **Gems model
    (Rewards Economy v3, ADR-305):** `lifetime_gems` is **monotonic** (= total Gems ever
    earned, only ever increases) and the **spendable balance = `lifetime_gems` minus the sum
    of redemptions**. "Earned" (lifetime) and "spendable" (after spends) are two reads of one
    monotonic total, never a single decrementing counter.
  - **Classifier (Rewards Economy v3, ADR-305):** one source of truth returns a payout
    profile `{ zaps, gems }` per act. Real-world act → Zaps · online act → Gems · creation →
    both. Two-question test: (1) did they do something real/durable? → Zaps; (2) is the online
    participation valuable in itself? → Gems. Logging a practice is **Zaps only** (the log is
    the record, not the point).
  - **Vault Store** = where Gems are spent. **The Vault** = the member treasury
    holding Gems, Zaps, and Awards (Awards = Trophies, the Certificate, achievements).
    New Gem sinks (v3): **gift Gems** to another member, and **buy a streak freeze**.
  - Never "points," always Zaps/Gems. Full spec: [REWARDS-ECONOMY.md](REWARDS-ECONOMY.md).
- **Vera** = the ONE system voice (ADR-231): the assistant, the Dispatch writer,
  AND the system account (`profiles.is_system`, callsign **@moderation**, kept
  per the owner, after a brief @vera detour: 20260615400000 renamed it,
  20260615500000 renamed it back; every lookup keys on `is_system`, never the
  handle). Her member-facing role chip is **Moderator** (a VIRTUAL chip off
  `is_system`; the `community_role` enum is never extended). "Frequency
  Moderation" is retired as a display name. Her join notices are **system
  lines** (`post_type 'system'`): one centered feed line, never a card; the
  newcomer also gets a personal welcome notification. Vera is FULLY VISIBLE
  (directory card, search, mentions, owner call); she sits out only the
  leaderboard, suggestions, and operator assignment lists.
- **Pillars** = Mind / Body / Spirit / Expression ("Domains" retired as the member word;
  schema stays `pillars` + the `domain_id` FK, same four values). **Three Pillars carry
  Journeys (Mind, Body, Spirit); Expression is woven in as the Challenge capstone on every
  Journey**, not a fourth Journey. Pillars are NEVER called Channels.
- **Co-op / Run** = a Circle going through a Journey together as a cohort, a **Run** (ADR-252;
  supersedes the v1 "3+ on the same Journey" framing). Cooperative framing stays; the
  **circle-collaborative REWARD mechanics are RETIRED** (Rewards Economy v3, ADR-305): Co-op
  Pulse, Co-op Synchrony, Carrier Wave, and Circle Current pay nothing. A Run still reads as a
  shared, non-competitive thing (the leaderboard is cooperative + local only), but there is no
  group reward payout and never a global leaderboard. **Member/host copy always says
  "Run," never "cohort"** (cohort is internal/research framing only), and the person who holds
  a Run is the **Host, never a "facilitator."**
- **Anchor practice** (NOUN, ADR-307) = the one practice a Journey runs **daily, all month,
  unchanged**: the keystone-habit through-line of the Master Template. STRONGLY RECOMMENDED,
  not required: the builder prompts the creator to set one and warns on save when it is missing,
  but lets them publish without it. **Collision guard:** distinct from the existing VERB "anchor
  a practice" / "anchor to a daily routine" (tying any practice to a moment in the day). The
  Anchor practice is the single practice you anchor every day; the verb applies to any practice.
  Stored on `journey_plan_items.settings.anchor` (no migration).
- **Circle Meetup** and **Weekend Gathering** (ADR-307) = the Master Template's two standing
  weekly touchpoints, the group's to purpose. **Circle Meetup** = the mid-week connect-and-process
  session (in person or virtual). **Weekend Gathering** = the weekend in-person social event that
  fits the group's vibe. Both ride the existing Events system; both stored under a widened
  `journey_runs.meeting` jsonb (no migration). Capitalized as proper nouns in member/host copy.
- **Expression Challenge, per-week vs capstone (collision guard, ADR-307/ADR-299).** The
  Expression Pillar shows up each week as the **weekly Expression Challenge**: the active/social
  *doing*, never a fourth quiet practice. The weekly version is **LIGHT** (small or no Zaps). The
  **capstone Expression Challenge** is the **HEAVY** one at the Journey's Close that carries the
  Journey-completion reward (the `season_challenges.journey_id` capstone, +50 Zaps in person /
  +30 Gems solo). Both are "Expression Challenge"; copy carries the qualifier (**weekly** vs
  **capstone**) when the distinction matters. Same Pillar, two weights, one name family.
- **No game object named "Mission."** A Journey week carries plain **lesson** content (a hook,
  one open/essential question, a short teaching, a reach-back). There is **no object called a
  "Mission."** **Mission** stays the **movement's** word (the mission: help people heal /
  community connection, per CONTENT-VOICE §1, §6d). Never name a Journey block, slot, or feature
  "Mission." It collides with the movement's mission.
- Internal-only timers: **rhythm clock** (rolling streak/cadence) and **quest clock**
  (13-week season). Never member-facing: UI says "streak" and "season."

## Community structure

- **Circle → Hub → Nexus** (unchanged tree, caps unchanged).
- **Circle** = the community CONTAINER, **local or online** ([ADR-1013](DECISIONS.md), amending
  ADR-088). It has a roster, a feed, and a door. ⚠️ A Circle is **not** defined by meeting in person:
  a Circle that meets on a call is still a Circle, and `circles.type` carries that distinction
  ("In Person" / "Online") as a property of one Circle, never as the line between Circles and
  something else. The retired formula, still widely remembered, was "Circles are the local,
  real-world unit; Channels are the global, topical unit" — say **container vs topic axis** instead.
- **Outpost** = the brick-and-mortar home base of a Nexus; one per Nexus; the seed
  toward a Lab. Circles meet in homes/public spaces, never Outposts.
- **Frequency Lab** = standalone for-profit venue; when a Lab exists in a Nexus, the
  Outpost HQ lives there.
- **Channels** = a FOCUS AREA (the `topical_channels` table): it hosts Circles
  (`circles.topical_channel_id`), carries the forum feed, and can run as a Program
  (below). The founding seven, Spirituality, Movement, Holistic Health, Human Relating,
  Activism, Creative, Business Support, stay platform-curated. Verb: **"tune in."**
  A Channel sorts under a Pillar via `topical_channels.pillar_id`. **"Interest" /
  "Interests" is RETIRED as a member-facing word for these**: say **Channel**.
  (Broadened from "forum feature only" by ADR-864, July 2026: the forum is one module
  inside a Channel, not its definition.)
- **Program** = a Channel with a Chapter blueprint (`topical_channels.template_id`),
  run by Frequency (`owner_space_id` NULL) or by a Space (a Collective business
  member). Examples: Meld Community Coworking, MoFlow. Never "Collective" (a Space
  membership plan), never "Hub" (the community tree), never "Franchise".
- **Chapter** = one local Circle running a Program's model
  (`circles.topical_channel_id` points at the Program's Channel). Verbs: **"Start a
  Chapter"** (the Remix flow with the Program's blueprint) and **"Find a Chapter near
  you."** A Chapter is still a Circle everywhere else in the product; "Chapter" is
  the word only inside Program framing.
- **Pillars vs Channels (locked, June 2026):** the FOUR (Mind / Body / Spirit /
  Expression) are **Pillars**, never "Channels" and never "Domains". The SEVEN topics
  are **Channels**, never "Interests". Two distinct layers: Pillar > Channel > Circle.
  Copy that calls the four "channels" or the seven "interests" is wrong and is corrected.

## Roles: two independent axes (+ billing as a third)

- **community_role: member | crew | host | guide | mentor**
  - Member = signed up, attended a circle/event
  - Crew = paid member; participation + leadership training tracks.
    **Assignment rule (locked):** `community_role='crew'` is AUTO-SET when a member's
    billing goes paid (the billing webhook applies it); `membership_tier` remains the
    payment source of truth. "Crew = paid" is this business rule, not a schema coupling.
  - Host = Crew volunteering as a Circle host · Guide = oversees local hosts ·
    Mentor = oversees Guides in a Nexus
  - "host+" = host or above WITHIN community_role only.
- **web_role: admin (Site Admin) | janitor (Executive Admin) | none**: operational,
  not aspirational. **Locked decision:** web_role is the coarse axis (who may enter
  admin surfaces, and the janitor-only crown jewels); the **`team_members` staff
  matrix (ADR-127) stays side-by-side** as the fine-grained per-domain capability
  layer for scoped staff hires.
- **Billing (`membership_tier`)** is a third independent attribute.
- Design tokens: community ladder apexes on plum; web roles get no rank color;
  season ranks apex on gold.

## Connection layer

- **Members** = the member directory (`/network`), the sidebar row included (ADR-868; the row
  was previously labeled "Community", which collided with the section header above it and with
  the brand's "The Community"). "Members" names the directory of people; it is not a synonym
  for the community itself, and the generic lowercase "member" (a person on the platform)
  is unchanged. My Contacts (`/network/contacts`) stays its own row.
- Resonance, Inner/Middle/Outer orbit, Pulse, Near Misses, Frequency Signature: unchanged.
- **Circle Current: RETIRED as a reward mechanic (Rewards Economy v3, ADR-305).** It was a
  circle's collective, non-competitive seasonal standing (internal column
  `circles.season_current`). The column may persist as data, but it pays nothing and is no
  longer a member-facing economy construct. (See the Retired list and the cut
  circle-collaborative mechanics under Co-op / Run.)

## CRM / messaging surfaces (ADR-827, July 2026)

One CRM engine, four scoped surfaces; each has ONE operator-facing name and a locked audience:

- **Resonance CRM** = the platform CRM (`/admin/crm`): everyone in the network.
- **Community Resonance** = a Space's CRM tab: the Space's members + followers.
- **Message Attendees** = an event's CRM/messaging surface: everyone RSVP'd **going or
  maybe** (not waitlist, not declined, not invited-only guests).
- **Message Circle** = a Circle's CRM/messaging surface: the Circle's active members.

Never "resident CRM" (no "resident" entity exists), never "Event CRM" / "Circle CRM" in
operator-facing copy (internal shorthand only).

## Events: Cohosts (people) vs Collaborators (Spaces) (ADR-834/ADR-835, July 2026, owner-ruled)

Two distinct RELATIONS, one shared member-facing label. They must never blur underneath, and
they must read as one idea on the event page:

- **"Co Host" (two words, capital H) is the member-facing label for BOTH** (owner ruling, July
  2026 — it supersedes the display halves of ADR-834/835). On the event page the Host and every
  Co Host live in ONE card, "Host & Co Hosts": the Host leads, Spaces co-hosting are named
  under it on the same surface, and people co-hosting sit in a recessed panel inside the same
  card. There is no separate "Collaborators" box and no separate public Cohosts list.
  **Cohost / Collaborator remain the internal nouns** for the two relations — in code, schema,
  ADRs, docs, and operator settings surfaces (the Collaborators share field, the Collective
  capability "Collaborator hosting"). Never show the word "Collaborator" as an event-page
  credit heading.
- **Cohost** (one word, always a PERSON) = a member the host invites to help RUN an event
  (`event_cohosts`). Gets management access (the `isEventCohost` action gates). Credited in the
  people panel of the Host & Co Hosts card (round avatar + @handle), never featured. The
  host's invite / remove / transfer controls are a separate host-only module. Never a Space,
  never hyphenated as the noun.
- **Collaborator** (always a SPACE) = a Business or Non Profit Space co-hosting an event
  through an ACCEPTED `event_space_shares` row (Events EC3). Gets calendar visibility (the
  event appears on that Space's calendar) plus a FEATURED credit on the event page (a logo row
  directly under the Host, same surface, same shape) and a "with …" mention on the hosted-by
  line. Gets NO management access, ever. A pending row is still "Pending their approval" on the
  host's settings surface.
- **The label merge is display only.** The relations, the gates, and the capabilities are
  untouched: a Space Co Host still has zero management access, a person Co Host still holds
  `isEventCohost` rights. Anyone reading "Co Host" in the UI cannot infer which relation it is;
  anyone reading code must use the internal noun.
- **Relationship to ADR-799 "collaborator spaces" (deliberate extension, same brand):**
  `space_collaborations` = the STANDING space↔space relation (a venue hosting collaborator
  businesses); an event Collaborator = the PER-EVENT share. Same word on purpose, two grains.
  When the grain matters, qualify: "venue collaborator" vs "event Collaborator". Neither ever
  means a person.
- **The person/Space line is structural, never name-based (ADR-835).** A personal ACCOUNT (a
  profile) can only ever be a cohost; a SPACE (Business / Non Profit) can only ever be a
  Collaborator, and that includes a Space named after its owner (the owner's own "Daniel
  Tyack" business Space is a valid Collaborator). Nothing rejects a Space for mirroring its
  owner's name; instead the picker results and Collaborator rows always show the Space's logo
  plus a type badge, "Business Space" / "Non Profit", so an owner-named Space never reads as a
  person. BEING a Collaborator is free for any Business / Non Profit Space; HOSTING an event
  with Collaborators is the host Space's Collective-plan capability (see next bullet).
- **"Event hub" is not a name; the capability is "Collaborator hosting" (ADR-835).** The
  owner's informal "event hub" concept (a Space whose event brings on Collaborator Spaces)
  maps to the **Collaborator hosting** capability on the Collective plan (feature
  `space_collaborators`). Never write "Event Hub" / "hub" in UI or member copy for this:
  **Hub** is the locked community-structure term (Circle → Hub → Nexus) and must not collide.
  A member-hosted event has no host Space, so it can never take on Collaborators at all
  (individuals have Cohosts; their business Space can collaborate on a Space-hosted event).
- **Hyphenation guard:** "co-host" (hyphenated) survives only as the VERB ("co-hosting this
  event", "invited you to cohost this event"). The member-facing NOUN is "Co Host" / "Co Hosts";
  the internal person noun is "cohost" (one word) and the internal Space noun is "Collaborator".
  Never "Cohost" as a display heading, never "Co-Host".

## Events: Venue is the fourth role, and Host is the one that gets paid (ADR-911, July 2026)

Four roles, named by **what each one controls** rather than by how prominent it is. The one-line
rule: **money follows the Host, calendars follow the Venue and Collaborators, rights follow the Host
and Cohosts.**

| Role | Internal noun / column | Controls | May be |
|---|---|---|---|
| **Venue** | `events.space_id` | Where it lives; whose calendar calls it home. No money, no rights. | Any Space |
| **Host** | `events.host_space_id` | The money and the liability: registrations, payouts, refunds, attendee CRM. | A Space only |
| **Collaborator** | `event_space_shares` | Reach: their calendar, a featured credit. No money, no rights. | Business / Non Profit Space |
| **Cohost** | `event_cohosts` | Labour: management access to run it. | A person only |

- **The Host is a Space because the Host is the PAYEE.** Only a Space has a Connect payout account,
  so a person cannot hold the role — that, not prominence, is why hosting is Business / Non Profit
  only. Use this reason in operator copy; "business accounts only" invites an argument that "the
  Space is who the money pays" ends.
- **Venue reads as "at <Space>" on the host line**, never as a "Part of" chip and never on the WHERE
  line. "Hosted by Audrey DeWitt · at Royal Temple" is how a person says it out loud. The WHERE line
  belongs to the PHYSICAL venue name + street address; a Space is an account, not a place.
- **A Venue is not a credit.** No logo, no card, not bold. A venue that wants brand presence on the
  event card becomes a **Collaborator** — an existing relation, so that is a data choice, never a
  code change.
- **The Venue disappears when it IS the Host,** which is nearly every event. `venueSpaceId` returns
  null in that case, so the page names one Space and the duplicate is structurally impossible rather
  than something a conditional has to remember (ADR-911).
- **"Part of" now means Circle and Journey only.** It used to carry a Space chip resolved from the
  HOST axis, so "Part of Royal Temple" and "Hosted by Royal Temple" printed the same name twice.
- **Handing hosting over is a two-sided handshake**, because accepting means accepting the payout
  liability and the refund obligation for other people's ticket sales. The side that raised an offer
  can never answer it. Refused while an UPCOMING event has settled tickets; allowed once it is over.
- **This changes no display label from ADR-834/835.** "Co Host" remains the member-facing label for
  both Cohosts and Collaborators, and "Collaborator" still never appears as an event-page credit
  heading. Venue is a new role with a new word, not a rename of an existing one.

## Events: a repeating event is a series of dates (ADR-897, July 2026)

Recurrence is materialised: every date is a real event row with its own page, its own RSVP, and its
own guest list (ADR-007). That is an implementation truth members never need, so the words split
cleanly by audience and this section pins which is which.

- **Member-facing, the only two nouns.** A repeating event is a **series**; one occasion in it is a
  **date**. Both stay lowercase common nouns, never capitalised as product names: a series is not a
  Frequency object a member manages, it is the plain word for "the weekly one". Shipped copy:
  `Upcoming dates` (the rail heading on an event page), `Part of a series` (the card line for one
  date of a repeating event), and the "Browsing shows the next few dates, not all of them" wording in
  `content/help/groups/events.md`.
- **The cadence line stays a sentence, not a noun.** `Repeats weekly` / `Repeats daily` /
  `Repeats monthly` (`recurrenceLabel`, lib/events/recurrence.ts). Never "Weekly Series" as a label,
  never "Recurrence" as a member-facing heading; recurrence is the internal word for the mechanism.
- **`occurrence` and `anchor` are INTERNAL ONLY** — code, schema, ADRs, docs, operator surfaces.
  `occurrence` is a materialised child row (`parent_event_id` set); the `anchor` is the row carrying
  the cadence, which is also a real date and is NOT "the parent event" in member terms. Neither word
  may appear in member copy: an anchor whose own date has passed is simply gone from browse, and a
  member being told about "the anchor" of a thing they think of as "the Tuesday sit" learns nothing.
- **Never "recurring event" as a member-facing noun phrase.** Say "a repeating event" in prose, or
  name the thing: "the weekly sit". "Recurring" survives in code (`recurrence_type`, `isRecurring`)
  and in the help center's existing section heading, which predates this row.
- **Collision guard: `date`.** The word already means a calendar day everywhere else in the product,
  and it means a romantic meeting in the Marketplace's matching surfaces (see Marketplace & Commerce).
  In events copy, a "date" is always one occasion of a series and always sits next to its series or
  its event, never alone as a standalone noun. When the grain is ambiguous, write "this date" or name
  the day.
- **Collision guard: `series`.** Distinct from a **Journey** (an authored multi-step program members
  enrol in) and from a **Program** (Community structure). A series is nothing but the same event
  repeating; it has no curriculum, no enrolment, and no page of its own. The repeating event's own
  page IS the series home, which is why there is no `/series/` route and must not be one.

## Profile pages

- **Spotlight** = a member's opt-in public mini-site (a linktree/personal page themed
  by their profile). Member-facing copy: "Spotlight page", "your Spotlight" (sentence
  case, one capital). Public URL `/spotlight/[handle]`. Internal: capabilities
  `spotlight.manage` / `spotlight.view`, flags `meta.spotlight.{enabled,published}`,
  audit action `spotlight.toggle`. OFF for everyone by default; turned on per member.
  **Not "Studio"** (locked for the creation tool + the future Calm/Studio *mode* axis)
  and **not "Signal"** (a retired rank, below). Locked June 2026 (ADR-423).

## Business pages (Spaces): two designators

- **A Space has exactly two public designators: "Business" and "Non Profit"** (ADR-552,
  July 2026). Each word is simultaneously the **type** (what the profile is, `spaces.type ∈
  {business, nonprofit}`, plus the hidden platform `root`) AND the **plan** (how it bills,
  `spaces.plan ∈ {free, business, nonprofit}`). One word covers both layers on purpose — there
  is **no third vocabulary**: no "Pro", no "Organization", no "Practitioner" as a public type,
  no tier names. **AMENDED (ADR-811, retired the "no tier names" clause):** named tiers are now
  canonical (Member / Crew / Business / Collective / Non Profit / Independent). "Business" and "Non
  Profit" remain the two designators; Collective + Independent are higher tiers. See "The Community
  Collective + the tier ladder" section below.
- **Free vs paid is not a different plan name.** A paid Business is just a free Business using
  more (usage + seats). Copy never says "upgrade to Pro" or names a second plan; it says "Go
  Business" and talks in terms of usage ("keep going", "you'd have saved $X"). Same for Non Profit.
- **Casing:** "Business" and "Non Profit" (two words, both capitalized) as the designator / chip.
  In running sentences, sentence case applies as normal.
- **The public profile chip** shows only "Business" or "Non Profit" (never the old type labels).
- **Focus** = a free sub-preset under a type (`spaces.mode_variant`, e.g. appointments, packages,
  service, ticketed). Practitioner / Coach / Studio / Event live here as *framing only* — they
  tune the starter layout, pipeline, and lexicon, never gate anything, and are not public
  designators (not shown as the chip).
- **Retired as public type / plan words:** `pro`, `practitioner`, `organization`, `coaching`,
  `event_space`, `lab`, `partner`, `whitelabel` (as a tier). They may persist as archived catalog
  keys or Focus ids, but never as a member-facing type or plan name.

## The Community Collective + the tier ladder (ADR-811, July 2026, AMENDS the two-designators lock above)

- **Frequency IS a Community Collective** (brand essence + public positioning): a collaboration-first network
  that exists to support every community effort and help everyone in it succeed. "Community Collective" is the
  canonical descriptor for the whole platform. Full spec: [COMMUNITY-COLLECTIVE-STRATEGY.md](COMMUNITY-COLLECTIVE-STRATEGY.md).
- **The TAGLINE takes no article: "Community Collective"** (ADR-944). That is the descriptor above,
  used as a tagline, and it is the exact wording under the mark in the logo lockup. `SITE_TAGLINE`
  in `lib/site.ts` is the single source — it feeds the lockup, the OG card, the `<title>`, `llms.txt`
  and the email footer, so they cannot drift apart. **Do not confuse it with the tier-ladder heading
  "The Community Collective"** immediately below, which is a different name and keeps its article.
- **The tier ladder (named tiers are now canonical, superseding the ADR-552 "no tier names" clause):**
  **Member** (free) · **Crew** (personal, pay what you want from $4.99) · **Business** ($29) ·
  **Collective** ($79) ·
  **Non Profit** ($39) · **Independent** (white-label, ~$249). "Business" and "Non Profit" remain the two
  space *designators* (the public chip); **Collective** and **Independent** are the higher space tiers.
- **"Collective" (capitalized) means two things ON PURPOSE, and they nest:** the **brand** (Frequency, the
  Community Collective) and the **$79 tier** (your own collective *within* the Collective, a collective of
  collectives). Copy keeps them legible ("Frequency, the community collective" = the brand; "the Collective
  plan" / "your Collective" = the tier).
- **Collision guards for "collective":**
  - **The Quest keeps its word.** The game's "collective standing" and `components/quest/collective-goal.tsx`
    belong to **The Quest** (the game we are all on) and are UNCHANGED. Not brand/tier vocabulary.
  - **The marketing "The Collective" paid-content label** (MARKETING-BRIEF §6, the Insight-Timer-style vertical)
    is **renamed** in the marketing phase (e.g. "Premium Content") to free the word for the brand + tier.
- **In-collective vs standalone.** Pricing rides `spaces.network_connected`: connected = in the Collective =
  affordable; disconnected = **Independent** = standard SaaS. Leaving the collective is priced (loss-framed).
- **Retired:** the ADR-552 "no third vocabulary / no tier names" lock (this ADR reintroduces named tiers);
  the flat single-Business $49 model (ADR-590, grandfathered).

## Marketplace & Commerce (ADR-596, July 2026; umbrella revived by ADR-868)

The four consumer commerce surfaces, plus their umbrella. **Member-facing names + public routes
are canonical; the internal vertical ids stay stable** (a documented mismatch: internal id ≠
member label, to avoid data churn — see ADR-596 §6 and the collision guard below).

- **Marketplace** = the member-facing commerce **UMBRELLA** — revived by founder decision
  (ADR-868; ADR-596 had retired the word). It names exactly two things: the single commerce
  menu row in the member sidebar / mobile spine, and the `/marketplace` landing redirect
  (last-visited surface via the `commerce_last` cookie, default Classifieds), plus the pinned
  "Marketplace > …" breadcrumb trail over the four surfaces. It is **never** the name of a
  surface: the four surfaces keep their own names below. "Marketplace" ≠ "Market."
- **Classifieds** = the peer board: members post **offer / free / lend / request** listings,
  connect-only (no in-app money, contact via DM). Free members and up. Route `/classifieds`.
  Internal vertical id stays `market`; table stays `market_listings`. **Supersedes "General
  Marketplace"** as the name for this surface — and note ADR-868: "Marketplace" now names the
  umbrella above, never this board.
- **Market** = the **umbrella commerce surface** grouped by type (**Products · Services ·
  Tickets**), aggregating listings across every Space and every paid member. One browse surface,
  typed rails + curated collections, unified search. Route `/market`. Internal vertical id stays
  `maker`. **Supersedes "Makers."** "Market" is NEVER the peer board (that is Classifieds).
- **Frequency Store** = **first-party** Frequency retail (merch / retreats), Frequency is the
  seller (`commerce_products` `owner_kind='platform'`). Route `/store`. Internal vertical id stays
  `shop`. **Supersedes "Shop"** as the first-party name — "Shop" now belongs to the per-Space tab.
- **Shop** (a Space's) = the per-Space storefront **tab** on a Space profile, showing that Space's
  own catalog. Member-facing default label **"Shop"**, **renameable per Space** by the owner. Its
  listings feed up into **Market**. Distinct from **Frequency Store** (first-party) — see collision
  guard. Managed in the **Shop console** (Catalog · Orders · Storefront).

Commerce item vocabulary (one `commerce_products` row, discriminated by `type`):

- **Product** = a physical or digital good (`type='product'`). Listable by paid members (limited)
  and Business Spaces (full).
- **Service** = a **bookable, payable** offering (`type='service'`): duration, deposit, scheduling
  via the Booking engine, cancellation/no-show policy. **Business Spaces only.** **Supersedes the
  old JSON "Store" services** (`preferences.profileData.offerings`, retired) and the space
  module label "Store" (relabeled to **Shop**).
- **Ticket** = a Market projection of a ticketed event (`type='ticket'`, reuses the event-ticket
  channel, ADR-177). **Business Spaces only.**
- **Listing** = the generic word for any published commerce item OR a Classifieds post; qualify
  ("Market listing" / "Classifieds listing") when the surface matters.
- Reserved item types (schema-only, no surface yet): `digital`, `membership`.

Collision guards:
- **"Marketplace"**: umbrella ONLY (ADR-868) — the sidebar/spine menu row, the `/marketplace`
  landing redirect, and the pinned breadcrumb trail. Never a surface name, never a synonym for
  Market or Classifieds, and never a heading on any of the four surfaces themselves.
- **"Shop"**: the per-Space storefront **tab** (member word, renameable). The first-party retail
  vertical is **Frequency Store**, never "Shop." The management console is the **Shop console**.
- **"Market"**: the umbrella commerce surface (id `maker`), never the peer board. The peer board is
  **Classifieds** (id `market`). The internal id `market` therefore backs the member-facing
  *Classifieds*, and id `maker` backs member-facing *Market* — intentional, documented in ADR-596.
- **"Store"**: retired as the per-Space services label (now **Shop**) and reserved for **Frequency
  Store** (first-party) only. The **Vault Store** (Gems, unchanged) is a separate proper noun.

## Drafts: one surface, every unfinished thing (owner ruling, August 2026)

**Drafts** (capital D) = the member's own page at `/drafts`, and it is the ONLY member surface
that may carry the name. It holds everything a member has started and not finished, whatever
started it:

- a **proposal** Vera drew up for them to look at (nothing is created until they confirm it),
- a **staged wizard draft** they typed into a Spark and stepped away from,
- a **captured event** they photographed off a poster and have not posted yet.

Rules:
- **One page, one word.** `/events/drafts` used to be a second member surface titled "My drafts",
  about captured posters only. It folded in as the third row kind and now redirects to `/drafts`.
  Never build a second Drafts list for a new entity; add a row kind. The per-entity EDITOR keeps
  its own route (`/events/drafts/<id>` is the event draft editor, not a list).
- **Never "My drafts".** The page's H1, its metadata title, the nav row, the ⌘K entry, and every
  link to it read **Drafts**. A menu row that renames its destination makes a member wonder if
  they landed somewhere else.
- **Unfinished is the test.** A thing leaves Drafts the moment it is made: a posted event lists on
  `/events`, a created Circle on `/circles`. The page states this in its own words ("Nothing here
  is made yet"), so a finished thing on it is a copy defect, not a filter preference.
- **The kinds are told apart by a badge, never by a separate page**: "Vera drafted this" ·
  "You started this" · "You captured this".
- **The lowercase common noun is unaffected.** `status='draft'` is a Circle lifecycle (below), a
  Loom asset can be drafted, and an operator email campaign has a drafts state. Those are states of
  a thing, not the surface. Only the member-facing page is capital-D Drafts.
- **A sentence may not OPEN with the state word** on any member-facing surface — see ADR-1030.
  Sentence-initial capitalisation erases the one distinction the rule above rests on, so
  "Drafts and private items stay off this list" (the owner-only note on a profile) read as a
  pointer to `/drafts` when it meant the draft state of the things listed beside it. Recast so the
  word is not first: "Unpublished and private items stay off this list." Title-cased LABELS are
  exempt and stay as they are — a `Drafts` stat count or section heading inside an operator console
  (`/admin/growth/funnels`, `/admin/walkthroughs`, `/admin/content/tips`, `/admin/crm/marketing`) is
  the state word in a position where every label is capitalised, and a member never sees it.

## Retired: zero hits allowed outside this list and ADR-208

Spark/Current/Deep (tiers) · Runner/Operative/Agent (ranks) ·
Echo/Signal/Beacon/Conduit/Luminary (the retired 6-rank Zap-threshold ladder) ·
Initiate/Adept/Master as a *practice* intensity tier (the words are now season RANKS) ·
the Luminary double-gate · Expression as a fourth Journey (it is the Challenge capstone) ·
Seasonal Quest ·
Static/Tuned/Locked/Live (status set) · The Drop · Arc/Arcs/quest_chains · Bolts ·
Field Days / "the Field" / Circle Field · Chorus · Domains (game taxonomy) ·
Depth/Range/Altitude · deshi/sempai/sensei · "points" ·
**"Movement" as a separate member-facing TIMER name** (ADR-360: it is now the
**Get Moving** mode of the one Mindless timer). **Collision guard:** this retires
only the *timer* name. "Movement" stays alive as the topical **Channel** (the
seven topics), as the movement's word in CONTENT-VOICE §6d, and in code/schema
(`timer_kind = 'movement'`, `lib/movement.ts`, `movement_config`), which are
internal and unchanged.

**Rewards Economy v3 cuts (ADR-305), retired reward constructs:**
witnessed / peer awards · secret awards ("Quiet Ones") ·
Co-op Pulse / Co-op Synchrony / Carrier Wave / Circle Current (all circle-collaborative
reward mechanics) · **Practice Shelf** (In Motion / Groove / Deep Groove / Full Cycle
consistency tiers; N Deep depth awards) · Side Quests · the retroactive reward **rules
engine** (the `reward_grants` *table* stays as the season-conversion + idempotency ledger;
only the rules *engine* is retired) · the recruiter / entry-point reward **leaderboard**
(the renamed apex **Catalyst** goes with it; core QR entry-point *capture* stays). The v2
escalating per-Journey Gem bonus (Initiate 25 / Adept 50 / Master 100) is retired:
recognition now rides Pillar Trophies + the Certificate. **KEPT:** Founder's First Week
onboarding.

## Documented exceptions (allowed hits: proper nouns / persisted identifiers)

These contain a retired *word* but are NOT the retired *term*; intentionally kept, and the
Phase-6 zero-hits grep carves them out:

- **Persisted identifiers** kept to avoid data harm: the `'field'` circle-rail key in saved
  `sidebar_order`, and the `journey.chorus:` reward-grant idempotency prefix. Renaming
  either orphans saved prefs / re-fires grants (commented in code).
- **Historical migration filenames** (e.g. `20260610000000_circle_field.sql`): immutable.
- **Deep Groove / N Deep: no longer exceptions (Rewards Economy v3, ADR-305).** With the
  Practice Shelf retired, these award proper nouns are removed; "Deep" stays fully retired.
- The day-3 streak milestone **Spark** (lib/streak.ts) and the **"Sparked"** seasonal badge
  predate the tier retirement and stay (milestone/badge names, not tiers). **Collision note
  (v3):** the new variable-bonus layer is also called **"Spark"** (the capped, low-frequency
  surprise bonus on top of base payouts): same word, three benign meanings (the milestone,
  the badge, the surprise-bonus layer); none is the retired *tier*.

## Collision guards (why no blind replace)

- **"current"**: retired as a tier; **Circle Current is now retired as a reward mechanic
  too** (ADR-305); still alive in time-sense columns (`current_season_*`) and React/JS
  `current` refs.
- **"quest"**: brand (The Quest) vs season instance. Schema only ever = season instance.
- **"field"**: retired as a game term; legitimate in form fields, DB field names, etc.
- **"agent"**: retired as a rank; alive in AI agents (`lib/studio/agent.ts`,
  `agent_actions`, Vera).
- **"initiate"/"adept"/"master"**: now the **season RANKS** (post-June-2026,
  completion-based); RETIRED as the practice-intensity tier they used to be
  (`practice_tiers` dropped). One meaning each going forward.
- **"luminary"**: fully retired as a season rank; the recruiter-ladder apex that
  reused it was renamed **Catalyst** (`lib/entry-points/leaderboard.ts`), and the
  recruiter reward **leaderboard** (Catalyst included) is now retired (ADR-305). Core QR
  entry-point *capture* stays; only the recruiter *reward board* is gone.
- **"channels"**: the focus-area feature only (ADR-864 broadened it from "forum
  only"); any Pillar-as-channel framing is still renamed.
- **"tune"**: "tune in" = the Channels verb; "tune out" / "tune back in" =
  Mindless (the On Air timer). Two dials, no collision.
- **"co-op"**: one meaning only, a Circle **Run** of a Journey (cohort, ADR-252).
- **"task"**: `crew_tasks` IS the canon Task entity: no new entity, no collision.
- **"live"/"static"**: retired only as the old status set; alive in live-location,
  Next.js static rendering, etc.

## Starter Circles (templates the community remixes)

- **Starter Circle**: the member-facing name for one of the staff-authored Circle
  blueprints (3 per Pillar) a leader adopts and runs. Operator surfaces call the
  same records **Circle Templates**. One concept, two audiences.
- **Remix** (the verb): adopting a Starter Circle, or claiming a sample Circle,
  into your own. The button reads **Remix**; the subtitle/tooltip reads "Claim
  this circle, or make it your own." Remixing creates a private DRAFT you own;
  publishing makes a completely original live Circle (no template badge, no link
  back). A template's **Remix it** field lists the variations, the ways to remix
  it, so the verb and the field agree.
- **Make it yours**: the friendly gloss for Remix (also the practice-template
  phrase). The modal heading. Not a separate action.
- **Claim**: kept only inside the Remix subtitle ("Claim this circle..."); no
  longer a standalone button label. The legacy sample-Circle claim is one surface
  of Remix.
- **draft / published**: a Circle lifecycle. `status='draft'` is owner-only
  (hidden from discovery); publishing flips it to `active`. Creating a Circle
  makes you a **Host**, which opens the Leadership tab (`/lead`).
