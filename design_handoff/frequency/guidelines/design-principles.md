# Frequency™ Design Principles

Status: draft 1, for review. Written before any visual design. Nothing here is carried over from the DAWN visual system. Product facts, naming and voice come from the `hellofrequencylab/frequency-web` repo (briefs 01, 02, 03, 05, 06, 07).

---

## 1. What we are designing for

Frequency is huge. The repo maps 32 member feature domains, a 29-module Space console, 62 admin studios and 15 engines across five altitudes (public web, member app, operator consoles, admin, engines). Around 250 member-reachable routes.

Underneath all of it there is one loop:

**Practice → Show up → Gather → Host → (support the next person)**

- A member does something real (a Practice, a Mindless session).
- They show up somewhere (an Event, a Circle Meetup).
- They become part of a group (a Circle, a Run through a Journey).
- Some of them start holding the room for others (Host, Space owner, Crew supporter).

That last step is the reciprocity. Energy comes in as support from the group and goes back out as hosting, showing up for others, backing a Space, or contributing so it stays free. The design job is to make every screen move a person one step along this loop, and to keep the other 240 routes out of the way until they need them.

**The north star is WAM (weekly active members who practiced this week), never screen time.** Every IA decision below is judged against that: does it get someone off the phone and into a room?

---

## 2. Core principles

### P1. One door, many rooms
The front of the app shows a few warm, obvious things. Depth exists behind it, organized in layers (section 3). A new member should be able to use Frequency fully without ever knowing the Market, Housing, QR Studio or the CRM exist.

> Research basis: progressive disclosure. Show a few of the most important options first and a larger set on request. Mobile guidance limits disclosure to about two levels before people get lost.

### P2. Lead with the next real thing
The home screen answers one question: **what's my next real-world moment?** (tonight's Circle, Thursday's event, today's 5-minute Practice). People, places and times go first. Feeds, stats and catalogs go second.

### P3. The engagement budget
Engagement comes from a small number of good choices, not a big menu. Hard limits for any member-facing screen:

