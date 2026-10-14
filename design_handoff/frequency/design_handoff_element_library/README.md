# Agent brief: build the Theme Element Library with the Frequency elements

Read this section first, then the reference sections below it. You are implementing the proposal "Theme Element Library" (2026-10-13) in `hellofrequencylab/frequency-web`. This package is the design input: visual specs, the data shapes, a theme manifest, and reference markup for every element.

## What to build, in order
1. **L0 · defineBlock** (per EDITOR-ARCHITECTURE E1), for new blocks only.
   - Each block needs a Zod schema, `example` props, a text projection and a version.
   - Seed the schemas from §3: the common envelope plus the item shape for each kind. Every number field is `nullable()`.
2. **L1 · theme manifests.**
   - Add a manifest type matching `assets/infographics/theme-pack.json`: `tokens`, `variants`, `pack[]` with `fallback`, `presets[]`, and fonts.
   - Write manifests for Default, Bold and Wildheart, then register **Frequency as a platform pack** from `theme-pack.json`.
   - Port the token roles in §2 into the `--th-*` and `--ig-*` custom properties in each theme sheet.
3. **L2 · insert panel.**
   - Tabs: Elements, Sections, Live data, Infographics, This theme, Saved.
   - Previews render from each block's `example` inside the current theme.
   - Hide pack items that the active theme doesn't provide.
4. **L3 · Infographic smart element.** One block, `Infographic`, with `props = { kind, title, items, source, variant, describe }`.
   - Server-render each kind to plain HTML/SVG matching the reference markup from `assets/infographics/ig-kinds.js` and the CSS in `tokens/infographics.css` (port the `.ig-*` rules).
   - **No client JS.**
   - Order: stats, steps, timeline, comparison, meter, then bar, donut, iconList, pictogram, quote.
   - Implement the guardrails in §3: the "needs a number" slot, blocking publish while any number is empty, the "needs a source" line, `describe` as the figure's text version, and the data table.
5. **L4 · Vera compose.**
   - Draft JSON in the envelope shape only, and validate it against the L0 schema.
   - Check every number against the owner's text or the Space's data. If a number can't be verified, set it to `null`.
6. **v2 · Frequency smart elements:** streak arc, streak thread, layered bars (with D/W/M/Y sets), podium, orbit and weave. Their data shapes and fallbacks are in §3.

## Rules
- **Roles, never raw values.** Elements read token roles. Theme-specific looks live in the manifest's `variants` map.
- **Every pack item names a fallback.** Switching theme swaps pack items to their fallbacks, and the editor lists what changed.
- **Truthful by construction.** Values are nullable, starting points ship with empty numbers, and every figure shows a source line.
- **Reference output is the spec.** The browser scripts here exist only for review. Your server components should produce the same DOM and classes, so the CSS ports across unchanged.

## How to check your work
Open `guidelines/cards/infographics.html` locally. The "Element library" section renders all 10 kinds from JSON. Diff your server output for the same JSON against it. The probes in §5 are the acceptance tests.

---

# Handoff: Frequency elements → Theme Element Library

## Overview
This package plugs the Frequency design system into the website editor's **Theme Element Library** proposal (2026-10-13). It provides:
1. A **theme manifest** for Frequency as the first platform-level theme pack: `assets/infographics/theme-pack.json`.
2. **Reference markup and CSS for the 10 v1 infographic kinds** (stats, iconList, steps, timeline, comparison, bar, donut, meter, pictogram, quote). They are driven by the proposal's exact data model.
3. **Frequency smart elements** for v2: streak arc, streak thread, layered bars (D/W/M/Y), podium, orbit and weave.
4. **The process** for adding new assets to the library. Section 4 describes it.

## About the design files
These files are **design references**. `ig.js` and `ig-kinds.js` render the reference markup in the browser so the designs can be reviewed. In `frequency-web`, the same markup must be produced **server-side** from the same JSON, as the proposal requires: zero client JS for infographics, and SVG/HTML on tokens. Treat the HTML these scripts output as the spec, and the CSS in `tokens/infographics.css` as the styling to port.

