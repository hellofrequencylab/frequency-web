# UI Kit — Marketing site (the public splash)

A high-fidelity recreation of Frequency's public marketing landing page, built
to the editorial blueprint in `docs/DESIGN-LANGUAGE.md`. It is the "warm
editorial" half of the brand: a calm magazine spread on a warm cream/ink palette
where **type and image do the work**.

## Run it
Open `index.html`. It loads the DAWN bundle (`../../_ds_bundle.js`) + Lucide and
renders an interactive single-page splash. Click **Join the Beta** anywhere to
enter the cinematic Oath induction; take the oath to see the Founder welcome.

## What's here
- **`header.jsx`** — `MarketingHeader`: engraved wordmark, flat site tabs + a
  Discover affordance, amber "Join the Beta" CTA. Transparent over the hero.
- **`hero.jsx`** — `PhotoHero`: the one full-bleed splash hero (ink wash + amber
  glow over real photography, Anton H1, dual CTA, trust line, scroll cue, the
  light-strip seam).
- **`sections.jsx`** — the content beats, all on the shared vertical rhythm:
  `PillarGrid` (Lab/Community/Quest), `ZigZag` (alternating image+text),
  `Statement` (the cinematic dark interstitial, seamed top+bottom), `StatStrip`,
  `FaqList`, `BetaCTA` (the closing dark beat).
- **`footer.jsx`** — `MarketingFooter`: quiet warm footer.
- **`beta.jsx`** — `BetaOath`: the founding-cohort induction (3-checkbox gate →
  Founder welcome).

## Page heartbeat (the blueprint)
Hero → orient (pillars) → ZigZag story → **dark Statement (beat 1)** → ZigZag →
proof (StatStrip) → FAQ → **BetaCTA (dark beat 2 / close)** → footer. Light↔dark
is a *rhythm*: exactly two ink beats, each seamed with a `light-strip`.

## Rules it follows
- Amber is the only chrome accent; no green anywhere on the public site.
- One hero, one section rhythm, one card. Headings route through `SectionHeading`.
- Copy is "felt, not stated" — no em dashes, accent one keyword per heading,
  honest founding-stage framing (no fabricated counts).

## Composed from
DAWN primitives: `Button`, `SectionHeading`, `Card`, `Stat`. Layout sections
(hero, zigzag, statement, betaCTA) are kit-local compositions of the brand
motifs (`bg-slat`, `light-strip`, `amber-glow`).

> Recreation, not redesign. Mirrors `components/marketing/marketing-ui.tsx` and
> `app/page.tsx` in `hellofrequencylab/frequency-web`.
