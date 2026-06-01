# Splash redesign brief (Figma handoff)

Everything a designer needs to redesign the public/marketing pages so the result
drops straight into the code with little or no new development. Pairs with
[`DESIGN.md`](DESIGN.md) (brand direction) and [`PAGE-EDITOR-SPEC.md`](PAGE-EDITOR-SPEC.md)
(the WYSIWYG system).

## The one rule that makes this easy

The public pages are rendered by a **Puck WYSIWYG editor from a fixed block
catalog** (`lib/page-editor/config.tsx`). A non-developer composes a page by
stacking blocks and filling their fields. So:

- **Design as blocks.** If a screen is built from the existing blocks below, it is
  buildable in the editor with **zero dev work** (just content + field values).
- **New visual patterns = new dev.** Anything that is not an existing block (an
  FAQ accordion, a testimonial slider, a pricing table) needs a developer to build
  the React component and register it in the Puck config first. Call these out
  explicitly so we can scope them.
- **Stay on the tokens.** Colors, fonts, spacing, radii, and shadows are all
  tokenized. Designs that use off-token colors or arbitrary fonts cannot be built
  faithfully. Design from the palette below.

## Scope: the surfaces to redesign

| Surface | Route | Rendered by | Notes |
|---|---|---|---|
| Home / splash | `/` | Puck (published) or a hardcoded fallback | The flagship. Hero-led. |
| About | `/(marketing)/about` | hardcoded marketing primitives | |
| How it works | `/(marketing)/how-it-works` | hardcoded | |
| The Lab | `/(marketing)/the-lab` | hardcoded | |
| Beta / join | `/(marketing)/beta` | form page | Lead capture (name + email). |
| Discover | `/discover` | public SEO read-only | Logged-out discovery; lower priority. |

Shared chrome (design once, applies to all): **MarketingHeader** (transparent
over a dark hero, flips to a solid light bar on scroll) and **MarketingFooter**.

Out of scope: the signed-in product (`/feed`, `/circles`, etc.) is a separate,
lighter design language (DAWN app surfaces). This brief is marketing only.

## Design tokens

### Color (semantic; design in these names, not hex)
Light mode is the default; **dark mode is real** (`.dark`), so provide both or
specify which sections invert.

| Token | Light | Dark | Use |
|---|---|---|---|
| `canvas` | `#FBFAF6` | `#16130E` | app background |
| `marketing-canvas` | `#F7F3EA` (warm sand) | `#16130E` | public page background |
| `surface` | `#FFFFFF` | `#1F1B14` | cards / white sections |
| `surface-elevated` | `#FCFAF5` | `#28231A` | raised cards |
| `border` / `border-strong` | `#E9E1D4` / `#D8CDBB` | `#372F22` / `#4A4030` | hairlines |
| `text` / `muted` / `subtle` | `#1E1A13` / `#6B6253` / `#8F8675` | `#EFE8DB` / `#A99C88` / `#7E735F` | copy hierarchy |
| `primary` (amber) | `#E2912F` | `#F2B14E` | brand accent, CTAs |
| `primary-hover` / `primary-strong` / `primary-bg` | `#CE8023` / `#9A5E12` / `#FBEFD9` | (dark variants exist) | CTA states, accent wash |
| `on-primary` | `#2A1B06` | `#2A1B06` | text on amber |
| `signal` (teal) | `#1E9E89` | `#5FD3BE` | secondary accent |
| success / warning / danger / info | (+ `-bg`) | (+ `-bg`) | states |

Plus a 10-color **rank spectrum** (stone, clay, gold, olive, jade, teal, slate,
indigo, plum, rose) used for gamification badges, mostly in-app.

### Type
- **Display:** **Anton** (`.font-display`), single weight 400, **UPPERCASE**,
  tracking `0.012em`, line-height `1.0`. Marketing headlines only. Fills width,
  editorial.
- **Body / UI:** **Nunito** (400 to 900). All copy, buttons, labels. Headings
  render at weight 800, line-height 1.2, tracking `-0.01em`.
- **Mono:** Geist Mono (rare, code/labels).
- Constraint: **only these three faces.** A redesign that needs another font means
  loading a new web font (flag it; it is a cost/perf decision).

### Spacing, radii, shadows, breakpoints
- **Vertical rhythm** is tokenized per block (see Layout controls): none, xs, sm,
  md, lg, xl. Do not spec arbitrary pixel gaps between sections; map to these.
- **Radii:** sharp (`0`), rounded (`rounded-xl` 0.75rem), more (`rounded-2xl` 1rem),
  pill (`rounded-3xl` 1.5rem), circle (`full`).
- **Shadows:** warm-tinted, soft and diffused (near-espresso, low alpha, wide
  blur) - not crisp black boxes. Four steps: subtle / sm / md / strong(xl).
- **Breakpoints (Tailwind):** sm 640, **md 768 (the key mobile/desktop split)**,
  lg 1024, xl 1280. Design frames at **1440, 768, 375**.
- **Focus ring:** 3px amber ring at 45% on every interactive element (do not remove).
- **Reduced motion:** the marquee and any animation must no-op under
  `prefers-reduced-motion`.

