# Production → DAWN handoff — full style sync (2026-08-03)

> **Direction: reversed.** Normally DAWN hands changes to the repo. This round the
> **repo is the source of truth**: production styles have moved ahead without a sync,
> and this doc brings DAWN up to date. It is self-contained — every current value is
> embedded, so DAWN needs no repo access. Replace the DAWN token files **wholesale**
> with the sheets below rather than patching diffs.
>
> **Scope: the DAWN theme plus the Midnight skin.** DAWN is the default look
> (light + dark). Midnight is the one alternate skin (§3), also light + dark.
> Production carries further theming machinery (seasonal overlays, feel presets,
> per-Space themes); all of that stays out of scope for this round.
>
> Source of truth in the repo: `app/globals.css` (all tokens + effects),
> `app/layout.tsx` (fonts), `docs/DESIGN.md` (direction).

Legend: ✅ unchanged since your last snapshot · ⚠️ value changed · 🆕 new since your snapshot · ⏳ open question for Daniel

---

## 1. Drift summary (vs. DAWN's last `tokens/colors.css` snapshot)

| # | Area | Status | What changed |
|---|---|---|---|
| 1 | Body ink (light) | ⚠️ | `--color-text` **#1E1A13 → #3D352A** (softer warm charcoal on cream; dark mode unchanged) |
| 2 | Feed post surface | 🆕 | `--color-surface-post` #F7F5EF light / #2B2415 dark — post cards sit a step warmer than the white composer |
| 3 | Brand · Move family | 🆕 | Cerulean blue-teal for the Get Moving / Mindless door: 5 tokens light + 5 dark |
| 4 | Midnight skin | 🆕 | A second full palette: cool slate/indigo surfaces, amber kept, sharper radii — light + dark blocks (§3) |
| 5 | Feel tokens | 🆕 | Radius-by-role, motion durations, and the global density root are now tokens |
| 6 | Shadows | ⚠️ | Soft set + pop set as before; 🆕 `--shadow-menu` (downward-only mega-menu depth) and text-shadow utilities (ADR-569) |
| 7 | Focus rings | ⚠️ | Split treatment: actionable chrome gets the amber ring, text fields get a calmer neutral ring; three surfaces opt out |
| 8 | Light lock | 🆕 | `.theme-light-lock` — a subtree that stays cream even when the app is in dark mode (beta induction) |
| 9 | Utilities | 🆕 | `text-2xs/3xs`, `.press`, `.dimmed`, safe-area helpers, `.text-emboss`, text-shadow presets |
| 10 | Quest icon round | ⏳ | Partially applied: `quests` → Compass ✅, but `vault` still renders `Gem`, not `Vault` — see §9 |
| 11 | Everything else in colors.css | ✅ | Surfaces, borders, ink band, primary, signal, broadcast, semantic states, rank spectrum, brand-mark emboss — value-identical |

---

## 2. Color tokens — current sheet (replace `tokens/colors.css` wholesale)

Raw hex lives ONLY here (both projects share this golden rule). Light is default;
`.dark` mirrors on warm espresso.

### 2a. Light (`:root`)

