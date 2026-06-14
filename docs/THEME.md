# Adaptive theming: the four-axis model

> **The model, in one line.** A surface's look is composed from **four orthogonal axes** —
> mode, skin, occasion, and generation — each one attribute on the shell root, resolved
> through the CSS custom-property cascade. One canonical DOM, CSS-only variation, no
> per-look duplication.

> **The framing that matters most (read this first).** The **generation** axis targets a
> user-*chosen* comfort and style preference. It is **never an inferred age.** "Generations"
> are not a scientific category, and accessibility is a floor every preset must clear, not a
> style choice. Section 3 has the evidence; the names are an optional friendly on-ramp, not a
> claim about who you are.

Status legend: ✅ built · ⏳ partial · ⚠️ needs attention · 🔴 gated / not built.

Canonical record: [ADR-257](DECISIONS.md). Source of truth is the running code:
[`app/globals.css`](../app/globals.css) (the CSS) + [`lib/theme/`](../lib/theme/) (the typed
registries + resolver) + `supabase/migrations/`. This doc explains them; where they disagree,
the code wins.

---

## 1. The four axes

Each axis is a single attribute (or class) on `<html>` or the shell root. They compose by the
custom-property cascade: a token redefined further down the cascade overrides the inherited
value for that subtree, so the axes never need to know about each other.

| Axis | Attribute | What it controls | Who sets it | Status |
|---|---|---|---|---|
| **Mode** | `class="dark"` on `<html>` | light vs dark | member toggle (a pre-paint inline script reads `localStorage` `freq-theme`) | ✅ built |
| **Skin** | `data-skin` on shell root | white-label palette + base feel | the active Space (server-resolved); a `freq-skin` preview override exists for design | ✅ built (`default` \| `midnight`) |
| **Occasion** | `data-occasion` on shell root | a light, time-boxed seasonal accent overlay | the calendar window, or a member pin via cookie | ⏳ axis + resolver built; auto-scheduling onto the DOM pending |
| **Generation** | `data-generation` on shell root | the "feel": type scale, density, radius, motion, ornament, contrast floor, tap floor | the member's chosen preference, with a Space default | ⏳ axis + resolver built; client switch + Space-default column pending |

**Why three of them carry a registry.** Skin, occasion, and generation each have a typed
registry in [`lib/theme/`](../lib/theme/) that is the single place an id is declared, plus a
`resolve*` guard so an unknown value can never reach the DOM. A CSS⇄registry **guardrail
test** reads `app/globals.css` from disk and fails the build if a registered id is missing its
CSS block (or vice versa), so the two halves can never quietly drift. Today that test is live
for skins ([`skins.test.ts`](../lib/theme/skins.test.ts)); the matching `generations.test.ts` /
`occasions.test.ts` follow the same pattern and are ⏳ pending.

---

## 2. How the cascade composes them (the mechanism)

The whole system is the CSS custom-property cascade plus source-order precedence. No
JavaScript runs to compute a look; the browser resolves it.

1. **Base** (`:root` / `.dark`) sets DAWN: every semantic token (`--color-canvas`,
   `--color-text`, `--type-scale`, `--tap-min`, …) gets a value.
2. **Skin** (`[data-skin="…"]`) redefines palette + base-feel tokens for its subtree. Because
   mode lives on `<html>` and the skin lives on a descendant, a skin's dark-mode overrides use
   the descendant selector `.dark [data-skin="…"]` (not `[data-skin].dark`).
3. **Occasion** (`[data-occasion="…"]`) nudges only a couple of accent/ornament tokens. It is a
   light overlay, not a restyle, and ships both light and `.dark` variants.
4. **Generation** (`[data-generation="…"]`) is **feel-only**: it owns and wins on the feel
   tokens (type scale, density, radius, motion, ornament, tap floor). It does NOT re-declare
   palette/contrast tokens, so contrast stays at the base in both modes (per-preset contrast
   tuning with proper `.dark` variants is a tracked follow-up).

All four axes are **unlayered**; precedence is simply SOURCE ORDER. The blocks are authored
base → skin → occasion → generation, so a later block wins ties over an earlier one. Every
selector is a single attribute (or `.dark` + attribute), so equal-specificity ties resolve by
document order, and generation, authored last, has the final say on the feel tokens it owns.

> Why not `@layer`? Unlayered styles beat layered ones in the cascade, so wrapping only the two
> new axes in a layer would make them LOSE to the unlayered base `:root` feel tokens whenever
> `data-generation` sits on `<html>`, silently breaking the axis. Keeping every axis unlayered
> makes precedence a robust matter of source order.