## Fidelity
**High fidelity:**
- Colors (the Frequency palette: pastel iridescent on Commons, full iridescent on Stage), type, spacing, radii and states are final.
- Sample figures are illustrative.
- Starting points must ship with labels and empty numbers, as the proposal requires.

Open `guidelines/cards/infographics.html` to see every element, and the 10 kinds rendered from JSON.

---

## 1. How this maps to the proposal's phases
| Phase | What this package gives you |
|---|---|
| **L0** defineBlock | A JSON shape and example props per kind (§3). Use them as each block's Zod schema seed and `example`. |
| **L1** Theme manifests | `theme-pack.json`, with token roles, variant maps, pack items with fallbacks, and fonts. Add it as a platform pack alongside Default, Bold and Wildheart. |
| **L2** Insert panel | Every kind ships example props, so the insert panel can render previews in the current theme. |
| **L3** Infographics v1 | Reference markup and CSS for all 10 kinds, with the figure chrome: source line, "needs a number" slots, the publish block, the text version and the "See the data" table. |
| **L4** Vera builds | Nothing new to add. The renderer already treats `value: null` as blank, which is what the "no invented numbers" probe expects. |
| **L5** Saved blocks | Not covered here. |

## 2. Token roles (theme contract)
Elements read **roles**, never raw values. Frequency's values, from `theme-pack.json` → `tokens`:
| Role | Stage (dark) | Commons (light) |
|---|---|---|
| `--th-bg` | `#0A0612` | `#FFFFFF` |
| `--th-text` | `#F6F0FF` | `#34312E` |
| `--th-muted` | `#A89BC2` | `#7C766F` |
| `--th-accent` | `var(--iridescent-sweep)` | `var(--pa)`: `linear-gradient(120deg,#EEC1EC 0%,#C4B8FF 36%,#A3D4FF 68%,#8FE9FF 100%)` |
| `--th-r` | 24px | 24px |

The infographic layer reads these through `--ig-*` aliases, so another theme only needs to set the roles:
- `--ig-fill`: accent
- `--ig-orb`: the radial version of the accent
- `--ig-track`: 7% ink
- `--ig-dash`: 16% ink
- `--ig-ink`: text
- `--ig-sub`: muted text
- `--ig-hole`: background
- `--ig-node`: node fill

Series palette, in this order:
1. lavender `#C4B8FF`
2. aqua `#8FE9FF`
3. pink `#EEC1EC`
4. sky `#A3D4FF`
5. periwinkle `#B3C6FF`

## 3. The 10 kinds: schema, variants and markup
Common envelope, verbatim from the proposal:
```json
{ "kind": "stats", "title": "…", "items": [ … ], "source": "…", "variant": "grid-4", "describe": "…" }
```
Renderer rules, which also double as L3 probes:
- `value: null`, `needsValue: true`, `current: null` or `count: null` renders a dashed **"needs a number"** pill, and the footer shows **"Publish blocked: fill every number"**.
- A missing `source` renders **"needs a source"**.
- The visual is `aria-hidden`. `describe` is rendered as screen-reader text, and a `<details>` element with "See the data" holds a table generated from `items`.
- Phones reflow: stats grids drop to 2 columns, and timelines are vertical by default.

| kind | item shape | extra envelope keys | variants (Frequency) | reference class |
|---|---|---|---|---|
| stats | `value, unit, label` | none | `grid-2` `grid-4` `cards` | `.ig-k-stats` + `.ig-stat` / `.ig-card` |
| iconList | `icon, title, line` | none | `rows` | `.ig-k-list` (sprite icon ids) |
| steps | `title, line, icon` | `done` (count lit) | `numbered` | `.ig-path` |
| timeline | `date` or `time, title, line` | none | `vertical` | `.ig-k-time` |
| comparison | `label, values[]` (text / true / false) | `columns[]`, `highlight` | `columns` | `.ig-k-cmp` |
| bar | `label, value` | `highlight`, `height` | `single` | `.ig-k-bar` + `.ig-bars` |
| donut | `label, value, color?` | none | `ring` | `.ig-k-donut` |
| meter | `current, goal, unit, label` | none | `tide` | `.ig-k-meter` + `.ig-meter` |
| pictogram | `count, of, icon, label` | none | `icons` | `.ig-k-pic` |
| quote | `text, who, role` | none | `pull` | `.ig-k-quote` |

