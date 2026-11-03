# The block builder

Frequency's page builder. One document per page, rendered on four surfaces, edited through a canvas, an outline and one right panel. Theme-agnostic: it reads roles, variants and slots; it never names a colour or a font.

Reference: `source/Frequency Builder v3.dc.html` (template first, logic class in the `<script data-dc-script>` at the end). Runs offline as `Frequency Builder (standalone).html`.

## 1. Model

**Record × Contract × Dials → Surfaces** (from the theme framework). The builder holds the record and the dials the host may turn; the theme holds the contract.

```
doc        = [ section ]              one page, in order
section    = { id, role, variant, pinned, hide: {desktop|tablet|phone}, c: { slots… } }
role       = one of 21 Frequency functions (see §6); each declares intent, group, variants, needs, fields, live
meta[page] = { title, description }
footer     = { phone, email, hours, city }
history / future  = snapshots of { doc, theme, footer, meta } (60 deep)
versions   = every publish, restorable as a new draft
```

What the builder stores for a section is structure and words only. `variant` is the theme's named layout for that role (`split`, `photo`, `glow`, `minimal` for the hero). `pinned` means the host chose it; an unpinned section follows the theme's default. The theme decides what each variant looks like.

## 2. Shell

Grid, three columns inside a 60px header:

| Area | Width | Notes |
|---|---|---|
| Outline rail | 264px expanded, 72px collapsed | Collapses automatically under 1240px; toggle persists |
| Canvas | `minmax(0,1fr)` | Dot grid ground `radial-gradient(circle at 1px 1px, rgba(30,27,24,.07) 1px, transparent 0) 0 0/22px 22px` |
| Right panel | 300 to 560px, drag or arrow keys on the left edge | Docked (pushes the canvas) or floating (overlays); under 1080px always floats |

Chrome is the Frequency design system's **Commons** theme: `--bg-sunken` ground, white panels at 90 to 94% (no backdrop blur), ink `#1E1B18`, hairlines `rgba(30,27,24,.08)`, selection ring `#C4B8FF`, radii 6, 8, 10, 12, 16. Type: Hanken Grotesk for UI at 12 to 14px, Unbounded for the Space name and panel headings. Focus: `2px solid #1E1B18` outline, offset 2px, plus a `0 0 0 5px #C4B8FF` ring. `prefers-reduced-motion` collapses every transition to 1ms.

### Header, left to right
- Frequency wordmark (mask, `--text-strong`), link "Back to all your Spaces".
- Breadcrumb, `nav aria-label="Where you are"`: Spaces / Space name / Site builder / **Page** (`aria-current="page"`). Under 1360px the first three collapse into an ellipsis button that opens a `role="menu"`.
- Save state: 7px dot plus word. `Saving` (reward amber) 900ms after the last edit, then `Saved` (presence teal); `Offline · changes kept here` (danger) when `navigator.onLine` is false.
- **Show as** menu button: current surface and viewer (`Site · Visitor`). Opens a `role="menu"` with four `menuitemradio` surfaces (Site, Profile, Spotlight, Email, each with a one-line why) and a View as segmented control (Visitor, Member, Host; `aria-pressed`).
- ⌘K button, `aria-label="Find, do or ask. Shortcut: command K"`.
- Preview toggle (`aria-pressed`). In preview the chrome hides, a pill at the bottom reads "Previewing as visitor · press Esc or backslash to edit".
- **Publish**. Label and colour follow state: `Publish` ink with a "N to fix" pill when issues exist; `Publish` on the `--pa` gradient when clean; `Publishing` with a breathing dot; `Published` presence-soft once live and unchanged. `aria-haspopup="dialog"`, `aria-expanded`, described by a hidden sentence of the same state.

### Outline rail (`nav aria-label="Page outline"`)
- Space avatar, name, "New World · descriptor".
- "On this page · N" caption.
- One **button** per section inside a `role="list"`: 36px icon tile, intent, variant line (`Framed photo · 2 to fix`). Selected = ink tile, white icon, `aria-current="true"`, row ground `rgba(30,27,24,.06)`. A 5px dot in the tile's corner marks a section with readiness issues. Collapsed rail shows only the tiles, with `title` and a full `aria-label` ("3 of 19. Show your groups. Photo and list. 1 to fix").
- Rows are draggable (drop line `#C4B8FF` above or below), and when selected show Move up / Move down buttons beside the row, so reorder has a single-pointer and keyboard path. ⌥↑ / ⌥↓ also reorder.
- Footer row ("Footer · every page") and an **Add a section** button (`aria-haspopup="dialog"`).