```css
:root {
  color-scheme: light;

  /* Surfaces */
  --color-canvas:            #FBF8F1;
  --color-marketing-canvas:  #F2EAD9;
  --color-surface:           #FFFFFF;
  --color-surface-elevated:  #FAF6EC;
  --color-surface-post:      #F7F5EF;   /* 🆕 feed post-card surface */

  /* Borders */
  --color-border:            #E9E1D4;
  --color-border-strong:     #D8CDBB;

  /* Text — body ink SOFTENED (was #1E1A13) */
  --color-text:              #3D352A;   /* ⚠️ warm charcoal, ~10:1 on canvas */
  --color-text-muted:        #6B6253;
  --color-text-subtle:       #8F8675;

  /* Ink (marketing dark bands) — unchanged */
  --color-ink:               #141210;
  --color-ink-elevated:      #211D17;
  --color-ink-border:        #393227;
  --color-on-ink:            #F3EEE3;
  --color-on-ink-muted:      #B5A893;
  --color-on-ink-subtle:     #857A66;

  /* Brand · Primary (amber-gold) — unchanged */
  --color-primary:           #E2912F;
  --color-primary-hover:     #CE8023;
  --color-primary-strong:    #9A5E12;
  --color-primary-bg:        #FBEFD9;
  --color-text-on-primary:   #FFFFFF;

  /* Brand · Signal (emerald-teal) — unchanged */
  --color-signal:            #0F8E78;
  --color-signal-strong:     #0A5C4D;
  --color-signal-bg:         #D2EDE6;
  --color-text-on-signal:    #04231E;

  /* Brand · Broadcast (robin's-egg) — comms only — unchanged */
  --color-broadcast:         #1EB6C5;
  --color-broadcast-strong:  #0E808D;
  --color-broadcast-bg:      #D8F2F5;
  --color-text-on-broadcast: #FFFFFF;

  /* 🆕 Brand · Move (cerulean blue-teal) — the Get Moving accent for the
     Mindless door. Deliberately BLUER than the green-leaning success/signal
     teals so it never collides with "done"; sits opposite the amber primary. */
  --color-move:              #1C7FB5;
  --color-move-hover:        #176A98;
  --color-move-strong:       #0F4E72;
  --color-move-bg:           #DCEFF8;
  --color-text-on-move:      #FFFFFF;

  /* Semantic states (success is TEAL, not green) — unchanged */
  --color-success:           #11827A;
  --color-success-bg:        #D7EFEA;
  --color-warning:           #B07515;
  --color-warning-bg:        #F6ECD8;
  --color-danger:            #BA3B30;
  --color-danger-bg:         #F7E4E1;
  --color-info:              #2F6FB0;
  --color-info-bg:           #E3EDF7;

  /* Focus */
  --color-focus-ring:        #E2912F;

  /* Rank spectrum — unchanged (core / deep / bright, same in both modes) */
  --rank-stone:  #8A8073; --rank-stone-deep:  #4E4A40; --rank-stone-bright:  #CBC2B2;
  --rank-clay:   #C26B45; --rank-clay-deep:   #7C3D22; --rank-clay-bright:   #E9A484;
  --rank-gold:   #D69A3C; --rank-gold-deep:   #875A14; --rank-gold-bright:   #F0C173;
  --rank-olive:  #8A9A5B; --rank-olive-deep:  #4F5A2E; --rank-olive-bright:  #C2CE96;
  --rank-jade:   #3FA191; --rank-jade-deep:   #245A4E; --rank-jade-bright:   #88D6C5;
  --rank-teal:   #1F9BA6; --rank-teal-deep:   #0F5C63; --rank-teal-bright:   #74D2DA;
  --rank-slate:  #5B7CA6; --rank-slate-deep:  #324862; --rank-slate-bright:  #9FB6D4;
  --rank-indigo: #7A77C4; --rank-indigo-deep: #444180; --rank-indigo-bright: #B3B0E4;
  --rank-plum:   #9E6B9E; --rank-plum-deep:   #5C3A5C; --rank-plum-bright:   #CFA3CF;
  --rank-rose:   #BD6A7E; --rank-rose-deep:   #743A48; --rank-rose-bright:   #E2A2B0;

  /* Brand mark (engraved wordmark) — unchanged */
  --brand-mark:         #6E4A2A;
  --brand-emboss-light: rgba(255, 248, 235, 0.85);
  --brand-emboss-dark:  rgba(42, 24, 8, 0.50);
  --brand-burn:         rgba(74, 40, 12, 0.45);
  --brand-shine:        rgba(255, 244, 222, 0.65);
  --brand-wash:         rgba(194, 88, 18, 0.62);
}
```

### 2b. Dark (`.dark`)

Everything matches your snapshot except the two 🆕 blocks:

```css
.dark {
  color-scheme: dark;

  --color-canvas:            #17120B;
  --color-marketing-canvas:  #120E07;
  --color-surface:           #211A10;
  --color-surface-elevated:  #2B2415;
  --color-surface-post:      #2B2415;   /* 🆕 post cards keep the elevated timber */

  --color-border:            #3C3220;
  --color-border-strong:     #50432B;

  --color-text:              #EFE8DB;   /* dark body ink UNCHANGED */
  --color-text-muted:        #A99C88;
  --color-text-subtle:       #7E735F;

  --color-ink:               #0E0C09;
  --color-ink-elevated:      #1A1611;
  --color-ink-border:        #2F281F;
  --color-on-ink:            #EFE8DB;
  --color-on-ink-muted:      #A99C88;
  --color-on-ink-subtle:     #7E735F;

  --color-primary:           #F2B14E;
  --color-primary-hover:     #F8C56F;
  --color-primary-strong:    #F2B14E;
  --color-primary-bg:        #30240F;
  --color-text-on-primary:   #FFFFFF;

  --color-signal:            #53CFAC;
  --color-signal-strong:     #53CFAC;
  --color-signal-bg:         #0C2C25;
  --color-text-on-signal:    #04231E;

  --color-broadcast:         #69D6E6;
  --color-broadcast-strong:  #69D6E6;
  --color-broadcast-bg:      #0F2A34;
  --color-text-on-broadcast: #FFFFFF;

  /* 🆕 Move — brighter cerulean against the dark wood */
  --color-move:              #58B4E0;
  --color-move-hover:        #76C2E7;
  --color-move-strong:       #58B4E0;
  --color-move-bg:           #102836;
  --color-text-on-move:      #08161F;

  --color-success:           #5FD3BE;
  --color-success-bg:        #103029;
  --color-warning:           #F2B14E;
  --color-warning-bg:        #2C2310;
  --color-danger:            #F0857A;
  --color-danger-bg:         #2E1714;
  --color-info:              #6FA8DC;
  --color-info-bg:           #15212E;

  --color-focus-ring:        #F2B14E;
  /* rank primitives inherited from :root */

  --brand-mark:         #A2723F;
  --brand-emboss-light: rgba(255, 226, 184, 0.22);
  --brand-emboss-dark:  rgba(0, 0, 0, 0.66);
  --brand-burn:         rgba(20, 9, 0, 0.60);
  --brand-shine:        rgba(255, 230, 190, 0.42);
  --brand-wash:         rgba(232, 134, 54, 0.55);
}
```

### 2c. 🆕 Always-light lock

The cinematic beta induction stays cream even when the visitor's OS/app is dark
(a dark induction reads as broken). `.theme-light-lock` on a wrapper re-asserts the
light surface/text/border/primary/success/danger/move tokens for its subtree.
Model this in DAWN as "a subtree that pins the light palette."

---

## 3. 🆕 The Midnight skin (the one alternate palette)

**How skins compose:** a skin is a token override set applied via
`data-skin="<id>"` on the shell root, **orthogonal to light/dark mode** (`.dark`
on `<html>`). So there are four render states: DAWN light, DAWN dark, Midnight
light, Midnight dark. Any token a skin does not override inherits the DAWN value —
Midnight currently inherits signal, broadcast, move, the semantic states, ranks,
and the brand-mark set unchanged.

**The intent:** a cooler, deeper "cinematic" take — cool slate / indigo-leaning
surfaces in place of the warm cream/espresso, with the warm amber accent kept so
it still reads as Frequency. The feel also retunes: radii go sharper, more
architectural. Body text/canvas contrast holds ≥ ~4.5:1 in both modes.

### 3a. Midnight light

```css
[data-skin="midnight"] {
  color-scheme: light;

  /* Surfaces — cool, pale slate instead of warm cream. */
  --color-canvas:            #EEF1F6;
  --color-marketing-canvas:  #E3E8F1;
  --color-surface:           #FFFFFF;
  --color-surface-elevated:  #F4F6FB;
  --color-surface-post:      #F0F2F6;

  /* Borders — cool grey-blue hairlines. */
  --color-border:            #D5DBE6;
  --color-border-strong:     #BCC5D6;

  /* Text — deep slate ink (~12:1 on canvas), cool muted/subtle steps. */
  --color-text:              #1C2535;
  --color-text-muted:        #4B566B;
  --color-text-subtle:       #6E7A91;

  /* Primary — the warm amber kept; nudged slightly deeper to sit on cool surfaces. */
  --color-primary:           #D9852A;
  --color-primary-hover:     #C2741F;
  --color-primary-strong:    #8C5410;
  --color-primary-bg:        #F6E7CF;
  --color-text-on-primary:   #FFFFFF;

  --color-focus-ring:        #D9852A;

  /* Feel — sharper, more architectural than DAWN's soft radii. */
  --radius-control: 0.375rem;
  --radius-card:    0.625rem;
  --radius-pill:    9999px;
}
```

