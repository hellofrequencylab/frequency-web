# Handoff: Frequency (website, member site, member admin)

## Overview
This bundle holds the complete Frequency design system and every designed page:
- **Front End:** the public marketing site.
- **Member Site:** the signed-in network.
- **Member Admin:** the console for Spaces and hosts.

The job is to build all three products on one shared token layer.

## About the design files
The HTML files are **design references**. They are working prototypes that show the intended look, copy and behavior. They are not production code. Recreate them in the target codebase. The member feed already maps to `hellofrequencylab/frequency-web` (Next.js), and `app/(main)/feed/page.tsx` is the existing route. If you are starting fresh, use Next.js (App Router) with the CSS custom properties from `tokens/` as the global token layer.

Open any of the three area pages in a browser to browse every page. All paths are relative, so keep the folder structure as it is.

## Fidelity
**High fidelity.** Colors, type, spacing, radii, motion and copy are final. Copy follows `guidelines/messaging.md`; do not rewrite headlines. All people, numbers, prices and places are sample data (Bird Rock, San Diego).

## Architecture
1. **Tokens (global, locked):**
   - `styles.css` imports the files in `tokens/`.
   - Port them as global CSS variables, or map them into your theme system 1:1.
   - Theme is set by attributes on a container: `data-theme="stage|commons"`, `data-time="day|night"`, `data-energy="still|flow|charge"`.
2. **Effect classes** (`tokens/base.css`):
   - Aura, breathe, grain, glass, panel, wash, iridescent text, button, rim and sheen, logo masks, logo flow, tooltip and toast.
   - Build each one as a small primitive component or a utility class.
3. **Icons:**
   - `assets/icons/frequency-icons.svg` is a sprite of 76 symbols.
   - Build one `<Icon name>` component that reads from it. Every symbol is 24×24 with `stroke="currentColor"`.
4. **Product kits:**
   - Each product folder has its own small CSS and JS layer, listed below.
   - In code these become layout components (header, footer, rails, sidebar) plus page components.

## Products and screens

### Front End: `templates/website/` (Stage theme)
Pages: Home, People, Spaces, Features, Pricing, Stories, Vision, Join, Help.
- **Shared parts:**
  - Header and mega menu, built by `web/megamenu.js`. Its `IDX` and `FJ` data drive the menus, search and feature journeys.
  - Footer.
  - "Keep going" panels.
  - Event map: Leaflet and OpenStreetMap, loaded when a map is close to scrolling into view, from `web/eventmap.js`. Its `EV` sample data needs replacing with your API.
- **Side state:** `body[data-side="p|e"]` with `.p-only` / `.e-only`, run by `web/side.js`.
  - Only Home toggles it, with the "Browse Community / Host Community" switch.
  - The choice is saved in `localStorage['fq-home-side']`.
  - Other pages fix the side with `data-lock`.
- **FX layer:** `web/fx.css` and `web/fx.js`.
  - Each page sets an energy level and three hues from a page table.
  - Visual layers: hero sphere, section halos, jewel orbs, seams, bitmap grain, signal lines and pointer card light.
  - All of it runs in one batched scroll loop, pauses when offscreen, and stops under reduced motion.
  - Full details and the performance budget are in `templates/website/README.md`.
- **Forms:** Join (`form.jx-f`) and Help (`#hpc`) are front-end only. Wire them to the backend.

### Member Site: `templates/members/` (Commons theme + member layer)
Pages, grouped by the four sections of the header menu:
- **Home:** Feed, Events, Event, Search, Messages.
- **Community:** Circles, Circle, Marketplace.
- **The Quest:** Journey, Mindless.
- **You:** Profile, The Vault, Settings, Help, Site map.

Implementation notes:
- **Feed** (`Members.dc.html`) is the full prototype:
  - Resizable, collapsible rails.
  - Ranked "Up next".
  - Near you filters.
  - Needs you queue.
  - Onboarding.
  - Posts.
  - A hard stop when you're caught up.
  
  The complete spec, covering layout, every component, state and ranking signals, is in `templates/members/README.md`. All data and handlers live in the logic class at the bottom of the file.
