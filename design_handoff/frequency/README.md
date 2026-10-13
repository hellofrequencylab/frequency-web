# Handoff: Frequency marketing website + core design system

## Overview
Frequency is a local community network with two sides:
- **People** (shown in the toggle as *Browse Community*) find local Circles, events and programs near them.
- **Spaces** (shown in the toggle as *Host Community*) are venues and hosts that run Experiences and want people to come back.

This bundle contains the full marketing site (9 pages) plus the locked core design system it is built on: tokens, base styles, icons, logo and photos.

## About the design files
The HTML files here are **design references**. They are prototypes that show the intended look, copy and behavior. They are not production code to ship as-is. Your job is to **recreate them in the target codebase** (for example Next.js/React with CSS modules or Tailwind, or Astro) using that codebase's own patterns. If there is no codebase yet, Next.js (App Router) with plain CSS custom properties is recommended, because the token layer is already written as CSS variables.

Open any page in a browser straight from `templates/website/`. Paths are relative (`../../styles.css`, `../../assets/…`), so keep the folder structure as it is.

## Fidelity
**High fidelity.** Colors, type, spacing, copy, motion and responsive breakpoints are final. Rebuild the pages pixel-accurately. Copy is final too: treat `guidelines/messaging.md` as the source of truth and do not rewrite headlines.

## Architecture
- **Core (locked):** `styles.css` imports `tokens/colors.css`, `typography.css`, `space-motion.css`, `themes.css` and `base.css`. Port these as global CSS variables, and never override them per page. Products (Website, Members app, Admin) all import the core.
- **Website kit:** files in `templates/website/web/`:
  - `site.css`: layout, header, mega menu, footer, cards, "Keep going" panels, breakpoints at 1100, 960, 760 and 560px
  - `side.css` / `side.js`: People ⇄ Spaces side state (`body[data-side]`, `--side` color, `.p-only` / `.e-only` content swaps). Only Home has the toggle. Every other page is fixed to one side.
  - `megamenu.js`: header mega menu and the asset base path
  - `eventmap.js`: live event maps (OpenStreetMap tiles, location pills, live check-in counters). The San Diego data is placeholder.
  - `texture.css` / `texture.js`: canvas film grain, iridescent hover sheen, live signal-line waveforms, breathing live dots, pointer-follow card light, frosted captions, iridescent FR roundel in the footer
  - `mood.css` / `mood.js`: per-page mood (energy level plus a three-hue palette), hero sphere, section halos, jewel orbs, gradient seams

Load order on every page:
1. Stylesheets: `styles.css` → `site.css` → `side.css` → `texture.css` → `mood.css`
2. Scripts: `side.js` → `megamenu.js` → `mood.js` → `texture.js` (plus `eventmap.js` where maps appear)

## Screens
All pages use the **Stage** theme (`data-theme="stage"`, always dark). Each page has the same header (wordmark, mega menu, Get started CTA) and the same footer. Content is held in a 1200px container with 40px gutters on desktop and 18px on mobile.

| Page | Side | Mood (energy · hues) | Purpose |
|---|---|---|---|
| Home.html | toggle | charge · magenta / aqua / sun | Choose-your-own-adventure: hero, parallax vision section, two pop-in path doors, four story chapters that swap by side |
| People.html | People | flow · aqua / violet / cyan | Find Circles and events near you; event map |
| Spaces.html | Spaces | flow · sun / magenta / violet | Host Experiences people come back to; event map |
| Features.html | both | flow · violet / aqua / sun | One features page, grouped by user intent. People: Find · Show up · Come back · Pass it on. Spaces: Be found · Open the door · Bring them back · Get paid. Searchable. |
| Pricing.html | Spaces | still (quiet) · sun / violet / aqua | Plans |
| Stories.html | both | flow · magenta / sun / violet | Member and host stories |
| Vision.html | both | still · violet / cyan / lime | Labs vision |
| Join.html | side color | flow · side / magenta / violet | Get started; resolves every CTA |
| Help.html | neutral | still (quiet 2) · violet / aqua / violet | Help center; orbs stay in the hero only |

Read each page's HTML for exact structure. Class names are semantic, and the CSS for every component lives in `web/site.css`.

## Interactions and behavior
- **Side toggle (Home only):** the labels are "Browse Community" and "Host Community". Switching sets `body[data-side]`, which recolors `--side` and swaps `.p-only` / `.e-only` content. Persist the choice, and pass it to Join.html.
- **Mega menu:** hover or focus opens it on desktop. On mobile it becomes a drawer. The town calendar link is always called **"What's happening"**.
- **Reveals and parallax:** sections fade and rise as they enter the viewport (use `--ease-out`, `--dur-slow`). The Home vision section uses parallax layers. On Home, the hero sphere drifts toward the bottom of the hero as you scroll.
- **Event maps:**
  - Location pills filter the map.
  - Live counters tick up.
  - `.lv-live` / `.locpill` elements show signal waveforms whose amplitude comes from `data-energy` (still, flow or charge).
