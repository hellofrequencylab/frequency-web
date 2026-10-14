# Handoff: Member Feed (Frequency home)

## Overview
This is the signed-in home for Frequency members (route `/feed`, repo `hellofrequencylab/frequency-web`, `app/(main)/feed/page.tsx`). It replaces the marketing-style home with a ranked, local feed. The page exists to get the member to their next real gathering. Order: standing, one ranked pick, what's near you, friends' plans, a short queue of personal asks, then posts. The feed ends with a hard stop ("You're caught up").

North star: weekly active members who **showed up**. Screen time is not the goal. The feed is deliberately finite.

## About the Design Files
`Feed.dc.html` is a **design reference built in HTML**. It is a working prototype that shows the intended look and behaviour, not production code. Recreate it in the existing frequency-web stack (Next.js / React) using its patterns, components and the Frequency Design System tokens. Do not ship the HTML.

The prototype is one self-contained file. It inlines the global header, the rail tabs and a "Repo notes" dev panel. In the codebase these should be separate components; see "Component breakdown".

## Fidelity
**High fidelity.** Colours, type, spacing, radii, motion and copy are final. Recreate them pixel-accurately using the codebase's design-system primitives. All copy follows `docs/CONTENT-VOICE.md`: sentence case, no em dashes, numbers over adjectives.

---

## Layout

### Page shell
- Root: `data-theme="commons"`, `data-energy="flow"`, `data-time="day|night"`. Background is `var(--surface-card)`, plus a fixed decorative wash (see Tokens → Background wash) and `.fq-grain` at opacity .07.
- **Header**: sticky, 76px tall, full width, horizontal padding 40px.
- **Body grid**: `display:grid; grid-template-columns: <L> minmax(0,1fr) <R>; gap:56px; padding:44px 40px 160px; align-items:start`.
  - `L` and `R` are the rail widths. **Both share one width `W`**: default 260, clamped 220–320. A collapsed rail is a **76px micro rail**.
  - Transition: `grid-template-columns 300ms cubic-bezier(.16,1,.3,1)`. Disable it while dragging.
- **Centre column**: `max-width:860px; justify-self:center`. Extra width becomes white space.
- **Rails**: `position:sticky; top:108px; height:calc(100vh - 132px); min-height:420px`. The scroll area has its scrollbar hidden. A tab sits pinned to the bottom of each rail.

### Responsive rules
| Viewport | Left rail | Right rail |
|---|---|---|
| ≥ 1240 | user choice | user choice |
| 960–1239 | user choice | auto micro |
| 680–959 | auto micro | auto micro |
| < 680 | hidden | hidden (single column) |

The user's explicit collapse/expand choice overrides the auto state. Persist `{ w, lc, rc }` in localStorage (prototype key `fq-feed-rails`) or user prefs.

### Rail resize and collapse
- Each rail has a 12px handle on its **inner** edge, centred in the 56px gap: left rail `right:-34px`, right rail `left:-34px`.
  - At the top of the handle: a 28px round chevron button that toggles collapse. Glass style: white 75%, 1px inner ring at 8% ink.
  - Below it: a 1px hairline, `rgba(30,27,24,.06)`. On hover the hit area tints `rgba(196,184,255,.22)`, and the cursor is `col-resize`.
- Dragging either handle sets the shared `W`; the left rail grows with +dx and the right rail with −dx. Dragging below 150px collapses that rail to micro. Double-clicking the handle toggles collapse.
- Set `user-select:none` on the page while dragging.

### Scroll sync
Both rail scroll areas track the window scroll proportionally: `rail.scrollTop = p * (rail.scrollHeight - rail.clientHeight)`, where `p = scrollY / (docHeight - innerHeight)`. All three columns reach top and bottom together.

---

## Components

### 1. Header (global; lift into `components/shell/Header`)
- **Logo**: the wordmark only, with no roundel. It sits over the left rail at **exactly the rail width** (`max(railWidth, 200px)`, so it stays legible above a micro rail). Aspect ratio 1920/389.
  - Rendering: a CSS mask of `assets/logo/frequency-wordmark.png` over an ink base `rgba(52,49,46,.88)`.
  - Moving translucence: an inner layer 300% wide carries a repeating linear gradient (100deg: transparent → `#EEC1EC` .85 → `#C4B8FF` .9 → `#8FE9FF` .85 → transparent). It animates `translateX(-66.667%) → 0` over 16s, linear, infinite. Stop it under `prefers-reduced-motion`.