**`@theme inline` is the bridge.** Tailwind v4's `@theme inline` maps each token to a `var()`
so utilities like `bg-canvas`, `rounded-card`, `text-scaled-lg`, and `tap-target` resolve the
*live* custom property at the element. That is why flipping one data-attribute on the shell
re-themes everything below it without re-rendering a single component.

**Type and density are decoupled levers.** `--type-scale` is a unitless multiplier on type
only; `--density-root` drives the root font-size (and the rem-based spacing scale) only. A
preset can grow type without tightening space (spacious, kids) or tighten space without
shrinking type — they are independent on purpose.

---

## 3. The evidence reframe (why "generation" means *preference*, not *age*)

The generation slider targets a **chosen** comfort/style preference. It does **not** infer or
act on a user's age. This is a deliberate, evidence-grounded decision:

- **"Generations" are not a real design variable.** Within-cohort variance is about equal to
  between-cohort variance; there is no defensible "Gen Z UI." (National Academies, 2020; Pew
  walked back generational framing in 2023.)
- **The "digital native" is a debunked myth.** Being born after a date does not make someone
  fluent with software. (Kirschner & van Merriënboer, 2013.)
- **The "8-second attention span" is fabricated** and misattributed; there is no credible
  source. (BBC; McKinsey.)
- **Dark mode is situational, not generational** — lighting, task, and preference drive it, not
  birth year. (Nielsen Norman Group.)

What **is** well-evidenced are the individual design *levers* and one hard floor:

- **The levers work on their own:** type size, contrast, density, target size, motion,
  saturation, ornament. Those are what the presets actually tune.
- **Aging is an accessibility floor, not a style.** Contrast-sensitivity loss reaches roughly
  83% by age 80 (W3C WAI-AGE); users 65+ are about 43% slower and abandon tasks at roughly
  twice the rate (NN/g). That is a **WCAG obligation**, not a preference — so accessibility is a
  floor at **every** preset, never a knob you can turn off.

**What this means for the system:**

- The friendly **names are an optional on-ramp**; the system targets the *preference* the name
  points at, and you can pick any preset regardless of age.
- **Accessibility is a floor at every preset.** All presets meet WCAG **AA**; the calm adult
  ends (spacious, classic) and **all** kids presets push toward **AAA** (7:1) and larger targets.
- **Target size is non-monotonic.** Targets are large at *both* the spacious end and the kids
  end, and smallest (but still ≥ 24px, the AA floor) only in the dense `bold` middle.
- **`prefers-reduced-motion` always wins.** A reduced-motion guard inside the generation layer
  zeroes the motion-duration tokens for *every* preset, so the motion-heavy presets (bold,
  playful, kids) collapse to a near-instant beat when the user asks for less motion.

> Sources (brief): National Academies 2020; Pew 2023; Kirschner & van Merriënboer 2013; BBC /
> McKinsey on the attention-span myth; NN/g on dark mode and on older-user performance; W3C
> WAI-AGE on contrast-sensitivity loss; NN/g on children's age-band UI needs.

---

## 4. The seven knobs and the presets

Every generation preset is the same seven knobs at different settings. Each preset is one
`[data-generation="…"]` block in `app/globals.css`; the typed mirror with member-facing copy is
[`lib/theme/generations.ts`](../lib/theme/generations.ts).

**The seven knobs**

| Knob | Token | What it does |
|---|---|---|
| Type scale | `--type-scale` | unitless multiplier on type only (decoupled from density) |
| Density | `--density-root` | root font-size → drives the rem spacing scale |
| Radius | `--radius-control` / `--radius-card` / `--radius-pill` | corner softness by role |
| Motion | `--motion-fast` / `--motion-base` / `--motion-slow` | interaction beat durations |
| Ornament | `--ornament` | 0–1 decorative intensity for the glow/strip/sheen layers |
| Contrast (floor) | base text/border tokens; `minContrast` in the registry flags AAA-target presets | AA everywhere; AAA at the calm + kids ends |
| Target size | `--tap-min` | interactive target floor; **non-monotonic** |

**The presets** (adult spectrum is calm → lively; kids are NN/g developmental age bands)

| Preset | Group | Type | Density | Motion | Ornament | Tap floor | Contrast floor |
|---|---|---|---|---|---|---|---|
| `spacious` | adult | largest (1.15) | roomy | minimal | flat (0.25) | 48px | AAA |
| `classic` | adult | 1.06 | airy | gentle | low (0.45) | 44px | AAA |
| `balanced` *(= DAWN default)* | adult | 1.0 | base | base | base (0.6) | 32px | AA |
| `bold` | adult | 0.96 (dense) | tight | livelier | high (0.8) | 26px (AA floor) | AA |
| `playful` | adult | 1.08 | comfortable | most | highest (1.0) | 46px | AA |
| `kids-early` (3–5) | kids | largest (1.3) | very low | purposeful | friendly (0.7) | 56px (~2cm) | AAA |
| `kids-mid` (6–8) | kids | 1.2 | low | purposeful | 0.65 | 50px | AAA |
| `kids-tween` (9–12) | kids | 1.1 | comfortable | gentle | 0.6 | 46px | AAA |

