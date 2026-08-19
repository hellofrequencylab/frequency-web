# DAWN — the Frequency Design System

> **Frequency™ — "Community Collective."**
> Community infrastructure for real-world connection: a worldwide framework plus
> brick-and-mortar third spaces. **DAWN** is the design system behind it. Warm
> cream and ink, amber as the one accent, Nunito everywhere and Anton on the
> marketing headlines, the wood-slat dark beat, and everything built on them.

This README is the design spec **and** the manifest. Read it, then open the
**Design System** tab for every token and component card, or `ui_kits/*/index.html`
for the two product recreations.

**Last synced with production: 2026-08-03.** This round production was the source
of truth (`design_handoff/HANDOFF-TO-DAWN-2026-08-03.md` plus briefs 01 to 05 in
`hellofrequencylab/frequency-web`). Token values here match `app/globals.css`
value for value.

---

## 1. The product, in brief

Frequency is a platform for **place-based, in-person community practice**. Local
**Circles** gather around shared interests, grow into neighborhood **Hubs** and
area **Nexuses**, and are wrapped in a gamified physical-world layer (QR, NFC,
geolocation). The mission, locked May 2026: *shared interests into real-world
community, a free global mission, a game that drives people offline, and physical
spaces where it lives.*

The north-star metric is **WAM**, weekly active members: people who actually
practiced this week. Never screen time.

**Two entities, one community graph.** The Frequency Foundation (nonprofit) makes
membership free and creates demand; Frequency Labs (for-profit) runs the physical
third spaces and the marketplace. The graph and the game are entity-blind; money
is hard-partitioned, and **"points are not money" is law**.

**The loop:** log a Practice → advance a Journey → finish a Journey (+75 Zaps, a
Trophy, and the rank advance) → three Journeys is Master plus a Certificate → at
season end Zaps roll into Gems 5:1 and counters zero. Streaks, Spark, and Welcome
Back sit on top. Cooperative and local only, so **there is no global leaderboard**,
and there is **no streak shame, ever**.

**Right now:** billing is live (since 2026-07-25), so every plan CTA charges the
published price. The open beta ("Summer of Frequency") is about ACCESS, not price:
free members are comped the full gamification loop and the paid meters do not bite
until graduation on **September 1, 2026**. It carries no price offer of any kind,
and the Opening Beta rate closed on 2026-08-17.

### The vocabulary designs must use

| Term | Meaning |
|---|---|
| Circle → Hub → Nexus → Outpost → Frequency Lab | The gathering-place ladder. Circles never meet in Outposts |
| Channels | The seven global topical forums. Verb: "tune in" |
| Pillars | Mind / Body / Spirit / Expression, the taxonomy Journeys organize by |
| The Quest / a Quest | The year-round game / one 13-week season instance |
| Season | 13 weeks aligned to nature: Stretch · Shed · Sit · Sprout |
| Journey → Practice | A ~4-week group program → the atomic real-world act you log |
| Run | One Circle taking one Journey together, the flagship mechanic |
| Zaps ⚡ / Gems 💎 | Real-world seasonal currency (never spendable) / online spendable currency |
| Season ranks | **Ghost (0) → Initiate (1) → Adept (2) → Master (3)** Journeys finished |
| Amplitude | Lifetime cumulative Zaps. Never resets |
| Trophy / Certificate | Per-Journey award / the season capstone |
| The Vault / Vault Store | Where rewards accrue / where Gems are spent |
| Mindless | The one member-facing timer. Modes **Be Still** and **Get Moving**. Verb: "tune out" |
| Vera | The one AI persona. A bridge to humans, not a destination |
| Crew → Host → Guide → Mentor | Community roles. Crew is the paid tier |
| Catalyst | The recruiter apex title |
| Market / Classifieds / Frequency Store / Shop | Umbrella commerce surface / peer board / first-party retail / per-Space tab |
| Business / Non Profit | The only two public Space designators |
| Spotlight | A member mini-site |

**Retired. Never design with these:** the Echo/Signal/Beacon/Conduit/Luminary and
Runner/Operative/Agent rank ladders · Arcs · Side Quests · Practice Shelf · Bolts ·
"Makers" · "points" · "Marketplace" as the name of the board (it is Classifieds) ·
"On Air" member-facing (internal codename only) · "Mission" as a feature name.

