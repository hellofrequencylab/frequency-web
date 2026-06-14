// Index template — the "list / discovery" shell (PAGE-FRAMEWORK §3, Template B).
//
// One grammar for browse pages (Circles, Channels, Events, Partners, Directory):
// a title + description, an optional header action (create/new), an optional
// toolbar (filters/search), over the list body. The body and any right rail are
// the page's own; this is the consistent chrome around them.
//
// The header is the shared <PageHeading> — the same title block Stream / Dashboard
// / Focus use, so every page reads the same.
//
// ── STRUCTURAL theming (the worked example) ──────────────────────────────────
// This template is the proof that a preset can change a page's LAYOUT, not just
// its color. It resolves the active generation (server-side, from the theme
// cookie) into a coarse `Structure` (lib/theme/structure.ts) and renders the SAME
// props/children into a DIFFERENT composition:
//
//   simple   → single-column body, roomier rhythm, larger header, narrower measure
//   standard → the current/default composition (unchanged)
//   dense    → one step denser card grids, compact rhythm + header
//
// Nothing about WHAT is shown changes — only its spacing, header scale, body
// measure, and the column count of the descendant card grids. It stays one DOM,
// server-rendered, and SEO-safe (no client hooks, no conditional content).
//
// Note: `resolveTheme()` reads the request cookie, so any page using this template
// renders DYNAMICALLY. That's acceptable for this proof. A follow-up can hoist the
// resolved structure to a layout-level context/prop so the cookie is read once per
// request (in the shell) instead of once per template — see docs/DECISIONS.md.

import { PageHeading } from './page-heading'
import { resolveTheme } from '@/lib/theme/server/resolve'
import { structureFor, type Structure } from '@/lib/theme/structure'
import { cn } from '@/lib/utils'

// ── Per-structure layout classes ─────────────────────────────────────────────
// Every value is a token-backed Tailwind utility (no hardcoded px, no hex). The
// `[&_.grid]:*` arbitrary variants retune the card GRIDS the callers already
// render inside `children`, so the column change lands without editing any page:
//   • simple collapses multi-column card grids to a single column (lower density,
//     larger effective targets) and only re-widens at the large breakpoint;
//   • dense pushes one extra column in at the large breakpoint;
//   • standard leaves the callers' own responsive grids exactly as authored.
// The `not-[.lg\:grid-cols-\[*\]]` style guard is avoided; instead we scope the
// override to plain card grids and leave the two-column "list + rail" shells
// (which use bracketed template-columns) untouched, since those aren't density
// grids. Accessibility floors (target size, contrast) are owned by the
// [data-generation] CSS and are never shrunk here.
const STRUCTURE_CLASSES: Record<Structure, { root: string; headerGap: string; toolbarGap: string; body: string }> = {
  // Calm + kids: one scannable column, generous rhythm, a narrower reading measure
  // so rows don't sprawl. Card grids are forced single-column until lg.
  simple: {
    root: 'max-w-4xl [&_.grid.sm\\:grid-cols-2]:grid-cols-1 [&_.grid.sm\\:grid-cols-2]:lg\\:grid-cols-2',
    headerGap: 'mb-2',
    toolbarGap: 'mb-6',
    body: 'space-y-10',
  },
  // The proven default — no layout change. (mb-0 here keeps PageHeading's own
  // built-in bottom spacing as the single source of header rhythm.)
  standard: {
    root: '',
    headerGap: '',
    toolbarGap: 'mb-4',
    body: '',
  },
  // Bold: tighter rhythm and one extra grid column at lg, so more lands on screen
  // at once — matching the preset's "more on screen" intent.
  dense: {
    root: '[&_.grid.lg\\:grid-cols-2]:lg\\:grid-cols-3 [&_.grid.lg\\:grid-cols-3]:lg\\:grid-cols-4',
    headerGap: '-mt-1',
    toolbarGap: 'mb-3',
    body: 'space-y-6',
  },
}

export async function IndexTemplate({
  eyebrow,
  title,
  description,
  action,
  back,
  toolbar,
  children,
}: {
  /** Small contextual line above the title. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action, e.g. a "New circle" button. */
  action?: React.ReactNode
  /** Back-link for a nested index (e.g. a sub-page under a dashboard). */
  back?: { href: string; label: string }
  /** Optional filter/search row under the header. */
  toolbar?: React.ReactNode
  children: React.ReactNode
}) {
  // Server Component: resolving the theme reads the request cookie (see header
  // note). The structure is a pure function of the resolved generation.
  const structure = structureFor((await resolveTheme()).generation)
  const s = STRUCTURE_CLASSES[structure]

  return (
    // `data-structure` is the single hook a downstream grid/component can read to
    // opt into a deeper structural change without editing this file again.
    <div data-structure={structure} className={cn(s.root)}>
      <div className={cn(s.headerGap)}>
        <PageHeading eyebrow={eyebrow} title={title} description={description} actions={action} back={back} />
      </div>
      {toolbar && <div className={cn(s.toolbarGap)}>{toolbar}</div>}
      <div className={cn(s.body)}>{children}</div>
    </div>
  )
}