`balanced` is an explicit no-op anchor: it inherits the base feel unchanged, kept visible so the
contract is obvious and the registry/test have a selector to match.

**Skins and occasions, briefly.** Skins ([`lib/theme/skins.ts`](../lib/theme/skins.ts)) ship two
ids today — `default` (DAWN, the warm cream + amber baseline; it authors no override blocks) and
`midnight` (cool slate with the amber accent kept, sharper radii — proving palette *and* feel
both vary by skin). Occasions ([`lib/theme/occasions.ts`](../lib/theme/occasions.ts)) ship `none`
(baseline) and `solstice` (a gentle accent/ornament warm-up on a calendar window). Both stay
subtle so they read on any palette.

---

## 5. Adding an axis value (the recipes)

Every axis follows the same shape: **CSS block + registry entry + the guardrail test catches you
if you forget either half.** The core (shell, nav, rail) is never edited.

### Add a skin

1. **CSS** in `app/globals.css`: a light block `[data-skin="<id>"] { … }` **and** a dark block
   `.dark [data-skin="<id>"] { … }`. Override only the tokens that differ from base.
2. **Registry** in [`lib/theme/skins.ts`](../lib/theme/skins.ts): add the id to the `SkinId`
   union and a `SkinDef` (`{ id, label, description }`, in voice — plain, no em dashes).
3. **Test:** `skins.test.ts` already asserts every non-`default` id has both blocks. It fails the
   build if you author one half.

### Add an occasion

1. **CSS** as an unlayered block (authored after the `[data-skin]` blocks): `[data-occasion="<id>"] { … }`
   and its `.dark [data-occasion="<id>"] { … }` variant. Keep it to accent + ornament — it is an overlay.
2. **Registry** in [`lib/theme/occasions.ts`](../lib/theme/occasions.ts): extend `OccasionId`, add
   an `OccasionDef` with its `window: { start: 'MM-DD', end: 'MM-DD' }` (windows may wrap the
   year-end).
3. **Test:** the occasion guardrail test asserts the CSS pairing (same pattern as skins).

### Add a generation

1. **CSS** as an unlayered block (authored last, after occasion): `[data-generation="<id>"] { … }`
   tuning the feel knobs only (no palette). Hold the invariants — keep the 24px target floor; let
   the reduced-motion guard at the end of the generation blocks neutralize your motion tokens.
2. **Registry** in [`lib/theme/generations.ts`](../lib/theme/generations.ts): extend
   `GenerationId`, add a `GenerationDef` (`label`, plain `vibe`, `group`, `order`, `minContrast`).
3. **Test:** the generation guardrail test asserts the CSS block exists for the id.

---

## 6. The resolver chain and the cookie split

There are **two** cookies, by design, because mode and the new axes have different lifecycles:

| Cookie | Carries | Read where | Why separate |
|---|---|---|---|
| `freq-theme` *(localStorage)* | **mode** (light/dark/system) | a pre-paint inline script in `app/layout.tsx` | mode must resolve before first paint to avoid a dark flash; it predates the axes |
| `fxtheme` *(cookie)* | the **axes** (`gen` / `skin` / `occ`) | the server resolver, in RSC | server-readable so the axes render with zero flash; validated through the registry guards |

**The server resolver.** [`lib/theme/server/resolve.ts`](../lib/theme/server/resolve.ts) exposes
`resolveTheme()`. It is `server-only` (it reads the request cookie jar via `next/headers`), so the
layout calls it and the client never imports it. It returns a `ResolvedTheme` (`{ skin,
generation, occasion }`) that the shell sets as the three data-attributes.

**Precedence** (highest wins):