---

## 2. Audience and voice

### The two readers

**The Seeker (primary), the high-functioning lonely.** Late 20s to 50s, capable,
employed, looks fine on paper. Often relocated or drifted out of friendships the
way adults do. Digitally saturated and tired of it. Wellness-adjacent but allergic
to anything culty, salesy, preachy, or precious. Does not identify as "spiritual"
at the front door. Their words, used verbatim in copy: *"I have a hundred contacts
and no real friends" · "I moved here and don't know anyone" · "I doomscroll and I
hate it" · "I'm fine but I'm not okay."*

**The Latent Leader (secondary), and the whole growth model runs on them.** Feels
the pull to gather people and has no container or permission. Wants rails, not a
blank page. The framing: *"You don't have to build a community. Host one Circle.
We'll hand you the format."*

Both have been marketed at their whole lives. The only register they have not been
sold in is plain. **Write plain.**

### The voice

**A camp counselor you actually respect.** Takes the person seriously, takes the
activity lightly. Calm's warmth plus Duolingo's play, minus Duolingo's guilt, plus
dirt under the fingernails: rain, folding chairs, someone bringing oranges, the
awkward first five minutes. Spirit line: **"Get people together. Do things on
purpose."**

**The two cardinal rules**

1. **Proper nouns carry the magic. Sentences stay plain.** "You earned 40 Zaps
   this week," never "feel the current of your Circle's energy."
2. **Never narrate the reader's feelings.** "Day 3. You showed up again. That's
   the whole thing," never "feel the stillness wash over you."

**The four qualities:** plain (a 12-year-old understands it) · warm (on the
reader's side, zero shame mechanics) · playful (deadpan beats whimsy) · real
(numbers over adjectives).

**The skeptic test, which is the law.** Read it aloud to someone who would say
"that's not really my thing." If it does not still sound like it could be for
them, rewrite it.

**Mechanics:** sentence case for headlines and buttons · **no em dashes** ·
contractions always · emoji rare and single, game UI and social only, never on a
practice page · at most one exclamation point per screen, usually zero.

**Banned vibe-verbs:** tap into · drop into · hold space · lean into · feel the
current · activate your · awaken your. ("Tune in" is allowed only as the Channels
verb.)
**Banned surface jargon:** somatic · vibrational · energetic · embodied · sacred ·
chakra · "nervous system regulation." The surface says "calm down fast."
**Banned hype:** unlock · elevate · transform your life · level up your life ·
hack · optimize · limited time · tribe · revolution.

**Notifications** never guilt, shame, or fake urgency. Every one carries a fact or
a five-minute invitation. "Your Circle meets tonight at 7. Bring nothing."

**Money is dark.** No marketing or product flow ends on a $ / paid / sale moment.
Business stories land on **Captured, Booked, Return**. "Secure checkout" as a
capability may be shown; a live transaction may not.

**Proof over claims.** "212 Circles met last week" beats "a thriving global
community." Honest counts only, real first names, real photography. Lead with
return, never signups.

**Positioning lines that already exist** (reuse them, do not invent a tagline):
"The feed ate everyone's attention. We're building the thing that takes it back."
· "We don't measure screen time. We measure whether you showed up Thursday." ·
"You're not a user here, you're a founder." · "Here while it's still wet paint." ·
"Yes, it's meditation. We just made it a game so you'd actually do it."

**The three-pillar register:** **The Lab** writes into the body (heat then cold,
steam, cedar, low amber light, the exhale) · **The Community** writes belonging
(faces that light up, known by name, missed when you are gone) · **The Quest**
writes meaning and momentum (becoming someone your people count on).

---

## 3. The direction

**Warm editorial community.** Calm, magazine-like layouts on a warm cream canvas
where type and space carry the personality and content sits openly rather than
inside a grid of identical bordered boxes.

It answers a specific diagnosis. Three habits, not the palette or the font, made
the app read as a SaaS template: everything in an identical bordered card; type
too small and unexpressive (11px labels, tiny gray uppercase micro-headers); and
flat hard elevation instead of gentle warm depth.

**The physical reference is literal:** Frequency's real venues. Black wood-slat
walls, warm amber LED strips, teal water, lush greenery, campfire warmth. That is
where `.bg-slat`, `.light-strip`, and `.amber-glow` come from, and why dark mode is
warmed toward timber rather than neutral charcoal.

### In-app principles
1. **Type is the hero.** Larger base, expressive headings, generous line-height.
2. **Group, don't box.** A card means "this is a distinct object" (a Circle, an
   event). Lists and rail sections group with a title and spacing, at most a
   hairline divider.
