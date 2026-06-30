# Adaptive theming: the four-axis model

> **The model, in one line.** A surface's look is composed from **four orthogonal axes**:
> mode, skin, occasion, and generation, each one attribute on the shell root, resolved
> through the CSS custom-property cascade. One canonical DOM, CSS-only variation, no
> per-look duplication.

> **The framing that matters most (read this first).** The **generation** axis targets a
> user-*chosen* comfort and style preference. It is **never an inferred age.** "Generations"
> are not a scientific category, and accessibility is a floor every preset must clear, not a
> style choice. Section 3 has the evidence; the names are an optional friendly on-ramp, not a
> claim about who you are.

Status legend: ✅ built · ⏳ partial · ⚠️ needs attention · 🔴 gated / not built · 🅿️ deferred (parked).

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
| **Occasion** | `data-occasion` on shell root | a light, time-boxed seasonal accent overlay | the calendar window, or a member pin via cookie | ✅ built end-to-end (DB-scheduled; a pin wins) |
| **Generation** | `data-generation` on shell root | the "feel": type scale, density, radius, motion, ornament, contrast floor, tap floor | the member's chosen preference, with a Space default | ✅ axis + resolver + member switcher (Settings → Appearance, §7) live; Space-default column shipped |

**Why three of them carry a registry.** Skin, occasion, and generation each have a typed
registry in [`lib/theme/`](../lib/theme/) that is the single place an id is declared, plus a
`resolve*` guard so an unknown value can never reach the DOM. A CSS⇄registry **guardrail
test** reads `app/globals.css` from disk and fails the build if a registered id is missing its
CSS block (or vice versa), so the two halves can never quietly drift. ✅ All three are live:
skins ([`skins.test.ts`](../lib/theme/skins.test.ts)),
generations ([`generations.test.ts`](../lib/theme/generations.test.ts)), and
occasions ([`occasions.test.ts`](../lib/theme/occasions.test.ts)) all follow the same pattern.

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
shrinking type. They are independent on purpose.

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
- **Dark mode is situational, not generational**: lighting, task, and preference drive it, not
  birth year. (Nielsen Norman Group.)

What **is** well-evidenced are the individual design *levers* and one hard floor:

- **The levers work on their own:** type size, contrast, density, target size, motion,
  saturation, ornament. Those are what the presets actually tune.
- **Aging is an accessibility floor, not a style.** Contrast-sensitivity loss reaches roughly
  83% by age 80 (W3C WAI-AGE); users 65+ are about 43% slower and abandon tasks at roughly
  twice the rate (NN/g). That is a **WCAG obligation**, not a preference, so accessibility is a
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
| Ornament | `--ornament` | 0 to 1 decorative intensity for the glow/strip/sheen layers |
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
| `kids-early` (3 to 5) | kids | largest (1.3) | very low | purposeful | friendly (0.7) | 56px (~2cm) | AAA |
| `kids-mid` (6 to 8) | kids | 1.2 | low | purposeful | 0.65 | 50px | AAA |
| `kids-tween` (9 to 12) | kids | 1.1 | comfortable | gentle | 0.6 | 46px | AAA |

`balanced` is an explicit no-op anchor: it inherits the base feel unchanged, kept visible so the
contract is obvious and the registry/test have a selector to match.