- **Section pill**: Home / Community / The Quest / You. Each is 40px tall with a pill radius, inside a track of `rgba(30,27,24,.035)` with 4px padding.
  - Active item: background `--pa`, plus `--pa-glow` and a 1px inner white ring at 50%.
  - Inactive item: text `--text-muted`. Hover: text `--text-strong` on 60% white.
  - Click opens a **mega menu**: a full-width frosted panel under the header. It has two link columns (icon, title 600 15px, sub 14px muted), two photo cards (170px tall, radius 24), and a footer line in Instrument Serif italic 21px with a `--pa` CTA. The menu content is in the prototype's `navVals()`.
- **Right cluster**:
  - Search field: 40px, `rgba(30,27,24,.04)`, label "Search", ⌘K.
  - Messages and Notifications: 40px round icons with a 7px `--pa` dot. Notifications opens a 360px sheet.
  - **Zap** button: 44px, `--pa` fill. Opens the "Capture a moment." sheet (Share / Event / Contact / Connect, plus a Mindless card).
  - Avatar: 40px, at the far right.
- **Scroll behaviour**:
  - At the top of the page: transparent.
  - While scrolling or with a menu open: 86% surface, blur 22px, hairline border, soft shadow, plus the `--pa-soft` wash at .9.
  - Idle after scrolling (900ms): 52% surface, blur 14px, wash at .35.
  - All of these transition over 480ms with ease-breath.
- At widths under 1180, labels hide and the menu shows icons only.
- Escape closes any open menu or sheet.

### 2. Left rail
**Expanded**, top to bottom, with a 40px gap between groups:
- **Profile**: 44px avatar, name (500 15px), then a glass "Initiate" chip (24px, white gradient glass) and "Crew" in `.fq-iri-text.on-light`.
- **Shortcuts**: 44px rows with 20px icons and 500 15px labels. Hover: 60% white plus `translateX(3px)`. Rows: Around You, Messages (3), Events, Marketplace, Members (2), Journal, My Code.
- **Your Circles**: 36px photo orbs, each with a 9px `--pa` presence dot. Name (500 14px, ellipsis) and meta (12px muted).
- **Keep learning**: "Mind Journey", a 3px progress bar (42% in `--pa`), and "Week 2 of 4 · Lesson 6 next".

**Micro (76px)**:
- Centred column: 44px avatar, then 48px icon buttons with 24px icons. Badges become 8px `--pa` dots.
- Then a 24px divider, 40px Circle orbs, and a 40px Journey progress ring.
- **Every item shows a hover tooltip**:
  - Style: dark pill `rgba(52,49,46,.92)`, radius 14, padding 9×13. Title is 500 13px white; the optional sub line is 12px at 70% white.
  - Position: fixed, vertically centred on the item, 12px outside the rail (right of the left rail, left of the right rail).
  - Hide it on mouse-leave and on scroll.

**Bottom tab "You"**:
- Glass tab, 60px tall, radius `24 24 18 18`, with a 28×4 grabber.
- Shows avatar, "You" and "Initiate · Crew", plus a chevron that rotates 180° when open.
- It opens a 300px frosted panel rising from the tab (opacity plus a translateY(14px) scale(.96) → 0/1 transform, 200/340ms ease-out). The panel holds the profile header, links (My profile, Journal, My Code, Orders, Join Crew), the "What you run" card, and Settings / Help / Site map.
- Micro version: the avatar only.

### 3. Right rail
**Expanded**: glass sections, radius 24, padding 22, 20px gap.
1. **Get started** (onboarding). See Interactions → Get started.
   - Card background is a stronger glass (white .86 → .5) with `.fq-aura` at .28.
   - Header: a 46px conic progress ring with the count "4/7", "Get started" (Unbounded 500 16px), the sub line "Set up your network · 3 left", and a 32px × to hide.
   - Steps: rows at least 44px tall, separated by hairlines.
     - Done: 22px `--pa` check, text faint.
     - Todo: 22px outline ring.
     - Current: 22px breathing white orb with a lilac ring and expanded content. The expanded content is a 13px body line, a 40px `--pa` CTA, and a "Later" text button.