3. **Warm, soft depth.** Diffused warm-tinted shadows over hard borders.
4. **Editorial hierarchy.** A few large anchor areas, quieter supporting detail.
5. **Human touches.** Real photography of gatherings, so it reads as made.
6. **Design for the body, not the dashboard.** Lens words: missed, exhale, home.
7. **The gamified-stat law.** Primary member pages show only the four game counts
   (Zaps, Gems, Streak, season rank). Non-game surfaces show zero stats. Analytics
   deltas and KPI walls belong to the operator register.
8. **No dead ends.** Every entity cross-links to its neighbors.

### Marketing principles
1. **Editorial, not "SaaS landing page."** Heavy Anton headlines, generous
   whitespace, photography carrying the emotion. No gradient-blob filler.
2. **One warm world, lit from within.** Amber is the single hero accent, teal is a
   rare secondary, green never appears in marketing chrome.
3. **Light and dark are a rhythm, not a theme toggle.** The ink band is a
   deliberate beat, at most two per page, always seamed with a light-strip.
4. **A predictable cadence.** Shared vertical rhythm and container widths.
   Adjacent sections never repeat a tone.
5. **The kit is the source of truth.** If a pattern appears twice, it is a
   component.
6. **Honest, grounded confidence.** Restraint is the brand.

**One site, three rooms:** Marketing (the editorial pitch) · Member app (the warm
home) · Admin (the workshop, data-led). Same tokens, type, and tiles. Only the
register and the content change. Members never see operator KPIs.

### The composition system
**One shell, five templates:** Stream (a flow) · Index (a collection) · Detail
(one entity: context band plus underline tabs) · Dashboard (operator, metric-led)
· Focus (centered, rail-less). Building a page is two decisions: pick the template
by what the content is, then register its chrome.

**The kit, composed and never re-declared:** PageHeading · EntityCard · PersonCard
· RowCard · StatCard · SectionHeader · UnderlineTabs (the one tab vocabulary, so
pill tabs do not exist) · EmptyState · form primitives.

**The marketing page spine:** PhotoHero → Lead → alternating beats → proof → ink
statement band → BetaCTA. When a page feels thin, add a beat, do not pad the copy.

---

## 4. Visual foundations

### Color
Raw hex lives **only** in `tokens/colors.css` (plus `tokens/skins.css`, which
overrides a subset for Midnight). Everything else uses semantic tokens.

- **Surfaces:** `canvas` #FBF8F1 cream (in-app) · `marketing-canvas` #F2EAD9
  warmer sand (public) · `surface` white · `surface-elevated` #FAF6EC ·
  `surface-post` #F7F5EF (feed post cards sit a step warmer than the composer).
- **Text:** `text` #3D352A, a soft warm charcoal at about 10:1 on canvas. Ink that
  reads printed, not harsh. `text-muted` #6B6253, `text-subtle` #8F8675.
- **Ink:** #141210, the cinematic dark band from the wood-slat interiors. Warm but
  near-neutral, not brown. `on-ink` #F3EEE3 and its muted/subtle steps.
- **Primary, amber-gold** #E2912F. The single chrome accent: every CTA, glow,
  light-strip, active state.
- **Signal, emerald-teal** #0F8E78. The rare secondary. "Pool water in shade."
- **Broadcast, robin's-egg** #1EB6C5. Comms, Dispatches and onboarding only.
  Never general chrome.
- **Move, cerulean** #1C7FB5. The Get Moving door in Mindless. Deliberately bluer
  than the green-leaning teals so it never reads as "done."
- **Semantic states:** success is a **teal** #11827A, not a green, so progress
  reads cohesive with Signal. Warning #B07515, danger #BA3B30, info #2F6FB0.