### Canvas
- The page sits in a frame of `min(surface width, device width)`: Site 1280, Profile 760, Spotlight 720, Email 600; Desktop 1280, Tablet 820, Phone 390.
- Above the frame, an **address bar** (edit mode only): back and forward (disabled at the ends), `frequency.city / <space> / <page ▾>` where the page segment opens the only page switcher (`role="menu"`, `menuitemradio` per page, then Page title and description, Version history, New page), then Desktop · Tablet · Phone (`aria-pressed`), Undo and Redo (disabled when empty), Open live site.
- Sections carry `data-sid`. Hover shows a dashed outline `1.5px dashed rgba(196,184,255,.6)`; selection a `inset 0 0 0 2px #C4B8FF` ring and `z-index: 2`.
- **Selected-section toolbar** (`role="toolbar"`) sits at the section's top: an ink intent tag (with a "Live" pill for live roles), then a white island with layout chips (`aria-pressed`; a blocked chip stays visible at 55% with "· needs a photo" written inline), Move up, Move down, Delete.
- Unselected sections with issues show a white pill, top right: "Sample words · not yours yet" or "N to fix"; clicking selects the section.
- Sections hidden on the current device render at 40% with an ink pill "Hidden on phone".
- Between sections a hover-revealed "+ Add here" line; after the last, a dashed "What should come next?" card.
- The site's own nav links select the nav block in edit mode; ⌘-click follows the link. The footer selects as one block.

### Right panel (`aside`, `role="tablist"`: Edit, Vera, Theme)
Header row: tabs, Docked/Floating toggle (`aria-pressed`), Minimize. Minimized, a floating three-button toolbar at the top right reopens it.

**Edit, nothing selected**: a progress card. "Make this page yours", percentage, `role="progressbar"`, one line of what is left, then a four-item checklist (Replace the sample words, Describe the hero photo, Give the page a title and description, Publish), each a button that jumps to the fix. Keyboard shortcuts live in a collapsed `<details>` below.

**Edit, section selected**: icon, intent, "Section n of N · Live data". A note for live roles ("Live from your Space. Dates, prices and people update on their own."). Then the role's **fields** in order, each a label, input or textarea, a count that appears only in the last 20% of its limit (red and `aria-invalid` when over, with the overage written under the field), and a one-line hint. Photo slots show a thumbnail and **Choose photo** (opens the photo sheet). Then **Layout**: the variants as chips with "In use" or "Needs a photo", and a switch "Keep this layout when the theme changes" (`role="switch"`). Then **More** (`aria-expanded`): Show on Desktop / Tablet / Phone switches and the per-surface density note. Background, width and spacing are shown as a sentence explaining the theme sets them; the builder has no colour or spacing controls. Footer: Duplicate, Delete.

**Edit, footer / nav / page selected**: footer fields (phone, email, hours, city); nav explains it follows pages and that ⌘-click follows a link; page shows Title (60) and Description (160) with search hints.

**Vera**: orb, name, a "How Vera helps" segmented control (Suggest changes | Ask me questions), intro that names the selected section, chips only when a section is selected, a log, an Ask form. A suggestion arrives as an in-page diff card under the section (strikethrough, replacement, Accept, Not now). Nothing changes without Accept.

**Theme**: the theme's cards. For New World, two: Night and Day. Hover or focus tries it on the canvas; **Keep** applies it (undoable). The note explains the accent comes from the Space.

## 3. Dialogs and overlays
All are `role="dialog" aria-modal="true"` with a labelled heading, focus moved in on open, Tab trapped, focus returned to the opener on close, Esc closes.