2. **Your week**: rows Mon 12 … Sun 18, each with an 11px day name and a 16px display date. Plans show as a 6px `--pa` dot, the name and a muted time. Empty days show a hairline. Footer: "Show up 3 times" with a 4px progress bar animated over 480ms.
3. **Today's goals**: three goals with progress bars. Rewards show as "⚡ 35". Completed goals are struck through and get a lilac check.
4. **Bird Rock this week**: a signal-line SVG (stroke `#B8A2FF` at 1.5px), an iridescent 79% meter, and a top-4 local leaderboard with "You" in bold. Footer: "Local and cooperative. Opt out in Settings."
5. **People to know**: 40px avatar, name, a plain reason line, and "Add".

**Micro**: 56×62 buttons, each with a 24px icon and a 12px value underneath. Items: Get started (count), Your week (plan count), Today's goals (1/3), Bird Rock (#3), People (3). Each has a tooltip. A click expands the rail.

**Bottom tab**: a split tab. The Vera orb (44px hit, 28px breathing orb) opens a chat panel. The Vault segment shows "● 12  ⚡ 340  💎 85" and opens the Vault panel (Zaps, Gems, streak, awards, streak freeze 40 💎, "Open the Vault"). Micro version: the orb stacked above "⚡ 340".

### 4. Centre column, in order
1. **Greeting**
   - Meta line: "Monday, October 12 · 4:20pm · Bird Rock" (14px muted).
   - H1 "Good afternoon, *Daniel.*": Unbounded 500, `clamp(32px,4vw,46px)`, tracking −.05em. The name is Instrument Serif italic at 1.08em.
   - Context line (15px): weather, sunset, and the count of live items.
   - **Create** button: 48px, `.fq-iri-rim`, glass. It opens a 280px menu: Post, Event, Circle, Practice, Journey, Listing, each with a sub line.
2. **Standing**
   - Four tappable stats: 12 Day streak, 340 ⚡ Zaps this season, 85 💎 Gems to spend, and Initiate as the Season rank (iridescent text in a glass pill). Numbers are 40px Unbounded. The active stat label is underlined (1.5px ink).
   - The numbers count up over 1100ms with an ease-out cubic.
   - Below the stats, a glass panel swaps content by stat:
     - **Streak**: a 120px conic ring with a breathing blurred orb behind it; a seven-day chain (32px nodes, done = `--pa` with a check, today = breathing white orb, future = glass); "2 freezes"; and the **Tune out** CTA, which starts Mindless.
     - **Zaps**: a breakdown by source.
     - **Gems**: a Vault prompt.
     - **Rank**: a four-step rank track.
3. **Up next**: the hero, one ranked pick.
   - Card with radius 28: a photo pane (min 260px tall) carrying a reason badge, and a content pane (padding 26/28).
   - Content: "UP NEXT FOR YOU" (label 11px, +.14em) with "1 of 3"; the event name in 32px Unbounded; "when · place · distance"; overlapping friend faces with the friend line and "⚡ 25 at the door"; and the **why** line in serif italic 16px muted.
   - Actions: **Going** (`--pa`, 48px) / **Maybe** (outline) / **Can't go** (text).
     - Going shows a confirmation: "You're going. Reminder at 5:45pm." with "Bring Marcus" and "Next idea →".
     - Maybe and Can't go advance to the next pick.
4. **Near you**: the explorer.
   - Header with a breathing dot and a live result count, e.g. "2 things · 1 with friends".
   - Filters:
     - Intent chips, 44px: Anything, Move, Sit, Social, Learn, Give back. The active chip is ink with white text.
     - Underline time tabs: Now, Tonight, Tomorrow, This week. Default: **Now**.
     - Radius: 1 / 5 / 15 mi.
   - Result rows: 60px thumb, name (live items get a breathing dot), "when · place · distance", friend faces and line, and a toggle (**Go** outline ↔ **Going** `--pa` with a check).
   - Empty state: "Nothing that fits within N mi." with a "Widen to 15 mi" button.