- **Rank spectrum:** ten earthy primitives (stone → rose), each with core / deep /
  bright. The four season ranks draw from the first four; the rest serve Pillars,
  Amplitude tiers, and Space accents.
- **Dark mode** mirrors the system on warm espresso, a golden-brown undertone so
  surfaces read as timber. Ink runs deeper than the dark canvas so the marketing
  bands still read as deliberate black.
- **`.theme-light-lock`** pins the light palette for a subtree. The cinematic beta
  induction uses it, because a dark induction reads as broken.

**The Midnight skin** is the one alternate look: cool slate and indigo surfaces,
the warm amber kept, radii sharpened. A skin is a token override on
`data-skin="midnight"`, orthogonal to light/dark, so there are four render states.
Anything Midnight does not override (Signal, Broadcast, Move, semantic states,
ranks, the brand mark) inherits DAWN.

### Type
- **Nunito** is the body face **and** the in-app heading face, weights 400 to 900,
  body line-height 1.65, headings 800 at 1.2 with -0.01em tracking. A warm serif
  was trialed for in-app headings and reverted: it read as a different product.
- **Anton** (`.font-display`) is the marketing display face only, weight 400,
  +0.012em tracking, line-height 1.0, always paired with uppercase. Never in-app.
- **Geist Mono** for tokens, tabular numerals, code.
- Three accent faces, marketing only and sparingly: **Playfair Display**
  (editorial accents), **Caveat** (handwritten), **Space Grotesk**.
- **Scale is roles, not pixels.** Display hero/h1/h2/h3, page title, lead, card
  title, body, body-sm, meta (the content floor). `text-2xs` (11px) and `text-3xs`
  (10px) exist for chrome only, which retires the ad-hoc `text-[10px]`. Eyebrow
  tracking is locked at 0.25em, uppercase, bold.
- **Density root:** `html { font-size: 106.25% }`, about 17px. Every rem derives
  from `--density-root`.

### Feel: radius, motion, density
- **Radius by role** is the contract a skin retunes: `--radius-control` 0.5rem
  (buttons, inputs), `--radius-card` 1rem, `--radius-pill`. The step scale stays
  for shapes that are not role-bound (a date square, a marketing media frame).
- **Motion:** `--motion-fast` 130ms (micro-interactions), `--motion-base` 260ms
  (the cue-pop beat, anything that arrives), `--motion-slow` 700ms (washes,
  reveals). Nothing exceeds 700ms. `prefers-reduced-motion` collapses all of it
  and halts every loop.
- **Elevation is soft warm depth.** Diffused near-espresso shadows over hard
  borders. In-app: `shadow-sm` resting, `shadow-md` hover. Marketing: `shadow-pop`
  and `shadow-pop-lg`. `shadow-menu` is downward-only, so a mega-menu reads as
  sliding out from under the bar above it.
- `.press` is the one allowed hover/press transform. Ad-hoc lifts are banned.
- `.dimmed` recedes seeded beta content so a newcomer never mistakes it for real
  members.

### Backgrounds, imagery, motion signatures
`bg-slat` (the wood-slat ink texture with a warm sheen where the LED grazes it) ·
`light-strip` (the glowing amber LED hairline at every dark-to-light seam) ·
`amber-glow` (the radial warm light behind hero CTAs and inside dark bands) · the
engraved `brandmark` (the logo as an alpha mask, filled warm sandy-brown with a
two-tone emboss, a slow shine sweep and a subtle wiggle on a 6s cadence).

Real photography only: golden-hour gatherings and amber-lit wood-slat interiors.
Warm throughout, never cool, never stock-y. Framed media at `radius-2xl` with a
hairline border.

Full motion inventory: cue-pop (the base beat) · reveal · cue-bounce · marquee ·
brand-shine and brand-wiggle · freq-glow (the Signature bloom at the Mindless
breath cadence) · wiggle (the beta badge) · warmup-flash (the count-in wash) ·
slideUp (achievement toast).

### Interaction states
Hover warms text and adds a faint `surface-elevated` wash; cards lift to
`shadow-md`. Focus is split: a 3px amber ring on actionable chrome, a calmer
neutral ring on text fields so typing never glows orange. Three surfaces opt out
by owner directive (the Composer textarea, the header wordmark, the admin
command-bar field). Active nav is `primary-bg` plus `primary-strong` and a bolder
weight.

