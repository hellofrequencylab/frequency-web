# Design direction: warm editorial community

The look and feel brief for Frequency. Names the style, diagnoses what felt "templated,"
sets the principles + token spec, and answers the design-stack question. Pairs with the
DAWN token system in `app/globals.css` and the component conventions in
[ARCHITECTURE.md](ARCHITECTURE.md). Living doc.

## The style, in a sentence

**Warm editorial community.** Calm, magazine-like layouts on a warm cream canvas, where
**type and space carry the personality** and **content sits openly** rather than inside a
grid of identical bordered boxes. Friendly, human, unmistakably not a SaaS admin template.

## Why it felt like a template (the diagnosis)

It was never the palette or the font. The DAWN palette is already warm (cream `#FBFAF6`
canvas, amber primary, warm-beige borders) and the body face is Nunito (rounded, friendly).
The "template" signal came from three habits, all fixable:

1. **Everything in an identical bordered card.** A 1px border + flat `shadow-sm` + the same
   radius on every block (worst in the right rail, five identical boxes stacked) reads as a
   generic dashboard. Uniform boxes = no authored hierarchy.
2. **Type too small and unexpressive.** Components lean on `text-sm` / `text-xs` /
   `text-[11px]`, and section headers were tiny gray uppercase micro-labels. Nothing felt
   like a heading you'd see in print.
3. **Flat, hard elevation.** Crisp pure-black `shadow-sm` gives a sharp box edge instead of
   gentle, warm depth.

## Principles

1. **Type is the hero.** Larger base, expressive headings, generous line-height. Let
   headings be confident and content be comfortably readable.
2. **Group, don't box.** Reserve the elevated card for genuinely distinct *objects* (a
   circle, an event). For lists and rail sections, group with a clear title + spacing (and
   at most a hairline divider or a soft, borderless surface), not a bordered box each.
3. **Warm, soft depth.** Diffused, warm-tinted shadows over hard borders. Borders, when
   used, are hairline and warm.
4. **Editorial hierarchy / bento.** A few large anchor areas, supporting detail quieter
   around them. Density is fine when the hierarchy is right; never a wall of equal weight.
5. **Human touches.** Real photography of gatherings, the occasional hand-feel accent, so
   it reads as made, not generated.

## Token spec

Palette (already warm, keep): cream canvas, white surface, warm-beige borders, near-black
warm ink, amber primary, teal signal. Dark mode mirrors it on espresso.

Changed in this pass (`app/globals.css`):

- **Soft warm elevation.** Overrode Tailwind's hard pure-black shadow defaults
  (`--shadow-2xs` ... `--shadow-xl`) with diffused, warm-tinted shadows (near-espresso, low
  alpha, wide blur). Every `shadow-*` in the app softens at once.
- **Base size +6%.** Root font-size 16 to 17px, so all rem-based type + spacing lift gently
  and uniformly ("a little larger and more inviting"). One-line revert if anything tight
  overflows.

Still to do (needs eyeballing, see Next):

- **Type scale.** Establish a deliberate scale and migrate the tiny fixed-px sizes
  (`text-[10px]/[11px]`, heavy `text-xs`) up. Fixed-px sizes do NOT scale with the root
  bump, so the rail still needs a manual pass.
- **A characterful header face.** Consider a warm serif (e.g. Fraunces) or soft display for
  in-app section/hero headings, paired with Nunito body, for real editorial warmth. Anton
  stays the marketing headline face (it is bold/striking, not "warm," so not for in-app body
  hierarchy).
- **Radius consistency.** Standardize on a small set (e.g. `rounded-xl` for cards,
  `rounded-lg` for controls, `rounded-full` for pills).

## The card to editorial-grouping pattern

The single highest-impact move. Before: every right-rail widget in a `border + shadow-sm`
box with a tiny uppercase gray title. After (done for `ModuleCard`): **borderless**, soft
shadow, **larger sentence-case bold title**. Next, push further where it helps: some rail
sections need no card at all, just a strong title + a hairline divider on the canvas.

Rule of thumb: **a card means "this is a distinct object."** If it's just a grouped list,
title + spacing beats a box.

## Design stack: expansion + speed (your question)

Short answer: **you are already on the best-practice stack; the lever is discipline, not a
new system.** Adding a UI framework would cost speed and lock-in, the opposite of the goal
(this matches [SCALE-ARCHITECTURE](SCALE-ARCHITECTURE.md): adopt seams, not frameworks).

What you already have, and why it is right:

- **Tailwind v4 (CSS-first).** Near-zero runtime, no CSS-in-JS, compiles to static CSS. Fast
  by construction. Keep it.
- **Semantic design tokens (DAWN).** Raw hex lives in one file; components use semantic
  utilities (`bg-surface`, `text-muted`). This *is* the expansion lever: theming, white-label
  per-Nexus, and dark mode are nearly free because nothing hardcodes a color.
- **`next/font` self-hosted.** No layout shift, no external font request. Keep.
- **Owned, shadcn-style components** (copied in, built on Radix primitives for a11y). You own
  the code, no library churn.

For future expansion specifically:

- **W3C Design Tokens + Style Dictionary** (only when mobile lands, Stage 5): export the same
  DAWN tokens to React Native / Expo so web and mobile share one source of truth. Adopt the
  *posture* now (semantic tokens, which you have); add the export pipeline when needed.
- **View Transitions API** (Baseline 2025): smooth navigation/polish with no JS framework,
  framework-portable. A cheap way to feel premium later.

Avoid: runtime CSS-in-JS (Styled Components / Emotion), heavy component kits (MUI, Chakra),
or a new meta-framework. All slower and more locked-in than what you run today.

## What changed in this pass

- `globals.css`: soft warm shadow tokens; base font-size 16 to 17px.
- `components/modules/module-card.tsx`: borderless, soft-shadow, larger sentence-case title
  (fixes the right-rail "stacked boxes" feel).

## Next (eyeball + iterate in `npm run dev`)

1. Type-scale pass on the right rail and dense lists (lift the fixed-px sizes).
2. Trial a warm serif/display for in-app headings.
3. Reduce remaining bordered boxes on the main surfaces to grouped/editorial where they are
   lists, not objects.
4. A real visual designer (or a tool) for logo + brand marks (out of scope for code).

## Sources

UI/typography direction drawn from 2026 trend research:
[envato](https://elements.envato.com/learn/ux-ui-design-trends),
[uxdesign.cc](https://uxdesign.cc/the-most-popular-experience-design-trends-of-2026-3ca85c8a3e3d),
[Tubik](https://blog.tubikstudio.com/ui-design-trends-2026/),
[Fontfabric](https://www.fontfabric.com/blog/10-design-trends-shaping-the-visual-typographic-landscape-in-2026/),
[MyDesigner](https://mydesigner.gg/blog/dense-interfaces-information-hierarchy-2026),
[Mighty Networks community trends](https://www.mightynetworks.com/resources/best-community-app).
