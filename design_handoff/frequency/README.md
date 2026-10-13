# Frequency™ Design System · v4
### Community Collective

Frequency is a network of communities and the people looking to fill them: Members, Spaces, Circles and Events, with Journeys, the Quest and Mindless as programs inside it. The north star is weekly active members who showed up, never screen time.

Browse the product pages from the three area pages: `Frequency Front End.html`, `Frequency Member Site.html` and `Frequency Member Admin.html`. The build handoff is **`HANDOFF.md`**.

## Messaging (canon: `guidelines/messaging.md`)
- Platform line: **Gather like it matters.**
- Core belief: **We build circles, not walls.** Tagline: **Build circles, not walls.**
- Attitude: **Sacred, not serious.**
- Two markets, never mixed:
  - **Browse Community** (people). Hero: "Find local groups and events *near you.*"
  - **Host Community** (Spaces). Hero: "Host local events and groups people *come back to.*"
- The calendar is **What's happening**, never "What's on".
- **Voice:**
  - Sentence case, no em dashes, numbers over adjectives, and a short reason on every pick.
  - Never use these words on the surface: yoga, rave, temple, energy, tribe, journey, transform.

## Themes (`guidelines/site-themes.md`)
- **Stage** (`data-theme="stage"`, always dark), for marketing:
  - Background: void `#0A0612`.
  - Iridescent is the signature.
  - Neon crossover hues, with orbs, grain and bloom.
- **Commons** (`data-theme="commons"`, light, the default), for the member site and admin:
  - Background: white and sand.
  - Ink: `#34312E`, `#4D4945`, `#7C766F` and `#A59F98`.
  - The pastel accent **`--pa`** is for actions, progress and live dots only.
  - Glass panels and a background wash.
  - Dims to the Thermal night room (`data-time="night"`).
- **Crossover hues:** violet = act, magenta = live, aqua = presence, sun = reward. Neon on Stage, deep on Commons.
- **Energy:** `data-energy="still|flow|charge"` sets pulse speed (8s, 5s or 0.5s), orb drift and signal-line amplitude.

## Core (locked; products import, never override)
- `styles.css`: the entry point. It only imports the token files below.
- `tokens/colors.css`: palettes, iridescent, semantic aliases and energy states.
- `tokens/themes.css`: Stage, Commons, Commons night, the crossover hues, and the member layer (`--pa`, `--pa-soft`, `--pa-orb`, `--pa-glow`, `--glass-panel`, `--wash`, `--tip-bg`, `--track`).
- `tokens/typography.css`: three fonts.
  - Unbounded for display, numbers and labels.
  - Hanken Grotesk for UI and body.
  - Instrument Serif italic for one soft phrase.
- `tokens/space-motion.css`:
  - Spacing: 2 to 120px.
  - Radius: 10, 16, 24, 36, plus orb (999px).
  - Shadows and easing curves.
  - Durations: 160, 260 and 480ms.
- `tokens/base.css`: element defaults plus effect classes.
  - Effects: `.fq-aura`, `.fq-breathe`, `.fq-grain`, `.fq-glass`, `.fq-panel`, `.fq-wash`.
  - Iridescent: `.fq-iri-text`, `.fq-iri-btn`, `.fq-iri-rim`, `.fq-iri-sheen`.
  - Logo: `.fq-logo`, `.fq-logo-icon`, `.fq-logo-flow`.
  - Pop-ups: `.fq-tip`, `.fq-toast`.
- `assets/icons/frequency-icons.svg`: 76 icons on a 24px grid with a 1.75 stroke.
  - 64 by intent: Navigate, Find, Show up, Come back, Pass it on, Spaces, Economy.
  - `house-01` to `house-12`: the astrological houses, each drawn as its natural sign.
  - Use `<svg class="fq-icon"><use href="#id"></use></svg>` and load `icons.js` (or `inline.js` in Design Components).
- `assets/logo`: wordmark and round icon. Use them as masks; never recolor the PNG.
- `assets/photos`, `assets/broll`, `assets/facilities`: real gatherings only. Facility renders appear only on Vision.

## Infographics and feature blocks
- `tokens/infographics.css` (imported by `styles.css`): infographic building blocks drawn in brand shapes (orbs, breath rings, signal line), plus the 10 infographic kinds and the smart elements: streak arc and thread, layered bars (D/W/M/Y), podium, orbit and weave.
  - Renderers: `assets/infographics/ig.js` and `assets/infographics/ig-kinds.js`.
  - Theme manifest: `assets/infographics/theme-pack.json`.
  - Reference page: `guidelines/cards/infographics.html`.
  - Editor integration: `guidelines/element-library.md`.
- `tokens/features.css`: feature blocks for offerings (event, circle, space, journey, membership, host, story, listing) in four presentations: card, row, spotlight and poster. Reference pages: `guidelines/cards/feature-*.html`.

## Products
| Area | Folder | Kit | Pages |
|---|---|---|---|
| Frequency Front End | `templates/website/` | `web/site.css`, `side.css/js`, `megamenu.js`, `eventmap.js`, `fx.css/js` | 9 |
| Frequency Member Site | `templates/members/` | `app/app.css`, `app/shell.js` | 15 (Feed is `Members.dc.html`) |
| Frequency Member Admin | `templates/admin/` | `admin.css`, `shell.js`, `editor/` (page editor), plus the member kit | 7 |

`templates/preview.js` adds a "← back to area" button to every page while previewing. Drop it in production.

## Guidelines
`guidelines/brand-book.html` (the visual book), plus:
- `economy.md`: the real Zap and Gem values for every action, from the repo. **To tune the values, edit `assets/economy/economy.json`.** Pages show them through `assets/economy/economy.js` with `data-zap`, `data-gem`, `data-zap-x`, `data-convert` and `data-econ-list`.
- `messaging.md`
- `brand-strategy.md`
- `design-principles.md`
- `community-model.md`
- `site-themes.md`
- `website-strategy.md`

Each design element has a card in `guidelines/cards/`, and every card shares `card.css`. `ui_kits/website/` holds the early sitemap and wireframes.