---

## 5. Iconography and illustration

- **Lucide** is the icon set (Phosphor or Tabler only to fill a gap). Referenced
  by meaning, sized off the type scale, colored via currentColor from DAWN text
  tokens. Decorative by default. A standalone game icon sits in the amber chip:
  `primary-bg` background, `primary-strong` glyph, `rounded-xl`, about 22px.
- **The canonical Quest icon set** maps one Lucide glyph per concept (Zap, Gem,
  Vault, Compass for the Quest, Route for a Journey, Sparkles for a Practice,
  Flame for a streak, and so on). See the Quest icons card.
- **The brand mark is not an icon.** It is the engraved wordmark.
- **The Loom illustration language** for drawn graphics: flat, warm, **filled**
  shapes in the DAWN palette, amber-led with a teal accent, big rounded corners,
  one focal point. Frame a product moment as a screen or card with faint inner
  cards. Never thin line-art, gradients, 3D, photorealism, faces, fingers, or
  realistic anatomy; figures are recognizable by pose.
- **Game and reward art:** the rank insignia and reward medals use
  **game-icons.net** emblems under **CC BY 3.0**, recolored to the rank spectrum
  (`assets/badges/`). Filled silhouettes, gamification only. Credit line:
  "Some game icons by Lorc and Delapouite, game-icons.net (CC BY 3.0)." Full
  notice in `assets/badges/ATTRIBUTION.txt`.

---

## 6. The do and don't list

**Never**
- Hardcode hex outside the token files.
- Use 10 or 11px type for content, or all-caps micro-label section headers.
- Box a list that is not an object, or stack identical bordered cards.
- Put green or success color in marketing chrome.
- More than two ink bands per page, or an ink band without its light-strip seam.
- Adjacent same-tone sections, ad-hoc hover transforms, or a bespoke one-off hero,
  button, or FAQ block.
- Em dashes in brand copy.
- Non-game stats on a primary member page, or analytics deltas in the member
  register.
- A blank empty pane. An empty state teaches the next step with one CTA.
- End any flow on a price, a sale, or a payment.

**Always**
- **The presentation test:** if this were screenshotted into a deck or forwarded
  to a customer right now, would it look intentional? New UI should look like it
  always belonged.

---

## 7. Index / manifest

**Root**
- `styles.css` — the single global-CSS entry point. Imports only.
- `readme.md` — this spec. `SKILL.md` — the Agent-Skills wrapper.
- `assets/` — `frequency-logo.png`, `icon.svg` / `icon-512.png`, `images/`
  (hero, Lab interiors, gatherings), `badges/` (rank and reward emblems).

**Tokens** (`tokens/`, all imported from `styles.css`)
- `fonts.css` — the six faces plus `.font-display` and the accent-face helpers.
- `colors.css` — raw hex and semantic aliases, `:root` + `.dark` +
  `.theme-light-lock`. **The primary hex file.**
- `skins.css` — the Midnight skin, light and dark.
- `typography.css` — scale roles, base elements, links, `.eyebrow`, `.kicker`,
  `text-2xs` / `text-3xs`, the density root.
- `spacing.css` — spacing ramp, section rhythm, container widths, radius by role,
  motion tokens, shadows, text-shadow presets.
- `effects.css` — `.bg-slat`, `.light-strip`, `.amber-glow`, `.brandmark`,
  `.rank-badge`, split focus rings, `.press`, `.dimmed`, the motion inventory.
- `utilities.css` — a small token-bound helper layer.

**Components** (`components/`, each `Name.jsx` + `Name.d.ts` + `Name.prompt.md`,
one `@dsCard` per group)
- `core/` — Button · IconButton · Badge · RankBadge · Avatar · Card · Stat ·
  BrandMark · **Glyph**

