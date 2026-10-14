# Page Editor: Claude Code handoff

**Target:** `hellofrequencylab/frequency-web` (`main`) → `components/sites/editor/shell.tsx` and its children.
**Design source:** `templates/admin/Page Editor.html` + `editor/editor.css` + `editor/editor.js` (prototype; vanilla JS, one file of logic).
**Goal:** Rebuild the production Space website editor to match this layout and behaviour. Keep production's data layer, persistence and auth. Replace the UI.

Open the prototype in a browser first and click through everything below. The prototype is the spec; this doc is the map.

---

## 1. Layout

CSS grid, full viewport, no page scroll. Four regions:

```
┌──────────────────────── top bar (56px) ────────────────────────┐
│ rail 280px │            stage (canvas)            │ insp 320px │
└────────────┴──────────────────────────────────────┴────────────┘
```

- `.pe[data-lf="1"]` folds the left rail, `[data-rf="1"]` folds the inspector, `[data-preview="1"]` hides both rails and makes the canvas read-only.
- Theme: `body[data-theme="commons"][data-energy="flow"]`, near-white `#FFFEFC` chrome. Tokens come from `styles.css`. Do not hardcode colours that exist as tokens.
- Icons: the in-house set (`assets/icons/frequency-icons.svg`, `<use href="#id">`). A few editor-only glyphs (undo, redo, eye, device, layers, palette) are inline in `editor.js` → `S`. Move them into the icon set.

## 2. Top bar (left → right)
Back to Overview · Space avatar + name + URL · **Page picker** (dropdown; status dot: green published, amber draft changes) · **Save state** ("Saving…" → "Draft saved · just now", autosave ~700ms debounce) · spacer · fold left · **Device seg** (desktop / tablet / phone) · fold right · Undo · Redo · Preview (⌘P) · presence faces · Share (copies draft preview link) · **Publish** (badge = number of pending changes).

## 3. Left rail tabs
| Tab | Contents |
|---|---|
| Pages | Page list with path + status; "Start from" templates |
| Layers (default) | Header (site chrome, locked) → sections → Footer (locked). Drag to reorder. Row shows icon, type, title, index or "Live". Hidden-on-device rows dim. |
| Add | Search + blocks grouped by category: Sections, Content, Live, Media. If opened from an insert point, shows "Adding at position N". |
| Theme | Theme (Commons / Sand / Thermal), accent swatches, type pairing |
| Site | SEO title/description with counters, address, custom domain, "Show in What's happening" toggle |

Footer: "Changes save as a draft" + Live site link.

## 4. Stage (canvas)
- Renders the real Space site (nav, sections, footer) inside a frame whose width follows the device (`#stage[data-device]`).
- **Hover a section:** type tag top-left, floating toolbar top-right: up, down, duplicate | comment, hide on current device, delete.
- **Click a section:** selects it (outline), syncs Layers + inspector.
- **Inline text editing:** `contenteditable` on text fields (`data-k`). Typing updates the model and the inspector input live, and the other way round.
- **Insert points:** "+ Add section" between every section and at the end → opens Add tab targeting that index.
- **Zoom:** 50–100% in 10% steps, bottom-left.
- **Vera bar** (bottom centre): AI prompt scoped to the selected section ("Hero" chip), suggestion chips per section type, reply card with Apply / Not now. Apply is one undo step. ⌘K focuses it. Wire to the production assistant endpoint; the prototype uses canned replies (`SUG`, `REP`).

## 5. Inspector
Header: icon, type, "Section N of M · Live data", fold button. Sub-tabs:
- **Content:** fields per block type (`TYPES[x].f`): text with char count, textarea, image (Replace + focal point). Live blocks show the note "Live from your Space. Dates, hosts and prices update on their own." FAQ has a question list + Add.
- **Design:** Background tone (white, sand, pastel, ink), content width (narrow 760 / default 1040 / wide 1200 / full), align (left/center), spacing (0–3 → 32/56/88/120px), columns 1–4 for grid blocks.
- **Advanced:** reveal on scroll (none/fade/rise), show on desktop/tablet/phone, anchor slug, custom class + data attributes (collapsed).
- **Notes:** comment thread on the section, reply + @mention.

Footer: Duplicate, Delete. Empty state when nothing is selected.

## 6. Data model
One document drives canvas, Layers and inspector. Never hold section state in components.

```ts
type Section = {
  id: string
  type: 'Hero'|'About'|'Schedule'|'Hosts'|'Gallery'|'Plans'|'Stats'|'FAQ'|'CTA'
  tone: 'white'|'sand'|'pastel'|'ink'
  width: 'narrow'|'default'|'wide'|'full'
  align: 'left'|'center'
  pad: 0|1|2|3
  cols: 1|2|3|4
  anim: 'none'|'fade'|'rise'
  vis: { desktop: boolean; tablet: boolean; phone: boolean }
  anchor: string
  props: Record<string, unknown>   // per-type, see TYPES in editor.js
}
type PageDoc = { sections: Section[] }
```

Block registry (`TYPES` in `editor.js`): `icon`, `label`, `cat`, `live` (pulls Space data: Schedule, Hosts, Plans, Stats), default `props`, and `f` (inspector field list). Port it as a typed registry so new blocks are one entry. If production already has a block registry, map onto it instead of creating a second one. The full element library plan is in `design_handoff_element_library/README.md`.

## 7. Behaviour rules
- **Undo/redo:** snapshot before each mutation, 60 deep, ⌘Z / ⇧⌘Z (ignored while focus is in an input). One snapshot per typing burst (per focus), not per keystroke.
- **Change log:** each mutation adds a human label ("Edited Hero", "Reordered sections", "Removed FAQ"). Deduped. Feeds the Publish badge and modal.
- **Delete** toasts "X removed. Undo with ⌘Z." No confirm dialog.
- **Hide** applies to the current device only.
- **Preview:** hides rails, disables contenteditable, Esc exits.
- **Publish modal:** change list, pre-flight checks (alt text, title/description, other pages with unpublished changes), Publish now / Schedule (date + time). On success: clear change log, toast with live URL.
- **Toasts:** bottom centre, 2.6s, `role="status"`.

## 8. Replace in production
Prototype stand-ins to swap for real data/services:
- Hardcoded Space (Royal Temple), page list, live card data, photos in `assets/photos/` → Space queries.
- Theme switch uses a CSS filter hack for Thermal → apply real theme tokens to the frame.
- Image Replace cycles a photo pool → media picker.
- Share, comments, presence, schedule → real endpoints.
- Canned Vera replies → assistant API.

## 9. Done when
- [ ] Layout, folds and preview match the prototype at 1280, 1440 and 1920 wide.
- [ ] Editing on canvas and in inspector stays in sync both ways.
- [ ] Reorder by toolbar arrows and by Layers drag; insert at any index.
- [ ] Device switch changes frame width and per-device visibility.
- [ ] Undo/redo covers every mutation, including Vera Apply.
- [ ] Autosave state and Publish badge reflect real changes.
- [ ] Keyboard: ⌘Z, ⇧⌘Z, ⌘P, ⌘K, Esc.
- [ ] Icons from the in-house set, colours from tokens, no hex outside `styles.css` except data.
- [ ] Toolbar buttons and toggles have labels / `aria-pressed` / `role="switch"`.
