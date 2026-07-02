# The house icon system

> One coherent icon family (Phosphor), unlimited reach (Iconify), managed in The Loom.
> Reference icons by **meaning**, not by library. Spec + rationale: [ADR-505](DECISIONS.md).
> **Status legend:** ✅ shipped · 🔵 planned.

---

## 1. What we use

| Layer | Choice | Package |
|---|---|---|
| **Access layer** | Iconify (200k+ icons, offline build-time data) | `@iconify/utils`, `@iconify-json/*` |
| **House family** | **Phosphor** (`ph`) — MIT, six weights, best wellness/energy/award coverage | `@iconify-json/ph` |
| **Coverage escape hatch** | **Tabler** (`tabler`) — 6k+ icons for gaps | `@iconify-json/tabler` |

We use the **build-time packages**, not the Iconify runtime API: offline, deterministic, and the browser only receives the markup for icons actually rendered.

## 2. How to use it ✅

Reference icons by **meaning** through the semantic catalog, and render with the house `<Icon>`:

```tsx
import { Icon } from '@/components/ui/icon'
import { icon } from '@/lib/ui/icon-catalog'

<Icon name={icon('energy')} className="size-4 text-primary" />   // Zaps ⚡
<Icon name={icon('award')} className="size-5 text-ink" />         // rank ladder 🏆
<Icon name={icon('meditation')} className="size-6 text-muted" />  // practices 🪷
```

Need an icon not in the catalog yet? Either **add a semantic key** to `lib/ui/icon-catalog.ts` (preferred — keeps the indirection), or pass a raw name for a one-off: `<Icon name="ph:confetti" />`. Search names at [icones.js.org](https://icones.js.org) (filter to the `ph` set).

**Sizing & color.** `<Icon>` emits inline SVG with `currentColor`, so it colors from `text-*` DAWN tokens and sizes from `size-*` (or the `size` prop, default `1em`). No hex, no `text-[Npx]`.

**Accessibility.** Decorative by default (`aria-hidden`). Pass `aria-label` to announce it, or `title` for a tooltip.

## 3. The one rule: RSC-first ⚠️

`<Icon>` statically imports the full `ph` + `tabler` collections, so it belongs in **Server Components**. Do **not** import it into a `'use client'` module — that bundles the whole collection into client JS. In client components, keep using `lucide-react` for now; the client-side path (per-icon build-time tree-shaking via `unplugin-icons`) is part of the migration phase below.

## 4. Migration off `lucide-react` 🔵

Lucide is in ~893 files; the two coexist during migration. The semantic catalog makes it mechanical:

1. Adopt `<Icon>` + `icon('…')` in all **new** Server Component work.
2. Migrate high-traffic RSC surfaces in gated batches (each `tsc && lint && test` green), mapping the top Lucide icons to their Phosphor equivalents (see ADR-505 / the catalog).
3. Stand up the client-side tree-shaking path for `'use client'` surfaces.
4. Remove `lucide-react` only when the last call is gone.

## 5. Loom icon lane 🔵

The icon sets will be browsable in The Loom (`kind='icon'`) the same way code-drawn elements are (`lib/library/element-registry.tsx`: code is source of truth, The Loom indexes it read-only) — search across sets, with the **per-set license shown** for the white-label license audit ADR-505 flags.

---

*Routes per DOCS-PROTOCOL.md: this guide + ADR-505 → git. Icon names are verified against the installed
sets by `lib/ui/icon-catalog.test.ts`, so a rename fails CI rather than rendering an empty icon.*