**Icons are `Glyph`, never `<i data-lucide>`.** `lucide.createIcons()` replaces the
`<i>` node it finds, so when React created that node the next render tries to remove
something that is gone and the tree unmounts. `Glyph` reads Lucide's icon *data* and
renders an SVG React owns end to end. Six components (Counter, StreakMeter,
GateNotice, EntityCard, StatCard, RowCard) drew raw `<i>` nodes and so rendered
invisible icons on every screen once the `createIcons()` calls were removed; they all
use `Glyph` now. Pages get it from the bundle like any other component.
- `forms/` — Input · Textarea · Select · Checkbox · Switch
- `navigation/` — Tabs
- `marketing/` — SectionHeading
- `feedback/` — EmptyState · Toast
- `kit/` — the composition kit every in-app page is built from: PageHeading ·
  UnderlineTabs · SectionHeader · EntityCard · RowCard · PersonCard · StatCard ·
  ProgressTrack · Counter · CounterRow · StreakMeter · Meter · GateNotice

**Rails are permanent furniture.** Both rails are primarily open and neither ever
disappears: the menu folds to an icon strip that keeps its group dividers, and the
right rail folds to a strip carrying glyph hints and a reopen button. Folding gives
the space to the canvas, which is why the editors arrive folded. Under 1000px the
menu is always the strip and opens as an overlay drawer over the content, so the
canvas is never squeezed. Every screen mock carries a Tweaks panel (skin, mode,
menu, rail, canvas width) collapsed to a button.

**Dormant is a state, not a bug.** Much of the product is built and switched off:
billing until graduation, AI until the master flag, SMS until registration,
white-label sites on hold. `GateNotice` is how a surface tells that truth in four
kinds (`preview` · `gated` · `dormant` · `hold`): name the state, say what happens
when it turns on, and leave the surface browsable underneath. Never a lock, never
a blank pane, never "coming soon" with no reason. `Meter` carries the other half:
the paywall is caps and take-rate, so a Space shows the room it has left (teal,
amber at 80%, danger only at the cap) instead of a locked feature.

**Counters and streaks.** Every number a member sees goes through `Counter`
(mono, tabular, small: xs and sm for chrome, md for a card, lg only for a season
recap) or `StreakMeter`. Tone follows the kind: Zaps and streaks amber, Gems and
trophies teal, Airtime and movement the Move blue. A zero is muted, never red. A
missed day is a hollow dot, never an alarm. Anything carrying a delta, a trend or
a sparkline is `StatCard`, and that is operator-only.

**UI kits** (`ui_kits/`)
- `marketing/` — the public splash: header, PhotoHero, pillars, story beats, the
  ink statement, proof, FAQ, the beta close, footer, plus the Oath induction.
- `app/` — the member shell: global top bar, left area rail, the stream (beta
  banner, greeting, streak, composer, posts, quiet activity lines), status rail.
- `screens/` — eighteen page mocks on the shared frame, each readable in all four
  render states and with **either rail collapsible by user control**.
  Member surfaces: Circle · Journey · Journey lesson · Practice · Message board ·
  Event (tiers, QR check-in, wall) · Resonance matching · Settings. Operator and platform: Journey editor (rails folded) · Space console
  (29 modules, 12 boxes, meters) · Resonance CRM · Vera Action Queue · Admin rail
  editor · Admin dashboard.

**Cards** — the Design System tab, grouped in reading order:
| Group | What is in it |
|---|---|
| Foundations · Color | Primary, Signal and Broadcast, Move, neutrals, ink, semantic states, the rank spectrum, the Midnight skin |
| Foundations · Type | The scale, display, body, eyebrow, mono |
| Foundations · Space & feel | The spacing scale, radius by role, elevation, the feel tokens, the motion inventory |
| Brand & voice | The wordmark, imagery, the ink beat, group-don't-box, the page spine, the five templates, Loom, the voice law, the icon set |
| Components | Core, forms, navigation, feedback, marketing, the kit, counters and streaks |
| Patterns · The Quest | Season ranks, reward badges, the Quest icon set |
| Screens · Member | Feed, Around You, Circle, Journey, Journey lesson, Practice, Message board, Event, Market listing, Housing listing, Resonance, Settings |
| Screens · Operator | Journey editor, Space console, Resonance CRM, Vera Action Queue, admin rail editor, admin dashboard |
| Screens · Marketing | The splash, The Lab, The Quest, Pricing |
| Teasers | The eight teaser infographics, dark and light |

**Handoff** (`handoff/`) — the sync bridge to `frequency-web`: `README.md` (the
mapping table), `SYNC.md`, and a per-round `CHANGES.md`. DAWN edits land in the
repo as a branch and PR that Daniel reviews and merges. Nothing auto-deploys.

