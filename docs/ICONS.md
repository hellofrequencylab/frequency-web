# The house icon system

> **Lucide stays primary** (the set the site already uses); Iconify adds unlimited reach so
> Phosphor/Tabler can **fill gaps** Lucide lacks. Reference icons by **meaning**, not by library,
> and the sets are managed in The Loom. Spec + rationale: [ADR-505](DECISIONS.md).
> **Status legend:** ✅ shipped · 🔵 planned.

---

## 1. What we use

| Layer | Choice | Package |
|---|---|---|
| **Primary family** | **Lucide** (`lucide`) — the set the site already ships (~897 files), kept as-is | `lucide-react`, `@iconify-json/lucide` |
| **Access layer** | Iconify (200k+ icons, offline build-time data) | `@iconify/utils`, `@iconify-json/*` |
| **Gap-fill** | **Phosphor** (`ph`) — MIT, six weights, strong wellness/energy/award coverage · **Tabler** (`tabler`) — 6k+ for anything else | `@iconify-json/ph`, `@iconify-json/tabler` |

We use the **build-time packages**, not the Iconify runtime API: offline, deterministic, and the browser only receives the markup for icons actually rendered. **No migration:** the existing `lucide-react` imports stay; the catalog just prefers Lucide and reaches for Phosphor/Tabler only where Lucide has no good glyph.

## 2. How to use it ✅

Reference icons by **meaning** through the semantic catalog, and render with the house `<Icon>`:

```tsx
import { Icon } from '@/components/ui/icon'
import { icon } from '@/lib/ui/icon-catalog'

<Icon name={icon('energy')} className="size-4 text-primary" />   // lucide:zap ⚡
<Icon name={icon('award')} className="size-5 text-ink" />         // lucide:trophy 🏆
<Icon name={icon('meditation')} className="size-6 text-muted" />  // ph:flower-lotus (gap-fill) 🪷
```

The catalog is **Lucide-first**: most meanings map to `lucide:*`; a few gaps map to `ph:*`/`tabler:*`. Need an icon not in the catalog yet? Either **add a semantic key** to `lib/ui/icon-catalog.ts` (preferred — keeps the indirection), or pass a raw name for a one-off: `<Icon name="lucide:confetti" />` (or `ph:`/`tabler:` for a gap). Search names at [icones.js.org](https://icones.js.org).

**Sizing & color.** `<Icon>` emits inline SVG with `currentColor`, so it colors from `text-*` DAWN tokens and sizes from `size-*` (or the `size` prop, default `1em`). No hex, no `text-[Npx]`.

**Accessibility.** Decorative by default (`aria-hidden`). Pass `aria-label` to announce it, or `title` for a tooltip.

## 3. The one rule: RSC-first ⚠️

`<Icon>` statically imports the full collections, so it belongs in **Server Components**. Do **not** import it into a `'use client'` module — that bundles the collection into client JS. In client components, use `lucide-react` directly (it *is* the primary set, so this is the normal path, not a stopgap). Only reach for `<Icon>` when you need a Phosphor/Tabler gap-fill in a Server Component. A client render path for gap-fill icons (per-icon build-time tree-shaking via `unplugin-icons`) is a follow-up if a client component ever needs one.

## 4. Adoption (no migration) ✅

There is **no rip-and-replace** — Lucide stays. Just:

1. New Server Component work references icons by meaning: `<Icon name={icon('…')} />`.
2. When Lucide lacks a glyph, add a semantic key pointing at `ph:*`/`tabler:*` (the gap-fill) rather than settling for a weak Lucide match.
3. The existing ~897 `lucide-react` files are left as-is; touch one only if you're already editing it for another reason.

## 5. Loom icon lane ✅

The installed sets are browsable in The Loom at **`/admin/library?lane=icons`** (`app/(main)/admin/library/icons-lane-view.tsx`), indexed read-only from `lib/library/icon-sets.ts` the same way code-drawn elements are (`lib/library/element-registry.tsx`: code is source of truth, The Loom indexes it). The lane shows each set with its **license, count, author, and samples** (the white-label license audit ADR-505 flags) plus the **house palette** rendered through the RSC `<Icon>`. Icons are code, so the lane governs and documents; it never edits an icon. Full cross-set search over every glyph needs a client render path and is a follow-up (§3).

---

*Routes per DOCS-PROTOCOL.md: this guide + ADR-505 → git. Icon names are verified against the installed
sets by `lib/ui/icon-catalog.test.ts`, so a rename fails CI rather than rendering an empty icon.*
