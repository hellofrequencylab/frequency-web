# Theme + Template Protocol — one parent, scoped children, no drift

> **The answer, first.** Every visible surface on Frequency is governed by **one parent source per
> layer**, overridden by **scoped children**, and kept honest by a **CI drift-guard**. Change the parent
> and the whole site follows; a child can only override, never fork. This is the "parent/child theme"
> model, implemented on the CSS-variable cascade + a handful of single-source catalogs, not on file
> inheritance. This doc is the operating manual: edit through the parent, never around it.
>
> **Decision record:** [ADR-781](DECISIONS.md). **Pairs with** [PAGE-FRAMEWORK.md](PAGE-FRAMEWORK.md)
> (the shells), [THEME.md](THEME.md) (the token axes), [MENU-CONTRACT.md](MENU-CONTRACT.md) (the menu
> catalog), [DESIGN.md](DESIGN.md) (the DAWN language). **Status legend:** ✅ done · ⏳ in progress · 📋 planned.

---

## 1. The model

A "theme" here is **five layers**, each a *rate-of-change* boundary. Every layer has the same shape:

```
   PARENT (one source)  ──►  CHILD (scoped override)  ──►  guarded by a CI DRIFT-GUARD
```

The parent is what you edit for a **site-wide change**. The child is a *scoped* override (a Space, a
route, a section) that can only re-bind what the parent exposes. The drift-guard is a CI check that
fails a PR which tries to hand-roll around the parent. Nothing is enforced by discipline alone.

This maps to WordPress parent/child themes, but implemented the modern way: **layered design tokens on
the CSS custom-property cascade** (instant, no rebuild, RSC-native) + **single-source catalogs** for
structure/layout/menu, rather than PHP file overrides.

---

## 2. The five layers (the whole surface, covered)

| Layer | What an edit changes | **Parent** (the one place) | **Child** (scoped override) | **Site-wide command** | **Drift-guard** |
|---|---|---|---|---|---|
| **Style** | color · type · space · radius · shadow | `app/globals.css` DAWN tokens (Tailwind v4 `@theme inline`) | `[data-theme]` (dark) · per-Space `skin` · `AccentScope` · `page-theme` | edit a token in `globals.css` (or a DB Theme in Theme Studio) | `check:tokens` (no hardcoded hex / `text-[Npx]`) ✅ · registry↔CSS tests |
| **Structure** | headers · shells · page chrome | `components/templates/*` on one `PageHeading`; the one **`PageHero`** band | per-page template slots | edit `PageHero` / `PageHeading` / a template | `check:headers` (no page-level `<h1>` outside a template) ✅ |
| **Layout** | which modules render, where | module engine `page_settings.layout` **global `'*'` scope** | section → route → space | edit the `'*'` layout or `defaultLayoutFor` | resolver unit tests ✅ |
| **Copy** | words · hero images | `page_content` + `resolvePageContent` | per-route (per-space) override | edit the global/section `page_content` row | `check:canon` (voice) ⏳ shallow — see §7 |
| **Menu / rails** | admin menu · consoles · rail | the 3 catalogs → `appsForScope` (MENU-CONTRACT) | per-scope | edit a `*_MODULES` catalog row | `check:menu` ✅ + drift tests |

Three layers (**Style, Layout, Menu**) were already single-source parents before this protocol. This
protocol adds the **enforcement** the first two lacked, unifies **Structure** behind one header band,
and sets the **Copy** cascade as the next build (§7).

---

## 3. Style — the token cascade (parent/child, already shipped)

- **Parent:** `app/globals.css` — the DAWN semantic tokens (`--color-primary*`, `--color-ink*`,
  `--radius-card`, …) declared once on `:root` and exposed to Tailwind via `@theme inline`. Because the
  utilities reference the variables, overriding a variable on any subtree re-themes everything below with
  **no rebuild and no re-render**. Raw hex appears **only** in this file.
- **Children (scoped, compose over one DOM):** `.dark` (mode), per-Space **`skin`** (`[data-skin]`,
  whole-palette white-label), **`AccentScope`** (re-binds `--color-primary*` for a Space subtree — the
  tightest child-theme precedent), and per-Space **`page-theme`** (`[data-space-theme]`, fonts + radius).
  See [THEME.md](THEME.md) for the full four-axis model.