---

### A note on fonts
All six faces are real Google Fonts, delivered here from the CDN with no
substitution. Production self-hosts them via `next/font`. Swap to self-hosted
woff2 in `tokens/fonts.css` for fully offline use.

## Teaser card geometry

`guidelines/infographics.css` and `-light.css`: a teaser card is a three-row grid — head / flow / foot — with one `row-gap` per format and `1fr` on the middle row. Nothing inside carries a hand-tuned margin, so slack lands evenly in the flow instead of pooling above the foot, and both the feed and story cuts fill their frame exactly.

## Marketing vertical rhythm

Uniform padding on every section is the failure mode: the page reads flat, and two same-tone sections stacked make one dead 170px hole. So a section takes one ROLE class from `tokens/utilities.css` and never an inline padding string — `.mk-band` (a tone change: the ink beat, a photo beat, the close — loose), `.mk-beat` (the workhorse), `.mk-cont` (continues the section above at the same tone: no top padding), `.mk-tight` (a statement or banner). `.mk-arc` adds the 1.5rem the arc shoulder eats; `.mk-dock-clear` clears a hero fact dock's 2rem overhang.

Tone is tagged too — `.mk-cream` / `.mk-ink` — and two sections of the SAME tone in a row automatically halve the gap between them, while a tone CHANGE keeps the full beat. That is what makes a tone change read as a change.

## Marketing pages

`ui_kits/marketing/` — `index.html` (splash) · `operators.html` (For hosts) · `circles.html` · `about.html` (Why we exist) · `quest.html` · `lab.html` · `pricing.html` · `stories.html` (the six teasers in place). All share `header.jsx`, `footer.jsx`, `sections.jsx`, `hero.jsx`, `beta.jsx`, `icon.jsx` (`MkIco` — React-owned lucide, never `createIcons()` on React nodes) and `reveal.js`.

Pricing follows the CURRENT canon in `docs/PRICING.md` (and the same ladder is summarised in BRIEF-03 §1). Read the file's top banners, newest first:

- **ADR-914 (2026-07-30), overrides every earlier rate and seller rule.** A free Member CAN sell — tickets, donations, payouts, day one. *Never gate the transaction; gate the repeat.* The rate is the ladder, on **network-sourced sales only**: Member 10% · free Space 10% · Crew 8% · Business 5% · Collective 3% · Non Profit 0%. **0% on your own audience on every tier, forever** (a follow, an active membership, a CRM contact, a personal contact, or a prior settled purchase each prove it). **Tips carry no fee, ever.** The three walls are selling memberships (Business), campaigns and funnels (Business), and revenue splits (Collective); everything else is a meter with a real free allowance.
- **ADR-908 (2026-07-29), renamed by ADR-1084 (2026-08-19).** Crew is **contribute what you want** (never "pay what you want" in member-facing copy): floor $4.99/mo, $24.99 suggested and pre-selected, annual = 10× the chosen monthly. Every amount buys identical access; at or above the suggested amount earns the Supporter mark, never capability. Member/Crew split is *first one free* — 1 Circle, 1 Journey, 3 Practices, 2 events.
- **ADR-1060/1067 (2026-08-17), the ladder as charged today.** Member $0 · Crew contribute what you want · Free Space $0 · Business **$29/mo, $290/yr** · Collective **$79/mo, $790/yr** · Non Profit **$39/mo flat, $390/yr** · Independent **$249/mo, $2,490/yr** · Vera AI add-on **+$20/mo, $200/yr**. A year is always 10× the monthly rate (two months free), and that is the only discount.
- 🔴 **No beta pricing renders anywhere.** The Opening Beta window is CLOSED. Every tier shows ONE price: no struck-through anchor, no "Beta rate" or "Opening Beta" or "founding rate" caption, no countdown to a price rise. A crossed-out $29 beside a charged $29 would be a false claim, and `pricing-grid.test.ts` sweeps every offering for one. Supporter is a mark, not a tier. Retired plan names that must never appear as sellable: Supporter, Practitioner, Organization, White-label, Pro. The add-on is **Vera AI** (ADR-590), never "AI Engine" or "Resonance Engine" (that name still describes the matching SYSTEM under the hood, never the product a member buys).
- **Billing went live 2026-07-25.** CTAs are real. **September 1 2026** is when the free allowances start counting (`beta_grace` ends) — not when prices change.

