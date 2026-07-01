# The Loom design language — the "induction vibe"

> The reference aesthetic for everything Vera draws in The Loom. Distilled from the beta-induction
> product-screen renders (`components/onboarding/renders/*`, ADR-068) — the flat, warm, filled look
> the owner wants as the base for all new icons and graphics. This spec is the source; it is wired
> into Vera's generation + redraw prompts (`app/(main)/admin/library/vera-actions.ts`). It does NOT
> restyle existing art — it steers new output.

## The feel, in one line

Flat, warm, **filled** shapes (not thin line-art) in the DAWN palette — a calm, rounded, product-UI
feel, like a friendly app screen.

## Principles

1. **Filled, not outlined.** Build from solid filled shapes with soft rounded corners. Line-art is a
   supporting accent (a check, a motion line), never the whole drawing.
2. **Warm palette, amber-led.** Amber `primary` is the hero; teal `signal` is the accent; faint
   `primary-bg` washes and `surface` cards carry the warmth; `border` / `border-strong` are the only
   outlines. Never a hex — DAWN token classes only.
3. **Calm + generous.** Big rounded corners (rx 10–22), roomy spacing, one clear focal point, subtle
   opacity layering (0.4–0.6) for depth. A handful of clean shapes, never busy.
4. **Show the surface.** When depicting an app/product moment, frame it as a **screen or card** with
   faint inner cards inside — the induction's signature move.

## Palette (safe fill/stroke tokens)

| Role | Tokens |
|---|---|
| Hero | `fill-primary`, `fill-primary-strong` |
| Warm wash / card fill | `fill-primary-bg`, `fill-surface`, `fill-surface-elevated` |
| Accent | `fill-signal`, `fill-signal-bg` |
| Outlines | `stroke-border`, `stroke-border-strong` |
| On-color text/marks | `fill-on-primary`, `fill-on-signal` |

## Building blocks (the motifs)

- **Screen / window** — a rounded rect `fill-surface stroke-border-strong` with a slim header band
  (`fill-primary` or `fill-primary-bg`); optional three dots for browser chrome. The container for a
  product moment.
- **Warm inner card** — `<rect rx="12" class="fill-primary-bg"/>` (or `fill-surface stroke-border`)
  as the content block inside a screen.
- **Avatar dot** — a filled `circle` in `fill-primary` (or `fill-primary-bg` for a muted one).
- **Pill / chip** — a rounded rect `fill-primary` with an `fill-on-primary` mark (a "Joined" / count
  chip).
- **Placeholder line** — a low-opacity `fill-border-strong` rounded rect (a text stand-in).
- **Check** — `stroke-on-signal` tick on a filled `signal` chip = done/confirmed.

## Do / don't

- ✅ Flat filled shapes · warm amber-led palette · rounded corners · a clear focal point · token
  classes only.
- ❌ Thin line-art-only drawings · hexes/inline colors · gradients, shadows, 3D · clutter ·
  photorealism · faces/fingers/realistic anatomy on figures (keep figures minimal — recognizable by
  pose, per the kit rules).

## Note on text

The induction renders use SVG `<text>` for labels. Vera's Loom output must NOT use `<text>` (the
allowlist sanitizer forbids it) — convey structure with shapes and placeholder bars instead. The
surrounding UI carries the words.