5. **Your people's plans**: a horizontal scroll of 168px glass cards (avatar, name, "Event · when", Join pinned to the bottom). Join sets Going; the card then reads "You're in".
6. **Needs you**: a queue of one-tap asks, with a "N waiting" count. Each row: a 40px avatar or icon, title (500 15px), sub (13px muted), and a 44px primary plus a secondary button. Acting on a row removes it and shows a toast. When the queue is empty: serif italic "All clear. Nobody's waiting on you."
   - Audrey asks: bring a speaker Thursday? (I've got it / Can't)
   - Beach cleanup poll (Sat 8am / Sun 4pm)
   - Lesson 6 (Start / Tonight)
   - Check in with Marcus (Say hi / Skip)
7. **Composer**: a glass pill with a 40px avatar, the placeholder "Share a moment with your people", and Photo / Event / Log practice / Listing icons.
8. **Sort lens**: underline tabs Nearby, Resonance (default), Recent, Popular, Story. Story adds the line "A record of what the community lived, not a scroll to consume."
9. **Posts**: items sit between hairlines (`rgba(30,27,24,.07)`) with 32px vertical padding and no cards. A 6px `--pa` dot marks the source type. Each post can show a small **why** label on the right (12px faint).
   - **Recap**: a 2fr/1fr photo grid, 340px tall, with corner radii 24/8; the last tile carries "+4". Actions: check-ins, comments, Share, and "8 checked in".
   - **Milestone**: "Priya hit 30 days in a row" with a **High five** button, which becomes "Sent. You and 11 others."
   - **Journey Run**: a glass card with `.fq-aura`, a 76px progress ring, the lesson title, a serif prompt, a lesson checklist, and "Continue lesson".
   - **Classifieds**: a 3-up grid of listings (4/5 images, radius 20) with "Message Priya" and "Meet up to swap. No in-app payment."
   - **Join notice**: a single centred line.
   - **Dispatch**: from a Business Space.
10. **You're caught up**: the end cap.
    - A `--pa-soft` card with radius 28, a breathing orb, "You're caught up." (22px), and a line naming a live alternative.
    - Its button, "Find something for tonight", sets Near you to Tonight and Anything, then smooth-scrolls to it (offset 110px).

### 5. Toasts
A fixed pill, bottom-centre 76px, `rgba(52,49,46,.92)`, 14px white, auto-hiding after 2.8s. Used for RSVP changes, queue actions and onboarding progress.

---

## Interactions & behaviour

### Get started (onboarding)
There are seven steps, in order: photo, home base, interests, first Circle, connect with 3 people, say you're going to something, reminders.
- The current step is the first unfinished one, unless the user opened another. Clicking any unfinished row opens it.
- The CTA marks the step done, shows the toast "Done: X. N to go.", and opens the next step. "Later" skips to the next unfinished step.
- The **RSVP** step completes itself once the user is going to anything. Its CTA jumps to Near you set to Tonight.
- When all seven are done: the header sub becomes "All done", the box shows "Your network is set up. ⚡ 50 added …", and the toast reads "You're set up. ⚡ 50 added."
- × hides the box and its micro-rail item. Persist this server-side.
- In production each CTA should open its real flow (photo upload, location picker, interest picker, Circle finder, My Code, notification permission).

### Ranking (Up next / Near you)
These are the signals named in the prototype; implement them server-side.
- Distance and travel time
- Friends and Circle-mates going
- Past attendance with the host or Space
- Usual days and times
- Current Journey or practice
- Saves, skips and Can't go
- Freshness that decays toward start time

Show a plain-language **why** on each card. The `showWhy` setting can hide the reasons.

### Motion
- Easing: out `cubic-bezier(.16,1,.3,1)`; breath `cubic-bezier(.45,0,.55,1)`.
- Durations: 160ms for press and lift; 260–300ms for rails and panels; 480ms for header and meters.
- Press scales to .97. Hover lifts buttons by `translateY(-1px)`.
- `.fq-breathe` (flow pulse, 5s) is used only for living things: live dots, today's node, the Vera orb and the current onboarding step.
- Reduced motion stops all loops and the logo drift, and skips the count-up.

---

