# Frequency: Design Language & Page-Flow Blueprint

*Design Director audit + unification spec. Built ON the existing DAWN tokens + editorial/ink/photo-hero layer. Nothing here throws the system out. It codifies it and removes the drift.*

---

## Executive summary (~12 lines)

1. The bones are good. DAWN gives you a real semantic token system, the Anton `font-display` editorial face is distinctive, and the warm ink↔light contrast (bg-slat, light-strip, amber-glow) is a genuine signature. The problem is **not** the language. It's that the kit and the pages drifted apart.
2. The single biggest defect: **two identical heroes** (`PhotoHero` in marketing-ui, `DiscoverHero` in cards.tsx) and **two `SectionHeading`s** with different APIs. Same pixels, forked code.
3. **Vertical rhythm is improvised per page.** `Section` defaults to `py-20 sm:py-24`, but pages hand-pass `py-16 sm:py-20`, `py-16`, and a wild zoo of `pt-4 pb-20`, `pt-20 pb-10` overrides. There is no rhythm scale, so the site breathes unevenly.
4. **Container widths are inconsistent for the same job.** Marketing content lives at `max-w-3xl`; Discover index sections use raw `max-w-6xl`/`max-w-2xl` bare `<section>`s that bypass `Section` entirely.
5. **Discover is a second design system pretending to be the first.** It hand-rolls `<section className="bg-... px-6 py-16">` everywhere instead of using `Section`, uses a `py-16` rhythm the marketing pages never use, and introduces a `success`/green tone the rest of the site doesn't.
6. **Eyebrow color is a coin-flip:** `text-primary` (on dark), `text-primary-strong` (on light), correct, but the home page hero uses a different tracking (`0.3em` vs the standard `0.25em`) and the rules aren't written down.
7. **Cards have ~5 radii and 2 elevations for the same role:** `rounded-2xl` vs `rounded-3xl`, `shadow-sm` vs `shadow-md` vs `shadow-2xl` vs hover-`shadow-pop`, chosen ad hoc.
8. **Buttons are re-declared inline on every page** (primary pill `rounded-2xl bg-primary…`, ghost-on-dark, outline-on-light) with px/py that wobble (`py-3` vs `py-3.5` vs `py-4`). No Button component exists.
9. **Stat rows, FAQ accordions, and step cards are re-implemented per page** with slightly different markup each time (home `Faq` uses `ChevronDown`; pricing `Faq` uses a `+` rotation).
10. The home splash hero is a **bespoke background-image hero** that duplicates `PhotoHero`'s wash/glow/strip by hand instead of using the component.
11. Fix is mostly **consolidation, not redesign**: merge the dupes, publish a rhythm + width + radius + button scale, and route every page through `Section`/`PageHero`/`PhotoHero`.
12. Deliverable below: 6 principles, the codified system, canonical patterns, per-page-type skeletons, and a P0/P1/P2 backlog tied to files.

---

## 1. Design principles (the through-line)

1. **Editorial, not "SaaS landing page."** Heavy Anton display headlines, generous whitespace, photography that carries emotion. Type and image do the work; we avoid gradient-blob/illustration filler. Every page reads like a magazine spread with a purpose.
2. **One warm world, lit from within.** The whole site lives in DAWN's warm sand/ink palette. Amber is the single hero accent (light strips, glows, CTAs); teal/signal is a rare secondary; **green/`success` is in-app status only and must not appear in marketing chrome.** Color = brand, never decoration.
3. **Light and dark are a rhythm, not a theme toggle.** The cinematic `bg-slat` ink band is a *beat* you hit deliberately (typically once mid-page and once at the closing CTA), always seamed with a `light-strip`. Dark is punctuation, not wallpaper.
4. **A predictable cadence.** Every page is a stack of full-bleed sections with a shared vertical rhythm and container width, so a visitor feels the same "heartbeat" on the splash, the story, and the discover index. Surprise comes from content and imagery, never from spacing that jumps around.
5. **The kit is the source of truth.** If a pattern appears twice, it's a component. Pages compose `PhotoHero / PageHero / Section / SectionHeading / ZigZag / Statement / Stat / Card / Button / BetaCTA`. They don't hand-roll `<section>`s, inline buttons, or re-declare card chrome.
6. **Honest, grounded confidence.** Real photos of real gatherings, real counts (gated behind `SOCIAL_PROOF_FLOOR`), plain-spoken copy. The design never oversells; restraint *is* the brand.