**Skins and occasions, briefly.** Skins ([`lib/theme/skins.ts`](../lib/theme/skins.ts)) ship two
ids today: `default` (DAWN, the warm cream + amber baseline; it authors no override blocks) and
`midnight` (cool slate with the amber accent kept, sharper radii, proving palette *and* feel
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
   union and a `SkinDef` (`{ id, label, description }`, in voice: plain, no em dashes).
3. **Test:** `skins.test.ts` already asserts every non-`default` id has both blocks. It fails the
   build if you author one half.

### Add an occasion

1. **CSS** as an unlayered block (authored after the `[data-skin]` blocks): `[data-occasion="<id>"] { … }`
   and its `.dark [data-occasion="<id>"] { … }` variant. Keep it to accent + ornament; it is an overlay.
2. **Registry** in [`lib/theme/occasions.ts`](../lib/theme/occasions.ts): extend `OccasionId`, add
   an `OccasionDef` with its `window: { start: 'MM-DD', end: 'MM-DD' }` (windows may wrap the
   year-end).
3. **Test:** the occasion guardrail test asserts the CSS pairing (same pattern as skins).

### Add a generation

1. **CSS** as an unlayered block (authored last, after occasion): `[data-generation="<id>"] { … }`
   tuning the feel knobs only (no palette). Hold the invariants: keep the 24px target floor; let
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

1. **Member `fxtheme` cookie**: the explicit personal override.
2. **Space default**: `spaces.skin` / `spaces.generation` (the operator's choice).
3. **System / time default**: `DEFAULT_*` for skin and generation; for occasion, the **calendar
   window**, since occasion has no Space default unless the member pins one.

**Occasion is now scheduled end-to-end.** The in-app shell layout ([`app/(main)/layout.tsx`](<../app/(main)/layout.tsx>))
prefers a **pin** first (a non-`none` occasion `resolveTheme()` already settled from the member
cookie or a code-registry window match); only when nothing is pinned does it auto-schedule from the
DB by calling [`resolveActiveOccasionSlug(now)`](../lib/theme/server/themes.ts), which scans the
active `kind='occasion'` theme rows and returns the first whose inclusive `MM-DD` window contains
today (**year-wrap aware**, e.g. `12-20`..`01-05`). It is request-cached and **fail-safe**
(`'none'` on any error or a missing table), so it never blocks render. When the result is `'none'`
the `data-occasion` attribute is simply omitted, so the baseline renders untouched.

The cookie helper [`lib/theme/cookie.ts`](../lib/theme/cookie.ts) is deliberately client-safe (no
`server-only`, no `next/headers` import) so the client writer and the server reader share one
parse/serialize pair. `parseThemeCookie` validates every field through a registry guard and
**drops anything unknown**: a stale or hand-edited cookie can never push an invalid axis into the
shell.

Because the axes are resolved on the server from a cookie and written straight into the RSC
output, there is **no flash**: the first paint already carries the correct skin/occasion/generation.

---

## 7. The member switcher (and the switch animation follow-up)

✅ **The member theme switcher is live** (ADR-261, BUILD-CATALOG §A.13 #1). Settings →
**Appearance** ([`app/(main)/settings/appearance/page.tsx`](<../app/(main)/settings/appearance/page.tsx>),
a `FocusTemplate`) lets a member pick the three server-resolved axes (palette / feel / seasonal
accent). The client switcher ([`theme-switcher.tsx`](<../app/(main)/settings/appearance/theme-switcher.tsx>))
reads its option copy straight from the typed registries and writes the choice through three server
actions ([`actions.ts`](<../app/(main)/settings/appearance/actions.ts>)) that **merge the chosen
axis into the `fxtheme` cookie via `serializeThemeCookie`** (one-year, path `/`, lax; mirroring
`THEME_COOKIE_ATTRS`) and `revalidatePath('/', 'layout')` so the new look renders flash-free on the
next request. Picking a system default clears that axis (the cookie is deleted when no axis remains).
An explicit occasion pin (incl. "Off" = `'none'`) now wins over the DB auto-schedule in the `(main)`
shell, honoring the §6 precedence (a member pin first). Light/dark **mode** stays the separate
localStorage toggle on the Settings home (§6 cookie split); this surface owns only the three axes.

⏳ **Still a follow-up — the animated switch.** When a member changes an axis the re-theme is a plain
server repaint today; the **View Transitions API** cross-fade (reduced-motion guarded: skipped when
`prefers-reduced-motion` is set) is the remaining client polish. The client `ThemeProvider` /
`useResolvedTheme` hook has no consumers after the per-request injection moved into the `(main)` shell
([`app/(main)/layout.tsx`](<../app/(main)/layout.tsx>)), so it is not currently mounted; mounting it
pairs with building this animated switch.

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
age-band research (3 to 5 / 6 to 8 / 9 to 12), younger children need:

- **Larger targets** (~2cm; the `kids-early` floor is 56px) and **icon + label** navigation, not
  icon-only.
- **Purposeful, not constant, motion**: animation that signals something, never ambient.
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

## 11. Theme Studio (back-end management)

> **In one line.** Theme Studio is a janitor-gated back-end at `/admin/appearance` where an
> operator creates, edits, and activates brand themes as **data** (DB-backed token overrides
> rendered as a scoped `<style>` over the code skins), with **no code deploy**.

> ✅ **Migrations applied (2026-06-14, Frequency Community).** Theme Studio and the other
> readers go live once the theming migrations are applied; they were applied to the Frequency
> Community project on 2026-06-14. The readers are fail-safe by design: before a migration is
> applied (e.g. a fresh environment) the reader returns `''` / empty and the app keeps rendering
> the **code skins** (`app/globals.css`) unchanged, so the system is dormant, not broken.

### What an operator can do

| Action | Effect |
|---|---|
| Create / edit a theme | Write color tokens (light + dark) and feel tokens with a live preview |
| Activate | Flip a theme's `status` to `active` so the runtime can render it |
| Set default | Mark the single global default skin theme (`is_default`) |
| Archive / delete | Take a theme out of rotation, or remove it |

A theme is one row, not a code change. Editing brand color, radius, motion, or density is a
save, not a deploy.

### The data model (`themes` table)

| Field | What it holds |
|---|---|
| `slug` | Unique id, matched against the resolved `data-skin` (or `data-occasion`); validated by `isSafeSlug` before it ever builds a selector |
| `name` | Operator-facing label |
| `kind` | `skin` (palette + feel bound to a `data-skin`) or `occasion` (seasonal overlay) |
| `tokens` | `{ light, dark, feel }` blocks of token-name → value |
| `status` | `draft` · `active` · `archived` |
| `is_default` | The single global default skin theme (partial unique index enforces one) |
| `window_start` / `window_end` | Inclusive `MM-DD` window for `kind='occasion'` (ignored for skins) |
| `created_by` / `created_at` / `updated_at` | Authorship + audit |

### The flow: editor → validate → store → inject

1. **Editor.** The operator sets color tokens (light + dark) and feel tokens (radius, motion,
   density, type-scale, ornament, tap-min) with a live preview.
2. **Validate (on save).** Every token name and value passes
   [`validateThemeTokens`](../lib/theme/validate.ts): an allowlist of token names plus strict
   per-type value validators. Anything not allowlisted, and any value carrying a CSS break-out
   (`;{}<>`, `url(`, comments, escapes, newlines), is **dropped**, never stored. Only the
   sanitized subset is saved.
3. **Store.** The sanitized `{ light, dark, feel }` lands in the row's `tokens` (JSONB).
4. **Inject (per request, in-app only).** The **in-app shell layout**
   ([`app/(main)/layout.tsx`](<../app/(main)/layout.tsx>)) calls
   [`loadActiveThemeCss`](../lib/theme/server/themes.ts), which loads the active `skin` theme
   matched to the resolved `data-skin` (and the active `occasion`), **re-validates** every row,
   and renders it through [`themeToCss`](../lib/theme/css.ts) into a scoped
   `<style id="fx-theme">`. This and the personal `fxtheme` cookie read live in the in-app shell,
   **not** the root layout, so the public marketing/discover pages stay static/prerendered (the
   root layout has no per-request reads). Each kind is rendered against the **attribute the shell
   actually sets**: `themeToCss('data-skin', …)` for a skin, `themeToCss('data-occasion', …)` for
   an occasion overlay (this fixed a bug where occasion themes emitted `[data-skin]` rules and so
   never matched). The `data-*` axis attributes are set on the **shell root** (a `:root`
   descendant), and the selectors are deliberately higher-specificity
   (`:root[<attr>="<slug>"]` / `:root [<attr>="<slug>"]`, `(0,2,0)+`) than the code skin /
   occasion rules (single attribute, `(0,1,0)`), so the DB theme wins regardless of stylesheet
   order.

### The security boundary

Operator-entered values get written verbatim into a server `<style>`, so validation is the
hard line. It is enforced **twice**: once on save (`validateThemeTokens`) and again at render
time before the row reaches the page (the DB is never trusted to be clean). The slug is
re-guarded by `isSafeSlug` before it builds any selector. Writes are service-role only; the
table's RLS exposes only `status='active'` rows to reads. The studio itself is **janitor-gated**.

### Activation rules

| Outcome | What it takes |
|---|---|
| A skin theme renders for its `data-skin` | `status='active'` **and** its `slug` matches the resolved skin |
| The global default skin | `is_default=true` (only one row may hold it) |
| An occasion theme renders | `kind='occasion'`, `status='active'`, slug matches the active `data-occasion` (auto-scheduled from the row's `MM-DD` window via `resolveActiveOccasionSlug`, unless a member/code pin already set the occasion) |
| Nothing matches | Reader returns `''` → the **code skins** render unchanged (fail-safe) |

### Server actions

Create / update / `setStatus` / `setDefault` / delete are server actions, janitor-gated, that
revalidate the layout so a change shows on the next request.

---

## 12. Per-Space branding (admin)

> **In one line.** An operator assigns each Space its theme and brand metadata from
> `/admin/spaces` (janitor-gated). The theme **assignment is the existing `spaces.skin`** axis;
> this work added the visual brand fields beside it. ✅ data + admin shipped; ✅ the header
> visual (logo / name in the chrome) is now live.

### What an operator can do

From the Space branding editor (`/admin/spaces/<id>`), an operator sets:

| Field | What it holds | Validation (server-side) |
|---|---|---|
| **Theme** (`spaces.skin`) | the `[data-skin]` token set the Space renders | must be a **known active skin theme** or a built-in (`default` \| `midnight`) |
| `brand_name` | display name (falls back to `spaces.name`) | trimmed, length-capped, or cleared |
| `brand_logo_url` | the Space's logo | **same-origin** (root-relative `/…`) **or** an `https` URL |
| `brand_accent` | a reference accent swatch | a safe **hex** or strictly-numeric `rgb`/`hsl` (CSS break-outs rejected) |

The palette still comes from the assigned theme (`spaces.skin`); `brand_accent` is a reference
swatch, not the live palette.

### How the header visual works

When a Space sets a brand, it leads the header in place of the default engraved Frequency
wordmark, so a white-label Space looks like its own product. The prop flow is one straight line,
all fail-safe:

1. **Resolve (server).** [`(main)/layout.tsx`](<../app/(main)/layout.tsx>) resolves the Space for
   the request host and reads `brand_name` / `brand_logo_url` off it, passing them to `AppShell`
   as `brandName` / `brandLogoUrl`. The whole resolution sits inside a `try/catch` that falls
   back to the default mark (no Space, a lookup failure, or a pre-migration environment all land
   on the default), so the header never breaks.
2. **Forward (shell).** [`app-shell.tsx`](../components/layout/app-shell.tsx) forwards both props
   straight to `<BrandMark name={brandName} logoUrl={brandLogoUrl} />`.
3. **Render (mark).** [`brand-mark.tsx`](../components/layout/brand-mark.tsx) picks, in order: a
   **logo** (rendered via a guarded `<img>`) if `logoUrl` is set, else the **brand name** as
   wordmark text if `name` is set, else the **default** engraved Frequency wordmark. The logo is
   an operator-supplied URL (not a build-time asset), so it renders via a plain `<img>` like the
   other operator covers, with the `next/image` lint suppressed for that one line.

**The guarded `<img>` is safe because the URL is validated at write time.** `brand_logo_url` can
only ever be a **same-origin** root-relative path or an `https` URL: `updateSpaceBranding`
(`isSafeLogoUrl`) rejects anything else before it is stored, so the mark trusts a value the
server already cleared. The render path is otherwise inert: it sets `alt` from the brand name and
links home, no operator string reaches a style or script.

### Data model + flow

- **Migration:** [`20260626000000_space_brand.sql`](../supabase/migrations/20260626000000_space_brand.sql)
  adds `spaces.brand_name` / `brand_logo_url` / `brand_accent` (additive, idempotent).
- **Store:** [`lib/spaces/store.ts`](../lib/spaces/store.ts) reads the brand columns onto `Space`.
- **Action:** `updateSpaceBranding` ([`app/(main)/admin/spaces/actions.ts`](<../app/(main)/admin/spaces/actions.ts>))
  is **janitor-gated** and validates every field server-side before the write, then revalidates the
  admin list **and** the in-app shell (a skin change repaints every Space surface).

### Status

| Item | Status |
|---|---|
| `brand_*` columns + store reads | ✅ shipped (migration apply pending, see below) |
| Janitor-gated branding editor + validated action | ✅ shipped |
| **Header brand visual** (logo / name shown in the chrome) | ✅ shipped: `BrandMark` renders the Space logo (guarded `<img>`) / name in place of the default wordmark; `(main)/layout.tsx` passes `brandName` / `brandLogoUrl`, fail-safe to the default mark (unblocked by the events redesign merge) |

---

## 13. Page layout manager (admin)

> **In one line.** An operator overrides any route's **right rail** from `/admin/page-layout`
> (janitor-gated), stored as a fail-safe DB layer **over** the code chrome map. ✅ management +
> storage + resolver shipped; ✅ the **live shell** now reads the override, so an operator
> override takes visible effect on the next request.

### How it composes with the code map

The code chrome map ([`lib/layout/page-chrome.ts`](../lib/layout/page-chrome.ts)) stays the source
of truth: `railFor` / `leftRailFor` remain the pure, synchronous baseline (PAGE-FRAMEWORK §3/§8),
and the operator layer is a fail-safe **merge over** them, never a replacement. This work is
**additive**:

- **Migration:** [`20260626100000_page_chrome_overrides.sql`](../supabase/migrations/20260626100000_page_chrome_overrides.sql)
  adds `page_chrome_overrides` (`route` → `rail`, RLS on, world-readable, service-role writes).
- **Resolver:** `loadChromeOverrides` (request-cached, **fail-safe** `{}` on any error / missing
  table) + the pure `mergeChrome` (an exact-route override wins over the code default) +
  `resolvePageChrome` (the async, override-aware twin of `railFor`).
- **Live shell:** [`(main)/layout.tsx`](<../app/(main)/layout.tsx>) loads the overrides once
  server-side (`loadChromeOverrides`, fail-safe `{}`) and passes them to the client shell as
  `chromeOverrides`; [`app-shell.tsx`](../components/layout/app-shell.tsx) then computes its right
  rail as `mergeChrome(railFor(pathname), chromeOverrides, pathname)` instead of bare `railFor`,
  so an operator override takes **visible** effect. The left rail (`leftRailFor`) is unchanged.
- **Admin:** the manager (`/admin/page-layout`) lists the curated `MANAGED_ROUTES` with each
  route's current effective rail and sets an override; the actions are **janitor-gated** and
  validate `route` / `rail` (`isSafeRoute` / `isRail`) before any write.

### Status

| Item | Status |
|---|---|
| Override table + janitor-gated manager | ✅ shipped (migration apply pending, see below) |
| `loadChromeOverrides` + `mergeChrome` + `resolvePageChrome` (fail-safe) | ✅ shipped |
| **Live shell adoption** (the shell merges the override into its rail) | ✅ shipped: `app-shell.tsx` computes `mergeChrome(railFor(pathname), chromeOverrides, pathname)`; `(main)/layout.tsx` loads `loadChromeOverrides` server-side (fail-safe `{}`) and passes `chromeOverrides` (unblocked by the events redesign merge) |

---

## 14. Still pending (whole theming system)

| Item | Status |
|---|---|
| The three migrations (`20260625000000_themes`, `20260626000000_space_brand`, `20260626100000_page_chrome_overrides`) | ✅ applied to Frequency Community (2026-06-14). Fail-safe before apply in any fresh environment (code skins, branding columns absent, chrome overrides `{}`) |
| Per-Space **header brand visual** (logo / name in the chrome) | ✅ shipped: `BrandMark` renders the Space logo / name in the header, fail-safe to the default mark (§12) |
| Page-layout **live shell adoption** (shell merges the override into its rail) | ✅ shipped: `app-shell.tsx` uses `mergeChrome(railFor, chromeOverrides, pathname)` (§13) |
| **Member theme switcher** (Settings → Appearance writes the `fxtheme` cookie) | ✅ shipped: the three server-resolved axes are member-pickable; an explicit pin (incl. occasion "Off") wins per §6/§7 (ADR-261) |
| The **generation / demographic** axis as editable data | 🅿️ deferred (the code axis stands; Theme Studio does not yet manage it) |
| Per-Space theme assignment | ✅ shipped (it is the existing `spaces.skin`, now set from `/admin/spaces`, §12) |
| Occasion auto-resolution from the DB `MM-DD` windows | ✅ shipped (`resolveActiveOccasionSlug`, wired in the in-app shell, §§1, 6) |
| Template-per-page (a theme scoped to a page template) | 🔴 not built |
| Client `ThemeProvider` / View-Transitions switch (`ThemeProvider` has no consumers after the injection moved to the `(main)` shell, so it is not currently mounted) | ⏳ tracked in §7 (the switcher itself is shipped; only the animated cross-fade remains) |
| **Structure axis wired** (`structureFor` → `data-structure` on the shell root) | ✅ shipped: the `(main)` shell maps the resolved generation through `structureFor` and sets `data-structure`; `[data-structure]` retunes `--structure-rhythm`, consumed by the shared `PageHeading` header-to-body gap (the helper's first non-test caller) |

---

## See also

- [`app/globals.css`](../app/globals.css): the CSS axes, source-order precedence, `@theme inline` bridge.
- [`lib/theme/`](../lib/theme/): the registries (`skins.ts`, `generations.ts`, `occasions.ts`), the
  cookie (`cookie.ts`), the server resolver (`server/resolve.ts`).
- [`docs/SPACES.md`](SPACES.md): Spaces own the skin (and the per-Space generation default).
- [`docs/DESIGN.md`](DESIGN.md): the DAWN design language the `balanced` / `default` baseline encodes.
- [`docs/DECISIONS.md`](DECISIONS.md): [ADR-257](DECISIONS.md) (the four-axis model),
  [ADR-258](DECISIONS.md) (Theme Studio: themes as operator-editable data),
  [ADR-259](DECISIONS.md) (occasion scheduling fix + per-Space branding + page-chrome overrides),
  and [ADR-260](DECISIONS.md) (the shell now consumes the per-Space brand + page-chrome overrides).
</content>