| Rule | Limit |
|---|---|
| Primary action per screen | 1 |
| Secondary actions visible without scrolling | 2 or 3 |
| Bottom navigation destinations | 5 max (today's shell has 7) |
| Content modules on Today | 3 to 5, ranked by relevance, never all at once |
| Game counts on primary pages | The four (Zaps, Gems, Streak, Rank), never more |
| Stats on non-game surfaces (messages, settings) | 0 |

When something new has to go on a screen, something else comes off.

### P4. Earned disclosure
Features show up when a person's behavior or role makes them relevant, not when the roadmap ships them.
- Host tools appear once someone hosts or applies.
- The operator console appears once someone owns or staffs a Space.
- Market and Classifieds show up in Explore for everyone, but they only surface on Today when a member has already used them or a Circle they belong to sells something.
- Advanced settings sit behind "More options" on every form.

Nothing is locked or hidden for good. Everything can be found through search and the Explore index. Earned disclosure decides what gets *promoted*, not what *exists*.

### P5. Small rooms first
Groups stay human-sized, and the UI should reflect that. The Circle (≤50 in person) is the main social unit. Hubs, Nexuses and Channels give context and breadth, but they shouldn't compete with Circles for attention.

> Research basis: Dunbar's layers. About 5 close, 12 to 15 close group, about 50 acquaintance band, about 150 stable relationships. Above 150, groups need more rules and enforced norms to hold together.

So the UI shows members faces and first names inside a Circle, counts and maps at the Hub or Nexus level, and topics at the Channel level.

### P6. One mental model, five lenses
Everything a member touches is one of five things. The IA, components and search results all use the same five:

| Lens | What it is | Examples |
|---|---|---|
| **People** | Someone you know or could know | Friends, Hosts, Spotlight pages, Resonance matches |
| **Places** | Where gathering happens | Circles, Hubs, Nexuses, Outposts, Labs, Spaces |
| **Moments** | A time-bound thing to show up to | Events, Meetups, Runs, Seasons |
| **Practices** | Something you do | Practices, Journeys, Mindless sessions, Expression Challenges |
| **Offers** | Something exchanged | Market, Classifieds, Store, Housing, bookings, tickets |

A Circle page, an Event page and a Space page are built from the same parts: who's there, where, when, what you do, what's offered.

### P7. Cooperative, never competitive by default
The game makes people feel capable, connected and in control. It doesn't make them compare themselves to strangers.
- **Competence:** small, clear wins (a 5-minute first Practice, deterministic payouts, completion-based ranks).
- **Relatedness:** progress is shared with *your* Circle (Runs, co-op challenges), not ranked globally.
- **Autonomy:** you choose your path (three Journeys, Be Still or Get Moving), with structure offered rather than enforced.
- No streak shame, no guilt notifications, no global leaderboard (already canon).

> Research basis: self-determination theory. Gamification that relies only on points, badges and leaderboards risks undermining intrinsic motivation. In preventive wellness, fully open goal setting overwhelmed most participants, so offer guided choice rather than a blank slate.

### P8. Lower the cost of the first room
Showing up alone is the hardest moment in the product. Every Moment and Place shows enough to make walking in feel safe:
- Who's going (faces, mutual Circles), what actually happens, how long it lasts, what to bring, who the Host is.
- "First time?" notes written by the Host.
- An option to go together (a friend, a Circle-mate, a Run).
- Check-in is one tap or one scan, and it's celebrated.

> Research basis: Meetup users cite fear of the unknown (not knowing attendees or the venue) and a need for social reassurance. Many lurk for weeks or months before their first event.

### P9. No dead ends, no mazes
Every entity links to its neighbors (Event → Circle → Host → their Practices). Every deep screen has one obvious way back to Today. Depth comes through links between things, not menus inside menus.

### P10. Two registers, one product
**Member register:** warm, people-first, playful glyphs, no analytics. **Operator register:** calm, dense, data-led, built for getting work done. They share parts and tokens but switch modes explicitly (section 3, Layer 4). Members never see operator KPIs, and operators never lose their place in the member app.

### P11. Vera is a bridge, not a destination
The AI shows up in context (draft this event, explain this, find a Circle) and then gets out of the way. It never has its own tab. Success means a member reaches a human sooner.

### P12. Honest by default
Demo content is labeled. Money stays quiet: no flow ends on a sale. Notifications always carry a fact or a 5-minute invitation. Empty states teach the next step with one CTA.

---

## 3. The layer model (information architecture)

Seven layers. Each one deeper than the last, each with its own entry point. A member lives in layers 0 to 2. Most never go further.

```
L0  Today            the front door: next moment + one practice + one person
L1  Primary tabs     5 destinations, always visible
L2  Sections         tabs inside each destination (underline tabs, max 4 or 5)
L3  Explore index    every member feature, A to Z and by lens; also search (⌘K)
L4  Run mode         Host / Space operator console (explicit mode switch)
L5  Studio           platform staff
L6  Public web       marketing, /discover, Spotlight, help (signed-out)
```

### L1: proposed primary navigation (mobile bottom bar, desktop rail)

| Slot | Name (working) | Holds | Why it's up front |
|---|---|---|---|
| 1 | **Today** | Next Moment, today's Practice, a Dispatch, one person or Circle suggestion | The front door (P2) |
| 2 | **Gather** | My Circles, Events near me, map, Channels | Places + Moments, the WAM engine |
| 3 | **Practice** (center action) | Opens Mindless / log a Practice / Capture | The north-star act, one tap away |
| 4 | **Connect** | Messages, Friends, people near you | Relationships after the room |
| 5 | **You** | Quest progress, Vault, Journeys, Journal, Spotlight, settings | Identity + game, all in one place |

Today's seven-slot bar (Menu + 5 worlds + Zap) goes down to five. The drawer goes away and its job moves to **Explore** (L3), which you reach from search and from a "See everything" link at the bottom of Today and Gather.

> Research basis: platform guidance is consistent on 3 to 5 bottom destinations of similar importance. Each tab goes straight to a destination, never opens a menu. Overflow lives in an alternate location such as a drawer or index.

Open question: whether the center slot is **Practice** (opens Mindless) or **Capture** (post/photo/scan/log). Section 5, Q2.

### Where all 32 domains live

| Layer | Domains |
|---|---|
| **L0 Today** | Next event, today's Practice, Dispatch from Vera, Circle activity, one suggestion |
| **L1/L2 Gather** | Circles · Events · Hubs / Nexuses (as context) · Channels · Map · Dispatches |
| **L1 Practice** | Mindless · Practice log · Capture · Scan (QR / nodes) |
| **L1/L2 Connect** | Messages & rooms · Friends · People nearby · Resonance (opt-in) |
| **L1/L2 You** | Quest & Season · Journeys · Vault & Store · achievements · Journal · Spotlight · Connections (personal CRM) · Orders · Settings · Notifications |
| **L3 Explore** | Market · Classifieds · Frequency Store · Housing · Library · Airwaves / podcasts · Spaces directory · Partners · Discover · Help · Referrals · Crew membership |
| **L4 Run mode** | Host tools · Space console (29 modules / 12 boxes) · Entity consoles (Circle, Event, Hub, Nexus, Channel, Journey) · QR Studio for Spaces · CRM · Email |
| **L5 Studio** | All 62 admin destinations |
| **L6 Public** | Marketing site · /discover · Spotlight pages · Help center |

### L4: Run mode
Anyone who hosts or runs something gets a **mode switch** in the You tab ("Switch to: Thursday Run Club / Cedar Studio"). Run mode swaps in its own nav (Overview, People, Calendar, Offerings, Content, Settings), keeps the same visual parts in a denser register, and always shows a "Back to member view" control. Each Space's Module Manager decides which of the 29 modules show up, and the defaults are minimal: a new Free Space sees 4 or 5 boxes, not 12.

---

## 4. Best practices by area

Each area: the job, what goes up front, what goes deeper, and the main pitfall to avoid.

### Today (home)
- **Job:** get the member to their next real moment.
- **Up front:** one hero (next Moment or today's Practice), up to 3 more cards ranked by relevance, the four game counts in a compact strip.
- **Deeper:** the full Feed lives under Gather or Connect, not as the home screen.
- **Pitfall:** turning Today into an infinite feed. It should end. "You're caught up" is a feature.

### Onboarding
- **Job:** one first win in the first session, three small wins in week one.
- **Up front:** location + 1 to 3 interests → one suggested Circle or Event + a 5-minute first Practice. No tour.
- **Deeper:** Spotlight setup, Resonance, notification preferences come later, when they're relevant.
- **Pitfall:** front-loaded tours. Research shows members lost in month three were usually lost in week one, looking at a wall of channels that meant nothing yet. Members who complete a start-here checklist return much more often.

### Events (Moments)
- **Job:** RSVP → actually show up → check in.
- **Up front:** time, place, who's going (faces), Host, "what it's like," one RSVP button.
- **Deeper:** tickets, series, co-hosts, Q&A, recap, .ics.
- **Pitfall:** vague descriptions. Anxious first-timers need specifics. Reminders carry facts ("Starts at 7. Bring nothing.").

### Circles, Hubs, Nexuses (Places)
- **Job:** belonging to a small group.
- **Up front:** next meetup, member faces, this week's Practice, the wall.
- **Deeper:** Hub / Nexus context shown as breadcrumb + map, Starter Circle blueprints, transfer.
- **Pitfall:** treating the geographic tree as navigation. Members join Circles. Hubs and Nexuses are context, shown as "part of" links, not tabs.

### Channels
- **Job:** breadth and topic discovery around the world.
- **Up front:** the seven Channels as a simple index with "tune in."
- **Deeper:** threads, local Chapters.
- **Pitfall:** Channels competing with Circles. A Channel should always point somewhere local ("3 Circles near you practice this").

### Practice, Mindless, Journeys, the Quest (Practices + game)
- **Job:** daily action that leads to belonging.
- **Up front:** one button to start, one sentence on what you get, payout revealed afterwards.
- **Deeper:** Journey builder, Library, forking, Vault Store, achievements.
- **Pitfall:** showing the whole economy (Zaps, Gems, Amplitude, Spark, freezes, ranks, trophies) on day one. Disclose it as it's earned: Zaps first, Gems at the first rollover, ranks at the first Journey completion.

### Connect (Messages, Friends, Resonance)
- **Job:** keep relationships going between gatherings.
- **Up front:** recent conversations, people from your last event.
- **Deeper:** rooms with roles, directory, Resonance settings, contacts CRM.
- **Pitfall:** turning into another chat app. Messaging should keep pointing back to a Moment ("Going Thursday?").

### Offers (Market, Classifieds, Store, Housing)
- **Job:** local exchange built on trust.
- **Up front:** none for new members. Surfaced in Explore and in context (a Space's Shop tab, an Event's tickets).
- **Deeper:** listings, orders, disputes, payouts.
- **Pitfall:** commerce leaking into the member home screen. Trust signals (Trust Score, verified, mutual Circles) go on every listing.

### Spaces and Run mode (operators)
- **Job:** run a practice or business without tool sprawl.
- **Up front:** Today-for-operators: next booking or event, new people, one suggested action.
- **Deeper:** CRM, Email, Page editor, QR, Plan & billing, all through the Module Manager.
- **Pitfall:** showing 29 modules to a solo teacher on day one. Start minimal and grow by activation.

### Vera (AI)
- **Job:** remove friction, then step aside.
- **Up front:** contextual chips inside composers and empty states ("Draft this from a poster").
- **Deeper:** /help/ask, memory settings.
- **Pitfall:** a chat tab. Vera has no L1 home.

### Notifications
- **Job:** an invitation, not a summons.
- **Rules:** every message has a fact or a 5-minute ask. Batch by default. The weekly digest skips when empty. Never use streak threats.

### Search & Explore
- **Job:** the release valve that makes aggressive progressive disclosure safe.
- **Rules:** ⌘K / search on every screen; results grouped by the five lenses; Explore lists every member feature so nothing is lost.

### Physical layer (QR, NFC, nodes, check-in)
- **Job:** the bridge from screen to room.
- **Rules:** scanning is one tap from anywhere (the Practice center action). The scan result is always a celebration + next step, never a dead page.

---

## 5. Open questions for you

1. **Tab names.** Today / Gather / Practice / Connect / You are working names. Should the tabs use the canon nouns (Circles, Quest) or plain verbs?
2. **Center action.** Practice (opens Mindless) or Capture (post/scan/log)?
3. **Feed.** Does a ranked feed belong at L1 at all, or does it live inside Gather and Connect?
4. **Operator entry.** A mode switch inside You, or a separate app shell / subdomain for Run mode?
5. **Commerce visibility.** Is keeping Market / Classifieds / Housing out of L0–L1 for new members acceptable to the business plan?
6. **Desktop.** Same five destinations as a rail, or does desktop get a richer right-hand context panel?

---

## Sources

- NN/g, Progressive Disclosure: nngroup.com/articles/progressive-disclosure
- Digia, Progressive Disclosure in Mobile UX (two-layer limit): digia.tech/post/progressive-disclosure-mobile-ux
- Material Design, Bottom navigation: mdui.org/en/design/1/components/bottom-navigation.html
- UX Planet, Bottom Navigation: uxplanet.org/perfect-bottom-navigation-for-mobile-app-effabbb98c0f
- Bettermode, Onboarding community members: bettermode.com/blog/onboarding-community-members
- Circle, Community onboarding: circle.so/blog/community-onboarding
- Yu-kai Chou, Self-Determination Theory: yukaichou.com/gamification-analysis/self-determination-theory-guide-to-ryan-and-decis-motivation-framework
- PubMed 42460595, SDT gamification framework for preventive wellness
- Meetup UX case studies (Pollok; tomcdesigner) and Meetup 2025 redesign: meetup.com/blog/new-design-2025
- Dunbar layers: cstarendal.medium.com/the-dunbar-number-40c826da34c3; LibreTexts Sociology 6.5A
- Repo: hellofrequencylab/frequency-web, design_handoff/BRIEF-01..07
