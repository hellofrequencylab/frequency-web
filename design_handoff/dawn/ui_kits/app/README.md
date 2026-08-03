# UI Kit — In-app community (the member app)

A high-fidelity recreation of Frequency's in-app community feed. This is the
**light, airy** half of the brand: open content on a warm cream canvas, an
editorial feed, and the "group, don't box" rail philosophy — deliberately *not*
a SaaS dashboard.

## Run it
Open `index.html`. It loads the DAWN bundle (`../../_ds_bundle.js`) + Lucide and
renders the member shell. Try it: type in the composer and **Share** (your post
lands at the top of the feed), tap the **heart / +1** on any post (counts and
the amber zaps chip update live), switch left-nav worlds, and tap the **Quest
dock** at the bottom of the right rail to expand the progress cockpit.

## What's here
- **`nav-rail.jsx`** — `NavRail`: the single left navigation, the member's
  "worlds" grouped (Home · Community · Practice · Connect · The Quest) with an
  amber active state; member chip + rank badge pinned at the bottom.
- **`feed.jsx`** — `FeedComposer` (the post box) + `FeedPostCard` (author row
  with role badge + scope arrow, body, optional photo, right-aligned reaction
  row with the **zaps earned** chip = reactions + replies×2).
- **`right-rail.jsx`** — `RightRail`: borderless editorial modules. One
  intentional tinted card ("Getting started"), then titled grouped lists
  ("Happening near you", "Members nearby") separated by whitespace, and the
  `StatsDock` (compact zaps/gems bar that expands to rank progress + a 7-day
  streak strip).
- **`index.html`** — the shell: nav rail + center feed (time-aware greeting
  header) + right rail, with live composer/reaction state.

## Rules it follows
- **Type is the hero, group don't box.** A card means a *distinct object*; rail
  sections are titled groups + whitespace, not a stack of identical boxes.
- Soft warm shadows (`shadow-sm` resting, `shadow-md` hover), hairline borders,
  `radius-xl` cards, `radius-md` controls.
- Role badges, rank badges, and the zaps chip use the real semantic tokens
  (amber primary, teal signal). Success is teal, never green.
- The right rail shares one scroll with the feed; the dock is sticky.

## Composed from
DAWN primitives: `Avatar`, `Badge`, `RankBadge`, `IconButton`, `Button`. Feed +
rail layouts are kit-local compositions.

> Recreation, not redesign. Mirrors `components/feed/post-card.tsx`,
> `components/layout/app-shell.tsx`, and the rail/dock model in `docs/DESIGN.md`.