- **The rule (three-tier tokens):** primitives → **semantic** → component. Only the **semantic** tier is
  a theme's override surface, and a child may re-bind a *subset* of it. Components reference semantic
  tokens/utilities, never a raw primitive or a hex. This is the "theme contract": one canonical semantic
  set every theme fills.
- **Site-wide change example:** change the brand color everywhere → edit `--color-primary` (+ `-hover`/
  `-strong`/`-bg`) in `:root` and its `.dark` counterpart. Two blocks, one file. Done.
- **Drift-guard (new):** `check:tokens` fails a PR that hardcodes a hex, an `rgb()` literal, or a
  `text-[Npx]` in `.tsx`/`.ts` outside the allowlist (token/theme files, maps, raster OG images, color
  pickers) or without a `// token-ok: <reason>` escape hatch.

---

## 4. Structure — one header band, one shell kit

- **Parent:** the nine shells in `components/templates/*`, all composing one `PageHeading` grammar; and
  the one **`PageHero`** (`components/templates/page-hero.tsx`) — the canonical overlay-on-cover header
  band (the Business Spaces / Circles look) that **every hero-bearing surface renders**. `IndexTemplate`'s
  overlay hero and the commerce `MarketHero` both delegate to `PageHero`, so the header look is a **single
  edit** in one file. `PageHero` is token-clean (ink scrim + `text-on-ink`), replacing MarketHero's old
  hardcoded gradient.
- **Slots `PageHero` exposes:** `coverImage` (+ focal, or a gradient placeholder) · `eyebrow` · `title` ·
  `subtitle` · `avatar` · `badges` · `meta` · `actions` · `search` · `size` (standard/large) · `align`
  (start/center). Different page types fill different slots; the band is one component.
- **Children:** each page fills the template slots. It never re-authors a header, a back-link, or a cover.
- **Site-wide change example:** make every header taller / change the scrim / add a slot → edit
  `PageHero` once.
- **Drift-guard (new):** `check:headers` fails an `app/(main)/**/page.tsx` that hand-rolls a page-level
  `<h1>` instead of composing `PageHeading`/a template (escape hatch `// header-ok: <reason>` for genuinely
  special surfaces, e.g. a chat pane).
- **Entity vs index:** browse/index pages get the `PageHero` band via `IndexTemplate heroOverlay`; single
  entities (a Circle, a Space, an Event) get the same grammar via `DetailTemplate` (cover + band + tabs).
  Both share the tokens; unifying `DetailTemplate`'s band onto `PageHero` directly is a tracked follow-up.

---

## 5. Layout — the module engine (parent/child, already shipped)

- **Parent:** `page_settings.layout` at the **global `'*'` scope** (plus the coded `defaultLayoutFor`).
- **Children:** the same jsonb saved at a **section** (`/seg/*`), an exact **route**, or a **space** —
  `pickLayoutConfig` walks `space → route → section → global`, most-specific-wins, full override.
- **Site-wide change example:** change the default arrangement of a page's modules for everyone → edit
  the `'*'` layout (or `defaultLayoutFor`); a single route overrides by saving its own.
- **Drift-guard:** the editor and the renderer resolve through the *same* pure functions (`resolveSlots`,
  `moduleIdsForScope`), covered by `layout.test.ts` / `store.test.ts`, so what an operator arranges always
  matches what renders. Add a module = one meta entry + one registry binding.

---

## 6. Menu / rails — the locked catalog (parent/child, already shipped)

- **Parent:** exactly three catalogs — `SPACE_MODULES`, `ADMIN_MODULES`, `LAYOUT_MODULES` — that derive
  `APPS` → the rail (`appsForScope`) and both consoles (`resolveSpaceMenu` / `resolveEntityConsole`). One
  catalog row → every surface that shows the item.
- **Children:** per-scope role/entitlement gates on each catalog row.
- **Site-wide change example:** add/rename/rescope a menu item → edit one catalog row.
- **Drift-guard:** `check:menu` (a hard CI gate) fails any PR that hand-rolls a parallel menu list, plus
  drift tests asserting the console and rail resolve the identical set. This is the **gold-standard**
  pattern the other layers imitate. Full spec: [MENU-CONTRACT.md](MENU-CONTRACT.md).