### 3b. Midnight dark

```css
.dark [data-skin="midnight"] {
  color-scheme: dark;

  /* Surfaces — deep cool slate / indigo, a true cinematic midnight
     rather than DAWN's warm espresso. */
  --color-canvas:           #0C1018;
  --color-marketing-canvas: #080B12;
  --color-surface:          #161C28;
  --color-surface-elevated: #1F2736;
  --color-surface-post:     #1F2736;

  /* Borders — cool slate. */
  --color-border:           #2A3445;
  --color-border-strong:    #3A4659;

  /* Text — cool off-white ink (~14:1 on canvas). */
  --color-text:             #E7ECF4;
  --color-text-muted:       #9AA6BC;
  --color-text-subtle:      #6B7689;

  /* Primary — amber brightened in the dark, as DAWN does. */
  --color-primary:          #F0AD4E;
  --color-primary-hover:    #F6C16F;
  --color-primary-strong:   #F0AD4E;
  --color-primary-bg:       #2A2113;
  --color-text-on-primary:  #1A1206;

  --color-focus-ring:       #F0AD4E;

  /* Feel — sharper radii, matching the light-mode Midnight. */
  --radius-control: 0.375rem;
  --radius-card:    0.625rem;
  --radius-pill:    9999px;
}
```

(Selector detail if DAWN models the mechanics: mode lives on `<html>`, the skin on
a descendant shell root, so the dark variant uses the descendant selector
`.dark [data-skin="midnight"]`, never `[data-skin].dark`.)

---

## 4. Feel tokens — radius, motion, density (🆕, add to `tokens/spacing.css`)

The non-color half of the DAWN look, now tokenized (Midnight overrides the radii,
§3):

| Token | DAWN value | Meaning |
|---|---|---|
| `--radius-control` | `0.5rem` | Buttons, inputs, small controls |
| `--radius-card` | `1rem` | Cards |
| `--radius-pill` | `9999px` | Pills, chips |
| `--motion-fast` | `130ms` | Micro-interactions |
| `--motion-base` | `260ms` | The base interaction beat (cue-pop) |
| `--motion-slow` | `700ms` | Washes, big reveals |
| `--density-root` | `106.25%` | The `<html>` font-size — the whole rem scale derives from it (≈17px base) |

`prefers-reduced-motion` collapses all motion to nothing and halts every looping
animation.

### Shadows (soft warm elevation — overrides Tailwind's pure-black defaults)

```css
--shadow-2xs: 0 1px 2px rgb(40 30 16 / 0.04);
--shadow-xs:  0 1px 3px rgb(40 30 16 / 0.05);
--shadow-sm:  0 1px 2px rgb(40 30 16 / 0.04), 0 2px 6px -1px rgb(40 30 16 / 0.06);
--shadow-md:  0 2px 4px rgb(40 30 16 / 0.05), 0 6px 16px -4px rgb(40 30 16 / 0.08);
--shadow-lg:  0 4px 8px rgb(40 30 16 / 0.06), 0 12px 28px -6px rgb(40 30 16 / 0.10);
--shadow-xl:  0 8px 16px rgb(40 30 16 / 0.08), 0 24px 48px -12px rgb(40 30 16 / 0.12);

/* Marketing "pop" — hero card, pricing tiers, demo device frame */
--shadow-pop:    0 4px 12px -2px rgb(20 16 10 / 0.16), 0 16px 40px -10px rgb(20 16 10 / 0.22);
--shadow-pop-lg: 0 10px 24px -6px rgb(20 16 10 / 0.20), 0 36px 70px -16px rgb(20 16 10 / 0.30);

/* 🆕 Mega-menu panel — downward-only depth, no upward bleed, so the panel reads
   as sliding out from UNDER the opaque bar above it */
--shadow-menu:   0 14px 24px -10px rgb(20 16 10 / 0.18), 0 28px 50px -20px rgb(20 16 10 / 0.20);
```