Money is still dark in voice: no page closes on a dollar, and business stories land on Captured, Booked, Return.

## Guideline card shell

Every guideline card loads `guidelines/card.css` after `styles.css` and uses one shape: a `.card-head` (eyebrow, Anton title, one-paragraph law, `.rule-amber`), `h2` section labels, the `.g/.g2–.g6` grids, `.sw` swatches, `.panel` specimens, `.spec` token rows, `.dd` do/prefer pairs, and a closing `.laws` block. Cards declare a 1180-wide viewport so the tab reads as one document instead of forty differently-built pages. New cards start from an existing one — never hand-roll card chrome.

## Creation wizard

`ui_kits/screens/creation-wizard.html` — one flow, two mounts. `CreationFlow` owns the steps, state and footer; `CreationWizardModal` puts it over any page (scrim, one `.lift-3` sheet, Esc to leave) and `CreationWizardPage` gives it a full page. A host who starts from the console and one who arrives by link must never learn two flows, so only the shell differs.

Steps: **About** (a fork — *describe it* or *upload an outline* — into the shared directions box, then basic settings: kind, working title, visibility, draft and logging switches) → **Material** (what we read out of the upload or drafted from the directions, reorderable) → **Shape** (length, cadence, entry, and what a step can hold) → **Schedule** (start, meeting day, time, place, reminders) → **Review** (a plain summary, then publish). The only hard requirement is a line of directions; everything else has a sane default, because a wizard that blocks on page one is a form with extra steps.

## Rail controls sit at the foot

Every open/close control in the app is the same quiet thing: a 26px borderless glyph at the **bottom** of the rail it belongs to, at `--color-text-subtle`, warming to `--color-text-muted` on hover. Never a bordered button, never at the top — at the head of a rail it competed with the first real row for attention, and folding a rail is something a member does rarely. The one exception is the overlay menu on small screens, which keeps its close at the top: an overlay's dismiss must be reachable without reading the whole panel first. `RailToggle` in `ui_kits/screens/frame.jsx` is the reference; `nav-rail.jsx`, `right-rail.jsx` and the feed's folded strip mirror it.

## The three docks

One law of place, so no control is ever offered twice:

| Dock | Owns | Contents |
| --- | --- | --- |
| Top right | The system | Region, account and security, plan and billing, appearance, language, data export, help, sign out |
| Bottom left (rail foot) | You, and what you run | Profile, standing, journal, saved, notification prefs — then My Circles, events, listings, Spaces, QR studio, payouts, orders |
| Bottom right | The Vault (member) or this page (operator) | Sparks, the stash action, streak and freezes, season counts, ledger — or four page stats plus that page's switches |

All three share one popover shell: `.glass` + `.lift-3`, cue-pop in, Esc or an outside click out, opening toward the interior. Source: `ui_kits/app/docks.jsx` (`AccountDock`, `SystemMenu`, `VaultDock`, `PageDock`). Guideline card: **Patterns · Chrome → The three docks**.

## Rails

Both rails are tracks of one grid, attached to the inner column, and their widths are CSS variables — so folding a rail moves only its own edge and gives the space to the canvas. A folded rail is a **visible strip**, never a missing track. Each side runs a three-position ladder: **Auto** follows the room, **Open** and **Strip** are standing instructions honoured until the window is too narrow. Under 1000px the menu leaves the layout and arrives over the content.

## Texture, light & lift

The settled effects system in `tokens/effects.css`: `.lift-1/2/3` for elevation, `.sheen · .halo · .spot · .edge-light` for light, `.grain · .scanlines · .dot-grid · .vignette` for texture, `.arc-top · .rule-amber · .light-strip · .glass` for shape and seam, and `.reveal` + `.stagger` for scroll entrance (marketing pages load `ui_kits/marketing/reveal.js`). Laws: two shadows per elevation, one texture per band, one `.lift-3` per page, glass only over movement. Guideline card: **Foundations · Space & feel → Texture, light & lift**.