Source photography lives in `public/images/site/` (e.g. `lab-thermal.jpg`,
`community-1.jpg`, `moonlight-1/2.jpg`, `lab-storefront.jpg`) - match its warm,
real, candid direction.

## The block catalog (the WYSIWYG palette)

Every block also has **Layout** controls (below). Design screens as a stack of these.

| Block | Purpose | Key fields the designer sets |
|---|---|---|
| **Splash hero (full-bleed)** | The big dark-image hero | eyebrow, title (+ one accent word in amber), subtitle, background image, primary + secondary CTA (label + link), small note |
| **Page hero** | Lighter top-of-page hero (no bg image) | eyebrow, title (+ accent), subtitle |
| **Image + text (ZigZag)** | Alternating photo/copy row | image, alt, eyebrow, title (+ accent), italic kicker, body (markdown: bold/italic/link), image side (L/R), tone (white/cream), crop ratio, focal point, optional CTA |
| **Big statement** | Full-width typographic interstitial | text (+ accent word), tone |
| **Feature gallery** | Grid of image tiles | eyebrow, heading, items (image+title+body), columns (2/3/4), tile crop, radius |
| **"What we're building" band (Pillars)** | Marquee + alternating pillar rows | marquee items, pillars (image+title+body+link+side) |
| **Full-width image (ImageBand)** | Banner image | image, alt, crop ratio, focal, width, radius, shadow |
| **Scrolling marquee** | Looping word strip on dark | items[] |
| **Beta CTA** | Conversion block | heading (+ accent), body |
| **Live stats** | Real members/circles/events counts | eyebrow, heading (data is live) |
| **Live upcoming events** | Real event list | (data is live) |
| **Live community posts** | Real recent posts | heading (data is live) |
| **Text** | Rich paragraph | body (markdown), align (L/center), size (sm/base/lg) |
| **Columns** | 2 or 3 column layout holding other blocks | count, gap, vertical align, tone, + nested blocks per column |
| **Spacer** | Vertical gap | small / medium / large |

Notes for the designer:
- **Accent word:** most headline blocks color ONE word in amber. Specify which.
- **Tone** toggles a section between **white** (`surface`) and **cream**
  (`marketing-canvas`). Use it to rhythm the page; design alternating tones.
- **Live blocks** pull real data (member counts, events, posts) - design the
  layout and the empty/loading state, but the content is dynamic.
- **Columns** is the only nesting container - other blocks drop into its columns.

### Image controls (per image-bearing block)
- **Crop ratio:** natural (uncropped), 21:9, 16:9, 3:2, 4:3, 1:1, 4:5.
- **Focal point:** center / top / bottom / left / right (which part stays in frame
  when cropped). Specify per image.
- **Width cap:** small (max-w-sm) / medium (xl) / large (3xl) / xl (5xl) / full.
- **Corners:** sharp / rounded / more / pill / circle. **Shadow:** none / subtle / medium / strong.
- All images are auto-optimized to AVIF/WebP with responsive sizing. **Provide
  source assets at ~2x the largest container** (xl width = 1024px on screen, so
  export ~2048px wide) and state the focal intent.

### Layout controls (on every block)
- **Space above / Space below:** none, xs, sm, md, lg, xl (responsive). Spec the
  rhythm with these tokens, not pixels.
- **Show on:** Everywhere / Desktop only / Mobile only - lets you ship a different
  block on mobile vs desktop without a developer.

## Easy vs needs-dev (so you can scope)

- **Zero dev (editor only):** recompose/reorder existing blocks, new copy, new
  photos, accent words, CTA targets, tone alternation, spacing tokens, mobile vs
  desktop block swaps.
- **Some dev (build + register a block):** any new section pattern not in the
  catalog (testimonials, FAQ accordion, pricing/tier table, logo wall, stats
  counters with animation, video embed). Design it, annotate its props, we build
  the component and add it to the Puck config.
- **Avoid:** off-token colors, fonts other than Anton/Nunito/mono, one-off layouts
  that will not generalize into a block, removing the header-over-hero behavior or
  the focus ring.

## What to deliver from Figma (clean handoff)

1. **A token library that mirrors this doc:** color styles named to the semantic
   tokens (`primary`, `marketing-canvas`, `text`, `muted`, ...), text styles for
   the Anton display scale + Nunito scale, effect styles for the 4 shadows. This
   1:1 naming is the single biggest accelerator.
2. **A component set that mirrors the block catalog:** one Figma component per Puck
   block, with the same field names as variants/props. Designers then "build"
   pages by composing these, exactly as the editor does.
3. **Each screen at 1440 / 768 / 375**, annotated with: which block each section
   is, and the field values (tone, spacing token, crop ratio, focal point, accent
   word, CTA link).
4. **Both light and dark** for any section that should invert (or state "light
   only").
5. **Image exports** at ~2x with focal-point intent noted.
6. **New-block specs** (if any) on their own page, flagged "needs dev," with props.
7. **Accessibility notes:** contrast on dark-hero text, focus state, reduced-motion
   behavior for anything animated.

Hand that back and most of it is a content-entry job in the editor; the rest is a
small, well-scoped list of new blocks to build.