### 🆕 Text-shadow presets (ADR-569 — operator text-style control)

```css
.text-shadow-soft   { text-shadow: 0 1px 2px rgb(40 30 16 / 0.18); }
.text-shadow-strong { text-shadow: 0 1px 1px rgb(20 16 10 / 0.28), 0 2px 6px rgb(20 16 10 / 0.24); }
```

---

## 5. Typography — current spec (replace `tokens/fonts.css` / `typography.css`)

### Baseline

| Property | Value |
|---|---|
| Root size | `html { font-size: 106.25% }` ≈ 17px (the `--density-root` token) |
| Body face | Nunito (weights 400–900 loaded), `line-height: 1.65` |
| Headings | `font-weight: 800; line-height: 1.2; letter-spacing: -0.01em` |
| Mono | Geist Mono |
| Display | `.font-display` → Anton, weight 400, `letter-spacing: 0.012em`, `line-height: 1.0`, pair with `uppercase` |

### Sub-xs steps (the `text-[10/11px]` anti-pattern is retired)

| Utility | Size |
|---|---|
| `text-2xs` | 11px |
| `text-3xs` | 10px |

### Font roster (all via next/font, self-hosted)

| Face | Variable | Weights | Role |
|---|---|---|---|
| Nunito | `--font-nunito` | 400–900 | Body / default sans |
| Geist Mono | `--font-geist-mono` | var | Mono |
| Anton | `--font-anton` | 400 | Marketing display face |
| Playfair Display | `--font-playfair` | var | Editorial accents (marketing) |
| Caveat | `--font-caveat` | 400, 700 | Handwritten accents |
| Space Grotesk | `--font-grotesk` | var | Occasional accent face |

---

## 6. Effects — current spec (replace `tokens/effects.css` wholesale)

### Marketing dark-band signatures

```css
/* Vertical wood-slat texture over ink; warm sheen at the top grazes the slats. */
.bg-slat {
  background-color: var(--color-ink);
  background-image:
    linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 7%, transparent) 0%, transparent 22%),
    repeating-linear-gradient(90deg,
      color-mix(in srgb, var(--color-on-ink) 6%, transparent) 0,
      color-mix(in srgb, var(--color-on-ink) 6%, transparent) 1px,
      transparent 1px, transparent 11px);
}

/* Warm amber LED hairline between sections. */
.light-strip {
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--color-primary), transparent);
  box-shadow: 0 0 16px 1px color-mix(in srgb, var(--color-primary) 55%, transparent);
}

/* Soft radial glow backdrop (absolute, pointer-events-none layer). */
.amber-glow {
  background: radial-gradient(ellipse 60% 55% at 50% 42%,
    color-mix(in srgb, var(--color-primary) 28%, transparent) 0%,
    transparent 70%);
}
```

(Production routes the glow percentages through a decorative-intensity variable;
the values above are the resolved DAWN-baseline numbers — use them as written.
Being token-driven, all three re-tint automatically under the Midnight skin.)

### Rank badge (unchanged mechanics)

```css
.rank-badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 500;
  background: color-mix(in srgb, var(--rank) 14%, var(--color-surface));
  color: var(--rank-deep);
  border: 0.5px solid color-mix(in srgb, var(--rank) 32%, transparent);
}
.rank-badge .rank-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--rank); }
.dark .rank-badge {
  background: color-mix(in srgb, var(--rank) 24%, var(--color-surface));
  color: var(--rank-bright);
}
```

### ⚠️ Focus rings — split treatment + opt-outs

```css
/* Actionable chrome lights up brand amber */
:where(button, a, select, [tabindex]):focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-focus-ring) 45%, transparent);
}
/* Text fields get a calmer neutral ring so typing never glows orange */
:where(input, textarea):focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-border-strong) 60%, transparent);
}
```