Example props for each kind are in `guidelines/cards/infographics.html`, in the "Element library" section, one `data-json` per figure. Use them as `example` in `defineBlock`.

### Frequency smart elements (v2, theme pack)
| id | data | markup | fallback |
|---|---|---|---|
| streak-arc | `count, best, state[]` (done / freeze / today / miss) | `data-ig="streak"` | stats |
| streak-thread | `state[], days[]` | `data-ig="chain"` | stats |
| layered bars | `sets: {D, W, M, Y: {labels, series[{name, unit, color, values}]}}` | `data-ig="stack"` with `data-sets` | bar |
| podium | top 3: `face, name, value` | `.ig-podium` | stats |
| orbit | rings → satellites (`angle, size, color` or `photo`), plus a core label | `.ig-orbit` | iconList |
| weave | circles (`x, y, r, color, label`) and members (`x, y`, big) | `.ig-weave` | stats |

## 4. How I'll create assets for the library (the pipeline)
Each new element or kind comes out of this design system as one bundle, and every bundle has the same five parts. The code agent can rely on getting these, every time:

1. **Token-only CSS** in `tokens/infographics.css` (or a sibling file). It references roles only (`--ig-*` / `--th-*`) and contains no raw brand values outside the theme scope blocks. Reduced-motion rules are included.
2. **Reference markup**, produced by a renderer in `assets/infographics/` from a JSON object. That markup is the contract for the server component.
3. **Schema and example props:**
   - A JSON example in the card. It is the source for `defineBlock({ schema, example })`.
   - The item shape and envelope keys are listed in this README.
   - Nullable numbers are always allowed.
4. **Manifest entry** in `theme-pack.json`:
   - `variants`: maps the variant name to its class.
   - `pack`: item id, kind, class or asset, and **fallback**.
   - `presets`: any starting points it belongs to.
5. **Preview and review:** a tile in `guidelines/cards/infographics.html`, shown on both Stage and Commons. The insert panel renders its own previews from `example`, so it doesn't need image thumbnails.

Rules every asset follows:
- **Roles, not values:** an element never hard-codes a theme colour. Theme-specific looks go into the manifest's variant map.
- **Fallback required:** every theme-pack item names a fallback element, or `null` for pure ornament.
- **Truthful by construction:** numbers are nullable, there's always a source line, and there's always a text version. Starting points ship with empty numbers.
- **Server-renderable:** CSS and SVG only. Animation is decorative and stops under `prefers-reduced-motion`. No data is ever computed in the browser.
- **Icons come from the sprite:** `assets/icons/frequency-icons.svg` has 76 symbols, including `house-01` to `house-12`. Reference them by id.

## 5. Acceptance probes, mapped to the L3 "Done when"
- Every kind renders from schema-valid JSON under Default, Bold and Frequency with no client JS. The reference markup diffs cleanly against the server output.
- A JSON with any null number shows the "needs a number" pill and blocks publish.
- Switching a page to a theme without the Frequency pack swaps streak-arc, podium, orbit and weave to their fallbacks, and the editor lists them.
- Every figure has `describe` text and a data table.

## Files
| File | What it is |
|---|---|
| `tokens/infographics.css` | All infographic CSS: primitives, the 10 kinds, smart elements. Imported by `styles.css`. |
| `assets/infographics/ig-kinds.js` | Reference renderer for the 10 kinds, from the proposal's data model. |
| `assets/infographics/ig.js` | Reference renderer for the smart elements (streak, chain, stack with D/W/M/Y, bars, spark, heat, count-up). |
| `assets/infographics/theme-pack.json` | The Frequency platform theme manifest. |
| `guidelines/element-library.md` | The mapping notes: our pieces against the proposal's five kinds, plus the decisions. |
| `guidelines/cards/infographics.html` | Live reference for everything above. |
| `styles.css`, `tokens/`, `assets/icons/` | The core the pieces read from. |
