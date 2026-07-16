# Email Block Editor — Settings & Blocks Plan

**Status:** ✅ Built. Owner directive captured 2026-07-12; shipped since. The Features block carries
an `eyebrow` and no images, the Card grid renders images + stat boxes (a big number + label), the
icon token resolves as a Lucide site-icon or emoji (`lib/entity-blocks/icon-tokens.ts`,
`isLucideIconName`), and the data-bound `productCard` block ships alongside (Phase 4 / ADR-613). All
render in `lib/email-studio/render.ts`; the block schema lives in `lib/entity-blocks/block-content.ts`
and the on-canvas editable slots in `components/admin/email-studio/canvas/`. The work items below are
kept for provenance; the segmented-control fit tweaks (#5–7) are the residual polish.
**Scope:** the on-canvas WYSIWYG email editor (`blocksForKind('email')`) — Features, Card grid,
Icon picker, and the Image / Callout / Banner setting controls.

## The answer up front

Keep **both** the Features block and the Card grid block, but make them look and do clearly
different things:

- **Features** = a text-forward list. Gets an **eyebrow**, an icon per item, and its own layout
  options. **No images.**
- **Card grid** = a visual/data block. Gets **images** and **stat boxes** (a number + label) or
  similar richer card content.

Plus: the icon box becomes a real **picker with search** (site icons + emoji), the Image / Callout /
Banner **segmented controls fit their box**, and **all text editing happens on the canvas**, never in
the left rail.

## Where it lives (file map)

| Concern | File |
| --- | --- |
| Block schema (field types, per-block fields, `sanitizeFeature`, text roles) | `lib/entity-blocks/block-content.ts` |
| Left-rail editors (`FeaturesEditor`, segmented dispatch) | `components/entity-blocks/block-edit-panel.tsx` |
| Segmented control + labelled row | `components/entity-blocks/controls/field-controls.tsx` |
| Canvas render (`features` / `cards` / `image` / `callout` cases) | `components/entity-blocks/content-block-view.tsx` |
| On-canvas WYSIWYG slots | `components/admin/email-studio/email-canvas-editor.tsx`, `components/admin/email-studio/canvas/canvas-block.tsx` |
| Email HTML render | `lib/email-studio/*` |
| Palette (which blocks show for `email`) | `lib/entity-blocks/registry.ts` |

## Work items

| # | Item | What it takes | Risk |
| --- | --- | --- | --- |
| 1 | **Text edits only on-canvas** | Move Features title/body/eyebrow (and Card grid text) out of the left-rail textareas into on-canvas `EditableSlot`s, per array item. Left rail keeps only non-text controls. | Med-High — per-array-item editable slots wired to nested item text |
| 2 | **Features: add an eyebrow + distinct options, NO images** | Add an `eyebrow` field to the Features block; give it its own layout options (e.g. list vs 2-up, alignment) so it reads differently from Card grid. Explicitly no image field. Icon + eyebrow + title + body. | Med |
| 3 | **Card grid: images + stat boxes** | Card grid items get an `image` and/or a `stat` (a big number + a label) so a card can be a photo card or a metric/stat box. This is the "cards like classifieds / something clever" path — it lives here, not in Features. | Med-High |
| 4 | **Icon picker = site icons + emoji, both searchable** | Replace the plain "Icon or emoji" text box with a popover picker offering two searchable sources: a Lucide **site-icon** search and an **emoji** search. Stores the same short token the renderer already reads (Lucide name or emoji). | Med |
| 5 | **Image SHAPE selector fits** | The segmented options ("Vertical") clip because the label eats the row width and the container is `overflow-hidden`. Stack the label above + give the segmented full width / allow wrap. | Low |
| 6 | **Callout image SHAPE fits** | Same fix as #5 for the Callout block. | Low |
| 7 | **Banner admin box fits** | Same fix for Banner's CONTENT (Over / Beside / Below photo) + HEIGHT rows. | Low |

Items 5/6/7 are one shared low-risk layout change to the labelled segmented row (`field-controls.tsx`).

## Block specs (target)

### Features (text-forward, no images)
- Fields: `eyebrow` (short text), `items[]` of `{ icon, title, text }` (+ optional `link` / `button`
  — see open questions), plus a layout option (list / 2-up) and alignment.
- Icon uses the new searchable picker (#4).
- All text on canvas (#1).

### Card grid (visual / data)
- Fields: `items[]` of `{ image?, stat?: { value, label }, title, text, link?, button? }`.
- A card renders as either a photo card (image on top) or a stat box (big number + label), styled
  distinctly from Features.
- Whole-card link + optional button (see open questions).

## Open decisions (resolve before/at build)

- **Features actions:** do Features items keep an optional per-item link/button, or stay pure
  text+icon? (Card grid owns the rich link/button/card behavior.)
- **Card grid card model:** image OR stat per card, or both allowed on one card? Fixed columns
  (2/3-up) or responsive?
- **Card link + button:** whole-card link AND a separate button with its own label/link, or just one?
- **Icon picker source:** which Lucide subset to expose in search (all vs a curated set), and emoji
  data source (a small bundled set vs a fuller list).

## Undone / carried over

- Nothing from the merged listing work is outstanding; this doc is the backlog for the **email editor**
  only. Everything above is TODO for the next session (owner will action).
- Voice + tokens: all new copy runs the CONTENT-VOICE §10 checklist (no em/en dashes); DAWN tokens
  only, no hex (email inline hex is the standing exception).