- **Every other screen** shares one shell: `app/nav.js` (all menu data), `app/shell.js` and `app/app.css`, plus `app/ambient.js` for depth and parallax.
  - **Header:** identical to the Feed's on every page: wordmark over the left rail, Home / Community / The Quest / You mega menu (data in `nav.js` `mega`), search, messages, notifications sheet, Zap capture sheet, avatar. Transparent at the top, glass once scrolled.
  - **Left rail:** the repo's spine from `lib/nav-areas.ts`: Feed + My Frequency disclosure, then Community, The Quest, Admin. Folds to a 76px icon strip.
  - **Right rail:** "On this page" (title + section links that track scroll), the page's own `<aside class="side">` moved in underneath, then route panels from `nav.js` `panels` (mirrors `lib/layout/rail-panels.ts`), then the Vault dock at the foot (Zaps, Gems, streak at rest; opens to rank, adopted practices with Start, streak week, rank progress). Hidden on Quest pages.
  - Both rails default to the logo width (`--rail: 248px`), fold independently, scroll independently, and persist their state. A page can default its right rail folded with `body[data-rail-r="fold"]` (Events does).
  - The page sets `body[data-area]` for the header highlight; the rail highlight comes from the file name map in `nav.js` `pages`.
  - Interaction helpers:
    - `data-group` / `data-pane`: tabs and segmented choices.
    - `.sw`: switches.
    - `data-swap="A|B"`: toggle buttons such as Go / Going.
    - `data-toast`: shows a confirmation pop-up.
    - `data-remove`: dismisses a row.
  
  In code, replace these helpers with component state.
- **Key components** (class names in `app.css`):
  - Actions: buttons `.btn` with `.pa`, `.ink`, `.txt` and `.sm` / `.lg` variants; filter chips (`.chips` / `.chip`); underline tabs (`.tabs`).
  - Containers: glass `.panel`, white `.card`, soft `.soft` card.
  - People and media: avatars (`.av`, sized `.s` / `.m` / `.l` / `.xl`) with face stacks (`.faces`), and photo backgrounds (`.ph`).
  - Lists and data: list rows (`.list`, `.t1` / `.t2`), big numbers (`.num`) and meters (`.meter`).
  - Forms: fields (`.field`, `.input`) and switches (`.sw`).

### Member Admin: `templates/admin/` (Commons, denser)
Pages: Overview, Page editor, Contacts, Memberships, Standing, Moderation, Economy.
- **Page editor** (`Page Editor.html` with `editor/editor.css` and `editor/editor.js`): this is the layout of the production Space website editor (`components/sites/editor/shell.tsx`), redesigned in Commons.
  - **Top bar:** back, Space, page picker, save state, rail folds, device switch, undo / redo, preview, presence, Share, Publish.
  - **Left rail:** Pages, Layers (drag to reorder), Add (blocks by category), Theme, Site (search and sharing).
  - **Stage:** the live page, editable inline. Selecting a section shows its label and a floating toolbar (move, duplicate, comment, hide on this device, delete). "+ Add section" appears between sections. Device widths and zoom are on the stage, and the Vera command bar has suggestions for the selected section.
  - **Inspector:** Content, Design, Advanced and Notes tabs, with Duplicate and Delete.
  - **Publish modal:** a change list, checks, and publish now or schedule.
  - **One model drives everything:** the canvas, layers and inspector read the same document, with undo history. Shortcuts: ⌘Z, ⇧⌘Z, ⌘P, ⌘K and Esc.
- **Shell:** `shell.js` builds a 264px glass sidebar.
  - It holds the Space switcher and the navigation, with a badge on Moderation.
  - It also builds the sticky top bar with breadcrumb, search, alerts and avatar.
  - It reuses the member kit for buttons, panels and type.
- **Extra components** (in `admin.css`):
  - KPI cards: `.kpi`, with `.up` / `.down` trend lines.
  - Data tables: `.tbl`.
  - Status pills: `.st`, in `.ok`, `.warn`, `.bad` and `.n` variants.
  - Bar charts: `.bars`.

## Infographics, feature blocks and the element library
- **Game values:** `assets/economy/economy.json` is the single source for every Zap and Gem rate, cap, conversion and rank rule, synced from the repo's `zaps-and-gems.md` and `lib/gems.ts`.
  - Static pages read it through `assets/economy/economy.js`, using the `data-zap`, `data-gem`, `data-zap-x`, `data-convert` and `data-econ-list` attributes.
  - The Feed loads it in `componentDidMount` (`this.ez(kind, id)`).
  - In code, replace both readers with the `gem_config` table and the Zap config. Two `bonus` entries are marked as design placeholders that aren't in the repo yet; confirm or remove them.