- **Add a section**: "What should this part do?", search, "Suggested for this page" (roles the page lacks, up to three), then groups Welcome, Show up, Trust, Answer, More. Each card: a 64×48 layout thumbnail, intent, one-line why. Roles the kit has off do not appear. Empty search shows a sentence and an Ask Vera button.
- **Choose a photo**: Upload, the Space library as a `radiogroup` of photo cards with their descriptions, a description field that prefills from the chosen photo, Use this photo.
- **Publish**: title states the count; issues as buttons with Fix; passes as a checked list (Page title set, Description set, Every word is yours, Photos described, Everything fits its space); the live URL; Publish or Publish anyway.
- **Published**: link with Copy, Post to your feed, Send as this week's email, the next event card, Back to editing.
- **Version history**: every publish with time, section count and theme; Restore makes a new draft.
- **⌘K**: combobox with `aria-activedescendant`, groups Go to / Do / Ask Vera, arrow keys, Enter runs the highlighted row, footer legend.

## 4. Readiness
One model feeds the Publish badge, the per-section pill, the checklist and the Publish sheet. Issues per section: sample words still present (`c.sample`), hero photo without a description, any field over its limit. Page-level: missing title, missing description. Editing any slot or item clears `sample`.

## 5. Keyboard
↑ ↓ move between sections · ⌥↑ ⌥↓ reorder · ⌘K find, do or ask · ⌘Z undo, ⇧⌘Z redo · \ preview · Esc closes a dialog, exits preview, blurs a field, or clears selection · Backspace / Delete removes the selected section (not footer, nav or page). Enter in a single-line slot blurs instead of inserting a line break.

## 6. Roles (the 21 Frequency functions)
| role | intent (host-facing) | group | variants | live | items |
|---|---|---|---|---|---|
| hero | Say who you are | Welcome | split, photo, glow, minimal (photo and split need a photo) | | |
| trust | Show your numbers | Welcome | bar | yes | |
| story | Tell your story | Welcome | split | | lines |
| circles | Show your groups | Show up | list | yes | |
| events | Show what's happening | Show up | agenda | yes | |
| firstnight | Explain a first visit | Show up | thread | | steps |
| services | List ways in | Show up | cards | yes | |
| plans | Offer memberships | Show up | tiers | yes | |
| booking | Let people save a spot | Show up | board | yes | |
| steps | Explain how it works | Show up | columns | | steps |
| reviews | Show what members say | Trust | wall, quote | | quotes |
| team | Introduce your hosts | Trust | cards | yes | |
| gallery | Show the room | Trust | grid | | |
| posts | Share what you write | Trust | list | yes | |
| shop | Sell a few things | More | cards | yes | |
| locations | Say where you meet | Answer | split | | |
| forms | Take questions | Answer | card | | |
| letter | Collect emails | Answer | center | | |
| faq | Answer questions | Answer | stack, cards | | questions |
| business | Show the tools behind it | Answer | list | | |
| cta | Invite people in | Answer | band | | |

Fields per role are in `ROLES` in the logic class: slot key, label, type (`text`, `area`, `image`), limit, hint. Live roles draw their rows from the Space; the builder only edits the heading, soft phrase and intro. Roles with `items` edit each item in place on the canvas, with add and remove when the section is selected.

## 7. Pages
Home, Our story, Ways in, Book. Each page is its own doc; Home follows the theme's default order (`hero, trust, story, circles, events, firstnight, reviews, team, services, plans, booking, gallery, posts, shop, steps, locations, forms, letter, faq, business, cta`, filtered by the kit's functions). The other pages seed from role lists (`PAGE_ROLES`).

## 8. State the builder keeps
`doc, pages, page, navHist, navIdx, meta, footer, sel, panel, outline, more, surface, device, viewAs, theme, hoverTheme, preview, minimized, railMode, pw, history, future, versions, dirty, saveState, online, proposal, veraLog, veraMode, addOpen, addAt, addQ, photoOpen, photoPick, photoAlt, publishOpen, doneOpen, historyOpen, cmdOpen, cmdQ, cmdIdx, showMenu, crumbMenu, pageMenu, toast, canUndo, drag, over, kitId`.

## 9. Tweaks (props on the component)
`kit` picks the New World content kit (general, coaches, studios, hosts, venues, nonprofits, networks); `railMode` sets the panel default (push | overlay). Both are developer props; neither is host-facing.

## 10. Assets
Frequency design system tokens and `_ds_bundle.js`-free stylesheets under `source/_ds/`, the 76-icon sprite `assets/icons/frequency-icons.svg` (loaded once and inlined for `<use>`), the wordmark mask, seven gathering photos. The New World theme files it loads are documented in `../theme-new-world/README.md`.
