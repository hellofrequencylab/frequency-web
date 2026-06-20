# Marketing element style guide

The living reference for the public site. The kit (`components/marketing/marketing-ui.tsx`)
is the code source of truth; this doc is the **voice + usage** layer we expand over time.
Add new patterns here as they emerge, one example per element.

## 1. Voice

- **Felt, not stated.** Sensory and concrete over abstract. Make the reader feel the room,
  the faces, the momentum. Short declaratives; let one image carry a paragraph.
- **The third-place worldview.** Warm, human, a little reverent. Never corporate, never hype.
- **No em dashes** anywhere (use commas, colons, periods). Accent **one** keyword per heading
  in `text-primary`.
- **Register shifts by pillar** (this is the heart of the rework):
  | Pillar | Subject | Write into the feeling of… |
  |---|---|---|
  | **The Lab** | the *space* | the body: heat then cold, steam, cedar, low amber light, the exhale, a settled nervous system |
  | **The Community** | the *people* | belonging: faces that light up, being known by name, missed when you are gone |
  | **The Quest** | the *program* | meaning + momentum: the satisfaction of showing up, becoming someone your people count on |

## 2. Type scale

| Use | Classes |
|---|---|
| Eyebrow | `text-sm font-bold uppercase tracking-[0.25em]` · `text-primary-strong` (light) / `text-primary` (ink) |
| Hero H1 | `font-display uppercase` · `text-6xl sm:text-7xl lg:text-8xl` (home/screen) / `text-5xl sm:text-6xl lg:text-7xl` |
| Section H2 | `font-display uppercase text-4xl sm:text-5xl` |
| Statement / PullQuote | `font-display uppercase` · `text-4xl sm:text-5xl lg:text-6xl` / `text-3xl sm:text-4xl lg:text-5xl` |
| Kicker | `text-xl italic text-muted` |
| Lead | `text-xl text-text/85 leading-relaxed` |
| Body | `text-lg leading-relaxed` · `text-muted` (light) / `text-on-ink-muted` (ink) |

## 3. Color & tone

- **Primary (amber)** = the single accent: CTAs, the one highlighted keyword, eyebrows.
- **Surfaces**, alternated for rhythm: `bg-surface` (white) → `bg-marketing-canvas` (warm cream) →
  `bg-slat` (ink, `text-on-ink`). Ink bands are *punctuation*, not the main body.
- One accent per heading. Don't stack colors.

## 4. Spacing & rhythm

- Section padding: **`py-20 sm:py-24`** everywhere (one rhythm).
- Widths: **`max-w-4xl`** (ZigZag, grids), **`max-w-3xl`** (`Section`/`Statement`/`PullQuote`),
  body text capped at **`max-w-prose`**. Full-bleed reserved for heroes + ink bands.

## 5. Images

- **Aspects:** `landscape` 4/3 (default), `portrait` 4/5 (people, rooms with height), `square` 1/1,
  `natural` (uncropped, for wide group shots). Set via `ZigZag imgAspect`.
- **Re-crop with focal, never by stretching:** `imgPosition` (`top|center|bottom|left|right`) on
  `ZigZag`, `focal` on `PhotoHero` (`object-*`). Keep faces and the subject in frame.
- **Frame:** `rounded-2xl`, hairline border, `shadow-md` (light) / `shadow-pop` (ink). Portrait/square
  images are width-capped (`max-w-sm`) so they don't tower over the text column.
- One hero photo per page; ZigZag images alternate sides (`reverse`).

## 6. Components: when to use

`PhotoHero` (hero on imagery) · `Section` (a content band) · `SectionHeading` (eyebrow + H2 + kicker) ·
`Lead`/`Body` (intro / paragraph) · `ZigZag` (image+text beat, the workhorse) · `Statement` (full-width
display interstitial) · `PullQuote` (oversized quote + attribution) · `Steps` (numbered 3-up) ·
`Card` (`soft|feature|elevated`, the one surface card) · `Stat` (big display number) · `Marquee`
(rhythm ticker band) · `PillarNav` (the 1·2·3 cross-link on pillar pages) · `BetaCTA` (the one closing
CTA) · `Button` (the one embossed CTA button) · `Faq`/`FaqList`.

## 7. The page spine

Every page reads as one arc:

> **PhotoHero** → **Lead** (the premise, one breath) → alternating **ZigZag** beats (rising) →
> a **Card** grid or **Stat** row (proof / what-you-get) → an ink **Statement** band (the turn) →
> **PillarNav** (pillar pages) → **BetaCTA**.

Rules: every section carries an eyebrow; one primary-accented keyword per heading; alternate
surface/canvas tones; end on `BetaCTA`. When a page feels thin, add a beat (a sensory ZigZag, a
Stat row, or a PullQuote) rather than padding existing copy.