---

## 2. The system, codified

### 2.1 Type scale & usage

One face split into two voices: **`font-display`** (Anton, uppercase, tight) for all headlines and big numbers; **`font-sans`** (Nunito) for everything readable.

| Role | Recommended utility | Where | Notes |
|---|---|---|---|
| **Display / page H1** | `font-display uppercase text-5xl sm:text-6xl lg:text-7xl leading-[0.95] text-balance` | PhotoHero / PageHero only | One per page. |
| **Section H2** | `font-display uppercase text-4xl sm:text-5xl` | SectionHeading | The default. |
| **Sub-section / minor H2** | `font-display uppercase text-3xl sm:text-4xl` | live-data sections, founding-cohort card | Add as `SectionHeading size="sm"`. |
| **Card title (display)** | `font-display uppercase text-2xl` | Step/SpaceCard/Tier/RoleNote | Pick ONE (see §3.5). |
| **Card title (sans)** | `text-lg font-bold` | Value/Hold/Assurance/Discover cards | Currently competes with the display variant: consolidate. |
| **Eyebrow** | `text-sm font-bold uppercase tracking-[0.25em]` | all | Color rule in §2.4. **Lock tracking at `0.25em` everywhere** (home hero's `0.3em` is the outlier). |
| **Kicker (italic)** | `text-xl italic text-muted` | SectionHeading kicker | The editorial "deck." |
| **Lead** | `text-xl text-text/85 leading-relaxed` | `Lead` | Intro paragraph. |
| **Body** | `text-lg text-muted leading-relaxed` (`text-base` inside cards) | `Body` / cards | |
| **Big stat number** | `font-display text-6xl sm:text-7xl text-text` | Stat | |
| **Pull-quote** | `font-display uppercase text-3xl sm:text-4xl lg:text-5xl leading-[1.08] text-balance` | new `PullQuote` | Promote about.tsx's inline `<figure>`. |

**Rule:** never set heading sizes ad hoc in a page body. If you need a heading, it comes from `SectionHeading` (with a `size` prop) or `Statement`/`PullQuote`.

### 2.2 Spacing & vertical rhythm

Publish a **named rhythm scale** and stop hand-passing `pad`. Add to globals.css as utilities (or document as the only allowed `pad` values):

| Token | Value | Use |
|---|---|---|
| `--space-section` | `py-20 sm:py-24` | **Default** content section (already `Section`'s default, make it the only one). |
| `--space-section-tight` | `py-14 sm:py-16` | Statement, Marquee bands, banner-adjacent sections. |
| `--space-section-loose` | `py-24 sm:py-32` | Hero-class beats and the dark pillar band. |
| `--space-cta` | `py-24 sm:py-28` | BetaCTA (already standard). |

Retire all the bespoke values currently in the wild: `py-16` (Discover), `py-16 sm:py-20` (Statement/ZigZag defaults, fold into *tight*), `pt-4 pb-20 sm:pb-24`, `pt-20 pb-10`, `pt-24 pb-14`. The `pt-4` overrides exist only to undo a preceding section's padding. Solve that with a `flush` prop (§3.3), not arithmetic.

**Intra-section rhythm (lock these):** eyebrow→H2 `mb-4`; H2→kicker `mt-4`; heading block→content `mb-9` (or `mb-12` when content is a centered grid); grid `gap-5`; paragraph stack `space-y-4`; card internal padding `p-6` (compact) / `p-7` (standard) / `p-8` (feature). See §3.5.

### 2.3 Container widths

One width per job. Today the same job uses different widths across files.

| Width | Use | Owner |
|---|---|---|
| `max-w-3xl` | Reading column: prose sections, FAQ, SectionHeading text | `Section` (already) |
| `max-w-2xl` | Narrow lists: event rows, post previews, CTA copy | `Section size="narrow"` (add) |
| `max-w-4xl` | Hero copy, Statement, PhotoHero copy | hero/Statement (already) |
| `max-w-5xl` | ZigZag two-column, dark pillar band | ZigZag (already) |
| `max-w-6xl` | **Card grids** (3-up topics/circles) | add `Section size="wide"` |

**Rule:** every section's inner wrapper comes from `Section`'s `size` prop. Discover's raw `max-w-6xl`/`max-w-2xl` `<section>`s are the main offenders: route them through `Section`.

### 2.4 Color / tone usage rules

Three surfaces, used as a **deliberate sequence**, never random:

- **`canvas` (`bg-marketing-canvas`, warm sand):** the "outdoor"/connective tone. Default for story/secondary sections. Alternate with `surface`.
- **`surface` (white):** the "indoor"/focus tone. Use for cards-on-canvas and primary content. Alternate with `canvas`.
- **`ink` (`bg-slat`):** the cinematic dark beat. **Max ~1 to 2 per page** (one mid-page Statement/ZigZag, one closing `BetaCTA`). Always bordered by a `light-strip` at the dark↔light seam.

**Accent rules:**
- **Amber/primary is the only chrome accent.** Eyebrows: `text-primary-strong` on light, `text-primary` on dark/photo. CTAs: `bg-primary text-on-primary`. Accent words in Statements/headlines: `text-primary`.
- **Teal/signal** = sparingly, for a "founder/secondary" badge (e.g. pricing Founder tag). Not for general emphasis.
- **`success`/green is in-app only.** Remove it from marketing: Discover's `EventRow` green chip and `SectionHeading tone="success"` should switch to the primary/amber language so the public site reads as one palette.

**Tone never alternates twice the same way:** avoid `canvas → canvas` adjacency (demo.tsx currently runs many `canvas` ZigZags back-to-back, so they blur together). Alternate surface/canvas, punctuated by ink.

### 2.5 Elevation

Collapse to a 3-step ladder; stop mixing scales.

| Token | Use |
|---|---|
| `shadow-sm` | Resting cards on `surface`/`canvas` (the default). |
| `shadow-md` | ZigZag image frames (light tone) and card hover. |
| `shadow-pop` / `shadow-pop-lg` | "Marketing pop": pricing featured tier, splash CTA, hero buttons, demo device frame, image frames on **ink**. |

**Retire** `shadow-xl` and `shadow-2xl` from marketing (home `Pillar` uses `shadow-2xl`; pricing featured uses `shadow-xl`) → use `shadow-pop`/`shadow-pop-lg`. **Hover convention:** cards lift with `hover:shadow-md` (light). Pick one, not the current mix of `hover:shadow-pop`, `hover:shadow-md`, `hover:-translate-y-0.5`, and `hover:border-border-strong`.

### 2.6 Radius

| Radius | Use |
|---|---|
| `rounded-md` | chips, badges, tiny date squares |
| `rounded-2xl` | buttons, inputs, list rows, **small cards** |
| `rounded-3xl` | **feature cards & framed media** (Step, Value, Tier, ZigZag image, callout panels) |

**Rule:** a card is `rounded-2xl` *or* `rounded-3xl` by **role** (small/list vs feature), never by author preference. Today Step cards are `rounded-3xl` on home & how-it-works but Layer/Hold/RoleNote/Assurance are `rounded-2xl` for the same visual weight. Pick per the table and apply consistently.

### 2.7 Motion

- **Allowed, standardized:** `transition-colors` on all interactive elements; `hover:shadow-md` card lift; `.animate-marquee`; `group-open:rotate-*` on accordions; hero `ChevronDown` bounce.
- **Honor `prefers-reduced-motion`** (already done for marquee; extend the discipline to any new transform).
- **Drop the ad-hoc transforms** that only some Discover cards have (`hover:-translate-y-0.5`, `lg:scale-[1.02]`, `lg:-translate-y-3`) unless they're promoted into a shared component variant. Right now they appear on a subset of cards and read as inconsistency.

---

## 3. Canonical component patterns

> One correct way per pattern. **The headline action: merge the duplicates first.**

### 3.0 Duplication to consolidate (do this before anything else)

- **`DiscoverHero` (cards.tsx) ≡ `PhotoHero` (marketing-ui.tsx).** Byte-for-byte the same wash/glow/strip/markup, differing only in copy `max-w-4xl` vs `max-w-5xl`. **Delete `DiscoverHero`; re-export `PhotoHero`** (add a `wide` prop if the 5xl copy width matters). All Discover pages import the one hero.
- **Two `SectionHeading`s** (marketing-ui vs cards.tsx). The cards version adds a `success` tone and drops `kicker`; the marketing version has `kicker`. **Keep the marketing one**, add an optional `tone`/`align` prop, delete the cards copy.
- **The splash hero (page.tsx `LegacySplash`)** hand-builds a background-image hero that re-implements `PhotoHero`. Refactor to a `PhotoHero` variant (`minHeight="screen"`, slot for the trust lines + scroll cue) so there's truly **one hero** on the site.
- **Two `Faq` implementations** (home `ChevronDown`, pricing `+`-rotate) + Discover's bespoke `<dl>` FAQ. Promote **one `Faq`/`FaqList`** to marketing-ui.
- **Stat / EventRow / Step cards** re-declared in page bodies → promote to the kit (§3.6, §3.5).

### 3.1 Page hero: **`PhotoHero`** (the one hero)

Full-bleed image + warm ink wash + `amber-glow` + bottom `light-strip` seam, centered editorial display H1, optional eyebrow/subtitle/children (CTA). Variants: `minHeight="screen"` (splash), `wide` (Discover copy width). **No page builds its own hero.** A text-only variant is `PageHero` (same type/spacing, no image) for utility pages.

### 3.2 Section header: **`SectionHeading`**

`eyebrow` (locked `tracking-[0.25em]`, color by tone) → `font-display uppercase text-4xl sm:text-5xl` H2 → optional italic `kicker`. Props to add: `size?: 'default' | 'sm'` (for the 3xl/4xl sub-headings currently inlined on home/demo/pricing), `align?: 'left' | 'center'`, `tone?: 'light' | 'ink'`. **Every page heading routes through this.**

### 3.3 Content section: **`Section`**

`<section class="px-6 {rhythm} {tone-bg}">` → inner `max-w-* mx-auto`. Props to add: `size?: 'narrow' | 'default' | 'wide'` (→ 2xl/3xl/6xl, §2.3) and `flush?: 'top' | 'bottom' | 'both'` to remove vertical padding at a seam (kills the `pt-4` hacks). `pad` becomes internal-only; pages pass `tone`/`size`/`flush`, not raw padding.

### 3.4 Card grid

`Section size="wide"` → centered `SectionHeading` (`mb-10`/`mb-12`) → `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5` → optional centered "Browse all →" link. This is exactly Discover's topics/circles pattern: make it the canonical grid and have the marketing "What you get" / values grids use the same wrapper.

### 3.5 Card (one card, two sizes)

Consolidate Step/Layer/Hold/Value/Assurance/RoleNote/SpaceCard/ChannelCard/CircleCard into **one `Card`** with role variants:
- **Feature card:** `rounded-3xl border border-border bg-surface(-elevated) p-7 shadow-sm`, optional icon chip (`w-11 h-11 rounded-2xl bg-primary-bg`), title (`font-display uppercase text-2xl` **or** `text-lg font-bold`, *choose one per the type scale*; recommend `text-lg font-bold` for multi-line readable cards, display for single-word labels), body `text-base text-muted`.
- **List/link card:** `rounded-2xl border border-border bg-surface p-5/p-6 hover:border-border-strong transition-colors` (Discover's pattern).
- **Numbered step:** feature card + `font-display uppercase text-4xl text-border-strong` step number top-right.

Lock the icon chip to ONE spec: `w-11 h-11 rounded-2xl bg-primary-bg text-primary-strong` (today some use `rounded-xl`, some `bg-primary-bg/50`, some `bg-primary-bg/60`).

### 3.6 Stat row: **`Stat` / `StatRow`**

`font-display text-6xl sm:text-7xl text-text` value + `text-xs uppercase tracking-widest font-bold text-subtle mt-3` label, in a `grid grid-cols-3 gap-6 max-w-xl mx-auto`. Promote home's `Stat` to the kit; Discover's inline pipe-separated counts should use it too (or a compact inline variant) so stats look identical everywhere.

### 3.7 Pull-quote: **`PullQuote`** (new)

Promote about.tsx's `<figure>`: centered `font-display uppercase text-3xl sm:text-4xl lg:text-5xl leading-[1.08]` blockquote with `text-primary` accent words + `text-subtle` uppercase attribution. Distinct from `Statement` (which has no attribution and is a full-bleed interstitial).

### 3.8 Dark "beat": **`bg-slat` band**

Always: `light-strip` at the top seam (and bottom if it returns to light), `text-on-ink`/`text-on-ink-muted` body, `text-primary` accents, image frames `border-ink-border shadow-pop`. Use via `Section tone="ink"`, `Statement tone="ink"`, `ZigZag tone="ink"`, or `BetaCTA`. **The home `Pillar` band and Marquee bands are the reference;** ensure every ink band has its seam (some Marquee-in-slat bands omit it).

### 3.9 CTA

- **Primary button (canonical):** `inline-flex items-center justify-center gap-2 rounded-2xl bg-primary text-on-primary px-8 py-3.5 text-base font-bold hover:bg-primary-hover transition-colors shadow-pop` + trailing `ArrowRight w-5 h-5`. **Lock `px-8 py-3.5`** (kill the `py-3`/`py-4`/`px-7`/`px-10` variants).
- **Secondary/outline (light):** `rounded-2xl border border-border-strong px-8 py-3.5 text-base font-medium text-text hover:bg-surface-elevated transition-colors`.
- **Ghost (on photo/ink):** `rounded-2xl border border-white/30 px-8 py-3.5 text-base font-medium text-white hover:bg-white/10`.
- **Text link CTA:** `inline-flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-primary-strong hover:underline` + `ArrowRight w-4 h-4`.

**Create a `Button` component** with `variant` + `size` so these stop being copy-pasted (they appear inline ~12 times). **`BetaCTA`** stays the canonical closing section.

---

## 4. Page-flow blueprint (per page type)

A shared skeleton so every page has the same heartbeat: **Hero → orient → alternating beats with one dark punctuation → proof/specifics → closing BetaCTA.**

### A. Landing / splash (`app/page.tsx`)
1. `PhotoHero minHeight="screen"` — eyebrow, H1, subtitle, dual CTA, trust line, scroll cue, `light-strip`.
2. **Orient** — `Section surface` + centered `SectionHeading` + 3-up `Card` grid ("what you get") + quick-link row.
3. **Problem** — `ZigZag canvas`.
4. **Story** — `ZigZag surface reverse` → `Statement ink` (dark beat #1).
5. **Vision** — `ZigZag canvas` → `Statement surface`.
6. **What we're building** — `bg-slat` pillar band (Marquee + 3 `Pillar`s, seamed).
7. **Proof** — `Section surface` + `StatRow` (gated) ; live events (`Section narrow canvas`); member posts (`Section narrow surface`).
8. **Objections** — `Section canvas` + `FaqList`.
9. **Founding cohort** — `Section surface` callout panel.
10. `BetaCTA` (dark beat #2 / close).

### B. Mission / story (`about`)
Hero (`PhotoHero`) → intro `Section surface` (Lead+Body) → alternating `ZigZag` story beats with `Statement` interstitials (one `ink`) → values `Card` grid → `PullQuote` → timeline `Section canvas` → closing `ZigZag` + `Statement` → `BetaCTA`.

### C. Product (`the-lab`, `how-it-works`, `demo`)
Hero (`PhotoHero` + CTA) → premise `Section` (Lead+Body) → `Statement` → **tour** = alternating `ZigZag`s (**enforce surface/canvas alternation** — demo currently runs all-canvas) with exactly one `ink` ZigZag as the dark beat → quick-scan `Card` grid → `Statement ink` or Marquee band → grounding `Section canvas` ("where it begins") → `BetaCTA`. (Interactive `demo` slots `ProductTour` into the orient `Section`.)

### D. Pricing (`pricing`)
Hero (`PhotoHero`, no CTA) → `BetaBanner` (`Section flush`) → tiers `Section wide` (3 `Tier` cards, featured = `shadow-pop`) → "earned not bought" `Card` grid `canvas` → `Statement surface` → "where it goes" `ZigZag canvas` → assurance `Card` grid → `FaqList canvas` → `BetaCTA`.

### E. Discover / index (`discover` + `circles`/`events`/`topics`)
Hero (`PhotoHero wide` + stat line or founding line + CTA) → **every section is a `Section`** (not a raw `<section>`): locator `Section wide surface` → topics `Card grid wide canvas` → `Statement ink` (dark beat) → events `Section narrow surface` (`StatRow`/`EventRow`, **amber not green**) → circles `Card grid wide canvas` → editorial `ZigZag surface` → posts `Section narrow` → `FaqList` → `BetaCTA`. Sub-index pages (circles/events/topics) = Hero → one `Card grid`/list `Section` → one `ZigZag` or `Statement ink` beat → `BetaCTA`. **Same rhythm scale and widths as marketing** (replace `py-16`/`max-w-6xl` raw sections with `Section size="wide"`).

---

## 5. Prioritized unification backlog

> **Status (2026-06-04, ADR-076):** the strategic content redesign + the first enforcement pass shipped.
> ✅ done: `Button` + `Card` added to the kit and rolled across home/splash/discover; `DiscoverHero`
> deleted (Discover uses `PhotoHero`); the duplicate `SectionHeading` removed; the marketing chrome
> de-greened; the home hero already uses `PhotoHero`. ⏳ remaining: the `Section` rhythm scale
> (`size`/`flush` props + stripping bespoke `pad=`) and routing Discover's raw `<section>`s through
> `Section` — a follow-up pass.

### P0 — kills the "cobbled-together" feeling (structural dedupe + rhythm)
- **Merge `DiscoverHero` → `PhotoHero`.** Delete `DiscoverHero` from `components/discover/cards.tsx`; re-export/alias `PhotoHero` (add `wide` prop). Update imports in `app/discover/{page,circles/page,events/page,topics/page}.tsx`.
- **Merge the two `SectionHeading`s.** Keep `components/marketing/marketing-ui.tsx`; add `tone`/`align`/`size` props; delete the copy in `cards.tsx`; repoint Discover imports.
- **Publish the rhythm scale (§2.2)** and make `Section`'s default the ONLY content rhythm. Add `size` (narrow/default/wide) and `flush` props to `Section`. Then strip every bespoke `pad=`/`pt-4`/`pt-20 pb-10` from `the-lab`, `demo`, `pricing`, `page.tsx`.
- **Route Discover index sections through `Section`.** In `app/discover/page.tsx` (and the three sub-pages) replace every raw `<section className="bg-… px-6 py-16">…max-w-6xl/2xl…` with `Section tone size`. Removes the `py-16` + bare-width drift in one shot.
- **Refactor the splash hero (`app/page.tsx`)** to use `PhotoHero` (`minHeight="screen"`) instead of the hand-built background-image hero.

### P1 — visual consistency (tokens, buttons, cards)
- **Add a `Button` component** (variant: primary/secondary/ghost; size) and replace the ~12 inline CTA declarations across all pages. Lock `px-8 py-3.5`.
- **Consolidate cards** into one `Card` (feature/list/step variants) + standardize the icon chip (`w-11 h-11 rounded-2xl bg-primary-bg text-primary-strong`). Refactor Step/Layer/Hold (`how-it-works`), Value/Milestone (`about`), Tier/RoleNote/Assurance (`pricing`), SpaceCard/DayBeat (`demo`), Step (`page.tsx`).
- **Promote `Stat`/`StatRow`, `Faq`/`FaqList`, `PullQuote`, `EventRow`** into marketing-ui; delete the per-page copies (home `Faq`, pricing `Faq`, discover `<dl>` FAQ; home `Stat`).
- **De-green the marketing chrome:** remove `tone="success"` from Discover `SectionHeading` usage and recolor `EventRow`'s green chip to the amber/primary language (`cards.tsx`, `app/discover/page.tsx`). Keep `success` for in-app status only.
- **Lock eyebrow tracking to `0.25em`** — fix the home hero's `0.3em` (`app/page.tsx`).
- **Collapse elevation:** swap `shadow-2xl` (home `Pillar`) and `shadow-xl` (pricing featured) for `shadow-pop`/`shadow-pop-lg`; pick one card-hover convention.

### P2 — polish & guardrails
- **Enforce tone alternation** in `app/(marketing)/demo/page.tsx` (the long all-`canvas` ZigZag run) — alternate surface/canvas, keep one `ink`.
- **Add the rhythm/width/radius/button scales to `docs/DESIGN.md`** and a short "compose from the kit, don't hand-roll sections" rule to `AGENTS.md` so drift doesn't re-accrue.
- **Audit `lg:scale-[1.02]` / `hover:-translate-y-0.5` / `lg:-translate-y-3`** — either promote into component variants or remove for consistency; ensure all transforms respect `prefers-reduced-motion`.
- **Verify the Puck page-editor `config`/`blocks`** expose these same canonical components, so editor-built pages can't diverge from the codified system (the legacy fallbacks and the Puck blocks should share one kit).

---

### Files referenced
- `app/globals.css` — token layer, `font-display`, `bg-slat`/`light-strip`/`amber-glow`, shadow scale (add rhythm scale here).
- `components/marketing/marketing-ui.tsx` — `PhotoHero`, `PageHero`, `Section`, `SectionHeading`, `ZigZag`, `Statement`, `Marquee`, `BetaCTA`, `Lead`, `Body` (home of the unified kit; add `Button`, `Card`, `Stat`, `FaqList`, `PullQuote`).
- `components/discover/cards.tsx` — `DiscoverHero` (delete), `SectionHeading` (delete), cards (fold into shared `Card`), `EventRow` (de-green).
- `app/page.tsx` — splash hero refactor, inline Stat/Faq/Step/EventRow promotion, eyebrow tracking fix.
- `app/(marketing)/{how-it-works,the-lab,about,pricing,demo}/page.tsx` — strip bespoke padding, route through kit, dedupe cards/CTAs.
- `app/discover/{page,circles/page,events/page,topics/page}.tsx` — route raw sections through `Section`, adopt shared hero/heading, de-green.