- **Infographics:** `tokens/infographics.css`, with the renderers `assets/infographics/ig.js` (smart elements) and `ig-kinds.js` (the 10 kinds). Port them as server-rendered components; the reference markup is the spec.
- **Feature blocks:** `tokens/features.css`, where one markup per presentation covers every offering:
  - `.fe-card`: vertical card with the photo on top. The `.text` variant is for offerings without a photo.
  - `.fe-row`: compact row for lists and rails.
  - `.fe-spot`: large split spotlight, with `.flip` and `.soft` variants.
  - `.fe-poster`: tall Stage poster.
  
  Content slots: `.fe-media`, `.fe-tag`, `.fe-date`, `.fe-k`, `.fe-t`, `.fe-m`, `.fe-why`, `.fe-foot`, `.fe-act`.
- **Element library:** the full plan for the website editor's Theme Element Library is in `design_handoff_element_library/README.md`, with the agent brief at the top, and in `guidelines/element-library.md`.

## Design tokens (quick reference)
- **Stage colors:**
  - Background: void `#0A0612`, card `#140B22`, raised `#1E1232`.
  - Text: strong `#F6F0FF`, body `#D9CFEA`, muted `#A89BC2`.
- **Commons colors:**
  - Surfaces: card `#FFFFFF`, canvas `#FBF7F0`.
  - Ink: strong `#34312E`, body `#4D4945`, muted `#7C766F`, faint `#A59F98`.
  - Hairline `rgba(30,27,24,.07)`.
- **Crossover hues (neon / deep):**
  - Violet `#8B5CFF` / `#5B3FD0`.
  - Magenta `#FF2BD6` / `#B0287F`.
  - Aqua `#3DF2FF` / `#17788A`.
  - Sun `#FFC46B` / `#9A6200`.
- **Member accent `--pa`:** `linear-gradient(120deg,#EEC1EC 0%,#C4B8FF 36%,#A3D4FF 68%,#8FE9FF 100%)`.
- **Type:**
  - Unbounded 500–600 for display. Tracking −.02 to −.055em. Labels are 11px at +.14em, uppercase.
  - Hanken Grotesk for UI and body: 13 / 14 / 15 / 16 / 18px.
  - Instrument Serif italic for one soft phrase per moment.
- **Radius:**
  - Scale: 10, 16, 24, 36, and pill.
  - In the product: 14 (tooltip), 20 (listing), 28 (hero).
- **Motion:**
  - Ease-out `cubic-bezier(.16,1,.3,1)` and ease-breath `cubic-bezier(.45,0,.55,1)`.
  - Durations: 160, 260 and 480ms.
  - Pulse: 8s still, 5s flow, 0.5s charge.
  - Reduced motion stops every loop.
- **Hit targets:** 44px minimum; primary buttons are 48px.

## Assets
| Folder | Contents |
|---|---|
| `assets/logo/` | Wordmark and round icon PNGs, supplied by the owner. Use them as masks. Vector versions have been requested. |
| `assets/icons/` | The sprite, `icons.js` (inliner for pages) and `inline.js` (inliner for Design Components). |
| `assets/photos/`, `assets/broll/` | Owner photography. Files with `-web` in the name are compressed for the web. |
| `assets/facilities/` | Facility concept renders, used on Vision only. |

## Open items
- Copy rule: never push "every week" or "weekly"; frame it as connecting consistently with community (`guidelines/messaging.md`).
- All data is sample data. The ranking signals for Up next and Near you are listed in the members README.
- The preview helper is gone. In production, also drop the `support.js` / `ds-base.js` prototype runtimes that the two `.dc.html` area files use.
- Events map: set `window.FQ_GMAPS_KEY` (or localStorage `fq-gmaps-key`) to render Google Maps with a `mapId`; without a key the same pins render on Leaflet + CARTO tiles. See `templates/members/app/events.js`.

## Files
- `HANDOFF-UPDATE-2026-10-13.md`: what changed since the previous handoff.
- `Frequency Front End.html`, `Frequency Member Site.html`, `Frequency Member Admin.html`: browse pages.
- `guidelines/brand-book.html`: the visual brand book.
- `guidelines/cards/*.html`: one card per design element.
- `guidelines/*.md`: the written guidelines.
- `templates/website/`, `templates/members/`, `templates/admin/`: every page and its kit.
- `styles.css`, `tokens/`, `assets/`: the core.