1. **Member `fxtheme` cookie** — the explicit personal override.
2. **Space default** — `spaces.skin` / `spaces.generation` (the operator's choice).
3. **System / time default** — `DEFAULT_*` for skin and generation; for occasion, the **calendar
   window** (`resolveOccasionForDate`), since occasion has no Space default unless the member pins
   one.

The cookie helper [`lib/theme/cookie.ts`](../lib/theme/cookie.ts) is deliberately client-safe (no
`server-only`, no `next/headers` import) so the client writer and the server reader share one
parse/serialize pair. `parseThemeCookie` validates every field through a registry guard and
**drops anything unknown** — a stale or hand-edited cookie can never push an invalid axis into the
shell.

Because the axes are resolved on the server from a cookie and written straight into the RSC
output, there is **no flash**: the first paint already carries the correct skin/occasion/generation.

---

## 7. The switch animation (View Transitions)

When a member changes an axis, the switch is animated with the **View Transitions API** so the
re-theme reads as one smooth cross-fade rather than a hard repaint. The switch is
**reduced-motion guarded**: when `prefers-reduced-motion` is set, the transition is skipped and the
new look applies instantly. ⏳ The client `ThemeProvider` / `useResolvedTheme` hook and the
View-Transitions switch are the remaining client pieces; the server resolution and the CSS axes are
already in place, so the system works (just without the animated switch) today.

---

## 8. SEO and the one-DOM guarantee

Every axis is **CSS-only variation over one canonical DOM.** There is no per-look URL, no
cloaking, no duplicated markup, and no content that changes by theme. A crawler sees the same
single document a member sees; only custom-property values differ. So the theming system is
**SEO-safe by construction** and adds no duplicate-content or rendering-divergence risk. (This
matters under [`docs/CONTENT-VOICE.md`](CONTENT-VOICE.md) §8: the content is identical; only its
presentation flexes.)

---

## 9. Children and safeguarding

Children are a **real, intended audience** (the `kids-*` presets exist for them). That makes two
things non-negotiable: the design must be right for the developmental age band, and the *exposure*
of the child experience must be gated behind a compliance and safeguarding track that lives
**outside this code change.**

### The design finding

Design to the **developmental age band**, never a generation label. Per Nielsen Norman Group's
age-band research (3–5 / 6–8 / 9–12), younger children need:

- **Larger targets** (~2cm; the `kids-early` floor is 56px) and **icon + label** navigation, not
  icon-only.
- **Purposeful, not constant, motion** — animation that signals something, never ambient.
- **Very low density** and **AAA contrast** (comprehension and motor skills are still developing).
- **Age-appropriate reading level.** "The same content" at the child end may require a
  **reading-level transform of the copy**, which is a *content* concern, separate from
  presentation. ⚠️ Flagged here: this theming system styles the surface; it does **not** rewrite
  copy for a reading level. That is a distinct workstream.

### The compliance and safeguarding gate (owned outside this change)

🔴 The child *experience exposure* is gated. Building the kids presets/tokens is fine; **shipping a
child-facing experience is blocked** until the policy and safeguarding track signs off. The
dependencies it owns:

- **COPPA** (US, under-13): verifiable parental consent, data minimization, no behavioral
  advertising, and constraints on AI/data features (this directly limits **Vera** and any data
  feature for a child).
- **UK Age Appropriate Design Code** ("Children's Code"), **GDPR-K**, and US **state
  age-appropriate-design laws**.

**Recommendation:** the child experience should be **guardian- or Space-provisioned and gated**,
not a free self-serve slider a child flips. Exposure stays blocked until the policy/safeguarding
track signs off.

**Scope note.** This document scopes the **design system**. It does **not** implement, certify, or
satisfy any of the above compliance requirements.

| Item | Status |
|---|---|
| `kids-*` presets + tokens (CSS + registry) | ✅ buildable now |
| Reading-level copy transform at the child end | ⚠️ separate content workstream, not built |
| Child-facing experience **exposure** | 🔴 gated on COPPA / AADC / GDPR-K / safeguarding sign-off |

---

## 10. Relation to the future native token export

When the mobile app arrives, web and native must share **one** token source so theming survives a
framework change. The plan ([`lib/tokens/README.md`](../lib/tokens/README.md)) is to extract the
DAWN values into a vendor-neutral **W3C Design Tokens** JSON and *generate* both the web CSS
variables and the native style constants from it. The four-axis model is designed to ride on that:
the axes are just token-set overlays, so once the base set is exported, skin/occasion/generation
become token-set deltas the same generator can emit, and the typed registries are the index the
generator enumerates. ⏳ Extraction is a Phase 5 (mobile) task; this doc records the seam so the
move is a planned step, not a retrofit.

---

## See also

- [`app/globals.css`](../app/globals.css) — the CSS axes, source-order precedence, `@theme inline` bridge.
- [`lib/theme/`](../lib/theme/) — the registries (`skins.ts`, `generations.ts`, `occasions.ts`), the
  cookie (`cookie.ts`), the server resolver (`server/resolve.ts`).
- [`docs/SPACES.md`](SPACES.md) — Spaces own the skin (and the per-Space generation default).
- [`docs/DESIGN.md`](DESIGN.md) — the DAWN design language the `balanced` / `default` baseline encodes.
- [`docs/DECISIONS.md`](DECISIONS.md) — [ADR-257](DECISIONS.md), the canonical decision.
</content>