Three opt-outs (owner directives): the Composer textarea (its box lifts on
focus-within instead), the header wordmark link, and the admin command-bar search
field (borderless on a canvas band; the caret shows focus).

### Brand mark (engraved wordmark — now animated)

Same alpha-mask + two-tone emboss you have, plus two idle animations on a shared 6s
cadence (2.5s delay): `brand-shine` (a warm wash sweeps across the letters once a
cycle, `background-size: 240% 100%`) and `brand-wiggle` (a subtle ±1° rotate on the
link wrapper). Hover pauses both, brightens (1.12) and lifts the catch-light; active
inverts the emboss to a pressed, burnt-in engrave. Reduced motion kills all of it.

`.text-emboss` gives button labels the same two-tone raised treatment:

```css
.text-emboss {
  text-shadow: 0 -0.5px 0 var(--brand-emboss-light), 0 1px 1.5px var(--brand-emboss-dark);
}
```

### 🆕 Small interaction utilities

```css
.press:active { transform: scale(0.99); }   /* kit-card press; reduced-motion → none */
.dimmed { opacity: 0.72; filter: grayscale(0.5); }  /* Beta demo content recede */
```

---

## 7. Motion inventory (all guarded by `prefers-reduced-motion`)

| Animation | Where | Spec |
|---|---|---|
| `cue-pop` | Vera coachmark | 260ms `cubic-bezier(0.34, 1.56, 0.64, 1)` scale 0.92→1 + 8px rise — **the base interaction beat** |
| `reveal` | Marketing scroll-reveal | 700ms `cubic-bezier(0.22, 1, 0.36, 1)`, 24px rise + fade, staggered via `--reveal-delay` |
| `cue-bounce` | Hero scroll cue | 2.4s ease-in-out, 6px bob |
| `marquee` | Marketing strip | 32s linear loop |
| `brand-shine` / `brand-wiggle` | Wordmark | 6s cadence, 2.5s delay (see §6) |
| `freq-glow` | Signature bloom halo | 6s breath, scale 0.985↔1.015 (Mindless breath cadence) |
| `wiggle` | Beta badge | 4.5s loop: still ~90%, then a quick shake |
| `warmup-flash` | On Air count-in | 0.7s ease-out wash fade |
| `spotlight-bg-pan` | Spotlight profile backdrop | slow pan of a 300% gradient, member opt-in |
| `slideUp` | Achievement toast | 20px rise + scale 0.95→1 |

---

## 8. Icons

Lucide throughout (shared set with DAWN). The Quest canonical set from your last
CHANGES.md round is the standing spec. Standalone treatment: amber chip
(`bg-primary-bg` + `text-primary-strong`, `rounded-xl`, ~22px glyph).

---

## 9. ⏳ Open questions for Daniel (clarify before the rework round)

1. **Vault icon** — your last round spec'd `vault: Vault`, but production still
   renders `Gem` for the vault nav area (`quests → Compass` did land). Keep Gem or
   finish the swap?
2. **Light body ink** — `#3D352A` softened deliberately (warm charcoal, ~10:1) while
   dark mode kept `#EFE8DB`. Confirm DAWN adopts #3D352A as canon.
3. **Post surface** — `--color-surface-post` #F7F5EF was tuned twice recently
   (#F6F5F3 → #F7F5EF). Treat as locked?
4. **Midnight secondary accents** — Midnight currently inherits DAWN's signal,
   broadcast, move, and semantic-state values unchanged. Should the Midnight round
   tune cool-surface variants for them, or is inheritance the intent?

---

## 10. How to apply (for Claude Design)

1. Replace `tokens/colors.css` with §2 (both blocks + the light-lock note).
2. Add the Midnight skin (§3) as a second palette card set — all four render
   states: DAWN light/dark, Midnight light/dark.
3. Add the feel tokens + shadows of §4 to `tokens/spacing.css`.
4. Replace `tokens/effects.css` with §6 (and the motion specs of §7 as reference).
5. Update `tokens/fonts.css` / `typography.css` from §5.
6. Regenerate the Design System reference cards so review reflects production.
7. Next DAWN→repo round then flows through `design_handoff/CHANGES.md` as usual —
   with both sides now starting from the same baseline.