## State
| State | Type | Notes |
|---|---|---|
| going | `Record<eventId, boolean>` | RSVP; drives Your week, the goal and the plans cards |
| pick, heroDone | number, bool | hero carousel index and confirmation |
| intent, slot, radius | enum, enum, number | Near you filters (default all / now / 5) |
| needs | `string[]` | remaining queue ids |
| stat | enum | standing panel tab |
| sort | enum | feed lens |
| gsDone, gsOpen, gsHidden | map, id, bool | onboarding |
| railW, lc, rc | number, bool\|null, bool\|null | rails; `null` means auto by viewport |
| navOpen, dockOpen | enum\|null | header menus, rail panels |
| toast, tip | string, object | ephemeral |

Data needed:
- Events near the member with friend overlap
- Member standing (streak, Zaps, Gems, rank)
- Pending asks
- Feed posts with ranking reason
- Onboarding progress
- Local leaderboard
- Suggested people with a reason

---

## Design tokens
Use the Frequency DS tokens (`tokens/*.css`). These page-level values sit on top of them:
- `--pa` (accent gradient): `linear-gradient(120deg,#EEC1EC 0%,#C4B8FF 36%,#A3D4FF 68%,#8FE9FF 100%)`. Used only where it means something: primary actions, progress, live dots.
- `--pa-soft`: `linear-gradient(120deg,rgba(196,184,255,.2),rgba(143,233,255,.22))`
- `--pa-orb`: `radial-gradient(circle at 35% 30%,#fff 0,#E6CDF4 26%,#B3C6FF 58%,#8FE9FF 100%)`
- `--pa-glow`: `0 12px 28px -14px rgba(120,150,225,.55)`
- Text: strong `#34312E`, body `#4D4945`, muted `#7C766F`, faint `#A59F98`
- Hairline: `rgba(30,27,24,.07)`. Track: `rgba(30,27,24,.06)`.
- Glass panel: `linear-gradient(150deg,rgba(255,255,255,.62),rgba(255,255,255,.28))` with `backdrop-filter: blur(16px) saturate(1.3)` and `box-shadow: 0 20px 50px -36px rgba(30,27,24,.3), inset 0 0 0 1px rgba(255,255,255,.75)`.
- Background wash: radial ellipses at 6%/0% (lilac .24), 98%/14% (aqua .28) and 70%/100% (violet .18).
- Type:
  - Unbounded 500 for display. Tracking −.03 to −.06em; labels 11px at +.14em, uppercase.
  - Hanken Grotesk 400/500 for UI: 13px meta floor, 14–15px UI, 16–17px post body.
  - Instrument Serif italic for the soft voice: the why lines, empty states, the greeting name.
- Radii: 14 (tooltip), 16 (icon buttons, thumbs), 20 (listings), 22 (small cards), 24 (panels), 28 (hero and end cap), pill for buttons and chips.
- Hit targets: 44px minimum. Primary CTA is 48px.

## Assets
- `assets/logo/frequency-wordmark.png`: owner-supplied, used as a mask.
- `assets/photos/*`: owner gathering photos (day beach, meditation circle, park yoga, parachute play, string lights, gatherings 02–08).
- `assets/icons/inline.js`: inlines the in-house sprite (`#pin #message #event #ticket #contacts #tip #qr #program #checkin #zap #standing #space #nudge #search #page #circle #arrow`). Use the DS icon component in code.

## Component breakdown (suggested)
- `Shell/Header` (mega menu, sheets)
- `Shell/RailLayout` (resize, collapse, persistence, scroll sync, tooltip)
- `LeftRail` (+ micro)
- `RightRail` (+ micro)
- `RailTab/You`
- `RailTab/VeraVault`
- `Feed/Greeting`
- `Feed/Standing`
- `Feed/UpNext`
- `Feed/NearYou`
- `Feed/PeoplePlans`
- `Feed/NeedsYou`
- `Feed/Composer`
- `Feed/SortLens`
- `Feed/posts/*` (Recap, Milestone, JourneyRun, Classifieds, JoinNotice, Dispatch)
- `Feed/CaughtUp`
- `Onboarding/GetStarted`
- `Toast`

## Files
- `Feed.dc.html`: the full prototype. The markup is plain HTML with inline styles; the logic class at the bottom holds all data, state and handlers (`navVals`, `dockVals`, `renderVals`). It loads `support.js` (the prototype runtime only; not needed in production) and the DS bundle from `_ds/…`.