- **Card light:** `.tx-lit` cards follow the pointer with a soft radial light.
- **Grain:** draw it on a canvas tile over `.photo`, `.pd` and `.mm-card`. Never use `mix-blend-mode` on fixed full-page SVG noise, because it hurts performance.
- **Reduced motion:** with `prefers-reduced-motion`, all durations go to 0, and the aura, orbs and waveforms stop.
- **Iridescent italic phrases** (Instrument Serif italic with a gradient fill) need horizontal padding so the italic overhang isn't clipped.

## State
- `side`: `people` or `spaces`. Lives on Home, is persisted, and is read by Join.
- Mega menu: open or closed.
- Map: the selected location, plus the live counter values. These should come from a real events API. The placeholder data is in `eventmap.js`.
- Features: the search query and the active intent group.

## Design tokens (key values)
**Type:**
- Fonts: Unbounded for display (400–800), Instrument Serif italic for the "temple voice", Hanken Grotesk for UI and body (400–700). All from Google Fonts.
- Display XL: 96px, line height 0.95, tracking −0.04em
- Display L: 64px, line height 1, tracking −0.035em
- H1: 44px, line height 1.05
- H2: 30px
- H3: 22px
- H4: 18px
- Serif sizes: 72, 40 and 26px
- Body: 19px (large), 16px and 14px, all at line height 1.55
- Meta: 13px
- Label: 11px Unbounded, tracking 0.14em

**Stage theme:**
- Backgrounds and surfaces:
  - canvas `#0A0612`
  - sunken `#06030C`
  - card `#140B22`
  - raised `#1E1232`
- Text:
  - strong `#F6F0FF`
  - body `#D9CFEA`
  - muted `#A89BC2`
  - faint `#7A6E93`
- Primary action: `#FF2BD6`, with text in `#0A0612` and glow `0 0 24px rgba(255,43,214,.5), 0 0 64px rgba(139,92,255,.32)`
- Accent 2, links and focus: `#3DF2FF`

**Crossover hues (neon / deep):**
- violet `#8B5CFF` / `#5B3FD0`
- magenta `#FF2BD6` / `#B0287F`
- aqua `#3DF2FF` / `#17788A`
- sun `#FFC46B` / `#9A6200`
- Also used: UV cyan `#3DF2FF` and UV lime `#C6FF3D`

**Iridescent:** `conic-gradient(from 200deg, #FF9BD8, #B8A2FF, #8FE9FF, #C9FFB8, #FFE7A3, #FF9BD8)`. Use it only for marketing signature moments and earned things.

**Spacing scale (px):** 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88, 120

**Radius:**
- s 10px
- m 16px
- l 24px
- xl 36px
- orb 999px

**Shadows:** shadow-1, shadow-2 and shadow-float, defined in `tokens/space-motion.css`.

**Motion:**
- Easing curves:
  - breath `cubic-bezier(.45,0,.55,1)`
  - out `cubic-bezier(.16,1,.3,1)`
  - drop `cubic-bezier(.7,0,.3,1)`
- Durations: 160, 260 and 480ms
- Pulse speeds: breath still 8s, breath flow 5s, beat charge 0.5s
- Minimum hit target: 44px

For full values, including the Commons light theme used by the Members and Admin apps, see `tokens/*.css`.

## Copy rules (from guidelines/messaging.md)
- Core belief: "We build circles, not walls." Tagline: "Build circles, not walls."
- Toggle labels: Browse Community / Host Community.
- Hero headlines:
  - People: "Find local groups and events *near you.*"
  - Spaces: "Host local events and groups people *come back to.*"
- Always "What's happening", never "What's on".
- Open question: the Home intro still says "meet every week". It may need a softer line.

## Assets
- `assets/logo/`: wordmark PNGs
- `assets/icons/frequency-icons.svg`: SVG sprite (pin, event, circle, space, ticket, checkin, zap, membership, message, standing, gem, and more). `icons.js` is a helper for it.
- `assets/photos/`, `assets/broll/`, `assets/facilities/`: brand photography. Files with a `-web` suffix are compressed versions for the web.

## Files
- `templates/website/*.html`: the 9 page references
- `templates/website/web/`: kit CSS and JS
- `styles.css`, `tokens/`: the locked core
- `guidelines/`: messaging, website strategy (including the texture and mood rules), site themes, brand strategy, design principles, community model