---

## 7. Copy — the cascade to build next (⏳)

Today `page_content` + `resolvePageContent` is a real single-source parent, but it is **shallow** (title/
description/hero/CTA only), **opt-in per route** (`CONTENT_EDIT_ROUTES`), and has **no site→section→page
cascade**; body copy is hardcoded in components + `lib/page-editor/templates/*` + `lib/marketing/*`.

**The plan (Phase 2):** apply the proven layout-engine pattern to copy — a `site → section → page` content
resolver (nearest scope wins, unset falls through to the parent), widen the editable field set beyond the
header, and extend `check:canon` to scan `.tsx`/`.ts` string literals for the voice canon (it scans only
`content/*.md` today). Until then, keep member-facing copy on the naming/voice canons
([NAMING.md](NAMING.md) / [CONTENT-VOICE.md](CONTENT-VOICE.md)).

---

## 8. How to make a site-wide change (the cheat sheet)

| I want to change… | Edit this parent | It cascades to |
|---|---|---|
| The brand color / any color | `app/globals.css` token (`:root` + `.dark`) | every `bg-*`/`text-*` utility, all children |
| The header look (cover/scrim/slots) | `components/templates/page-hero.tsx` | every hero on the site |
| The title type scale / eyebrow | `components/templates/page-heading.tsx` | every shell's header |
| A card's radius everywhere | `--radius-card` in `globals.css` (+ migrate literal `rounded-2xl`) | every `rounded-card` |
| A page's default module layout | the `'*'` layout / `defaultLayoutFor` | every instance of that page |
| An admin menu item | a row in a `*_MODULES` catalog | the rail + both consoles |
| A per-Space brand look | that Space's `skin` / accent / page-theme | only that Space's subtree |

If your change needs a per-page edit to look right, it belongs in a **slot** or a **token**, not a fork.

---

## 9. How to add a new page/surface without drift (the recipe)

1. **Pick a shell** by what the content is (PAGE-FRAMEWORK §8.1) — never hand-roll a layout.
2. **Fill the header slots** (`title`/`eyebrow`/`description`/`actions`/`back`, and `heroImage` +
   `heroOverlay` for a hero band). No hand-rolled `<h1>`, no hand-rolled back-link or cover.
3. **Style with tokens only** — semantic utilities, no hex, no `text-[Npx]`.
4. **Register the rail** in `page-chrome.ts`; **assign modules** via the module engine, not hand-stacked
   sections.
5. **Add a menu item** (if any) as a catalog row.
6. **The gates enforce it:** `check:tokens`, `check:headers`, `check:menu`, tsc, eslint, and the resolver
   tests all run in CI. A drift attempt fails the PR, not a future audit.

---

## 10. Implementation plan (best practices, phased)

| Phase | Ships | Status |
|---|---|---|
| **P1 — Structure + enforcement** | The one `PageHero` band; `IndexTemplate` + `MarketHero` routed through it (MarketHero tokenized); the drifted manager + hand-rolled-header pages migrated; `check:tokens` + `check:headers` as **hard CI gates**; this doc + ADR-781. | ⏳ this PR |
| **P2 — Copy cascade** | Generalize `page_content` into a `site→section→page` cascade; widen editable fields; extend `check:canon` to `.tsx`/`.ts`. | 📋 |
| **P3 — Structure depth** | Unify `DetailTemplate`'s entity band onto `PageHero`; finish the `rounded-2xl → rounded-card` + literal-token migration so radius/type/spacing are fully parent-driven. | 📋 |
| **P4 — Operator theming** | Surface the child-theme axes (skin/accent/page-theme) + the `'*'` layout as operator controls with the theme-contract check, so a non-engineer makes a governed site-wide change. | 📋 |

**Best-practice guardrails carried throughout:** one canonical component per surface (no per-page copies);
tokens linted, not trusted; the editor and renderer share one resolver so preview never diverges from
render; every parent edit is one file; every child is a scoped override that the gate proves cannot fork.

---

*Owner: Daniel (Vision Steward). Created 2026-07-18. The operating manual for site-wide look + content.*
