// Focus template — the no-rail work surface (PAGE-FRAMEWORK §3, "Focus mode").
//
// For centered, single-purpose surfaces that read best WITHOUT the community
// rail: compose / edit forms, settings, single-conversion + scan-confirm
// screens, account flows. The shell suppresses the global rail for these routes
// (lib/layout/page-chrome.ts → 'none'); this template gives them the matching
// centered width + shared header so they stop hand-rolling chrome.
//
// IMPORTANT: do not self-pad the page — the shell's <main> already provides the
// outer padding. This template only centers + constrains width (it replaces the
// per-page `px-6 py-8 max-w-2xl mx-auto` blocks that double-padded).
//
// Presentational + server-friendly (no hooks).

import { PageHeading } from './page-heading'

const WIDTHS = {
  narrow: 'max-w-lg',
  default: 'max-w-2xl',
  wide: 'max-w-3xl',
} as const

export function FocusTemplate({
  eyebrow,
  title,
  description,
  actions,
  back,
  width = 'default',
  divider = true,
  children,
}: {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** Back-link to the parent surface (e.g. "Settings"). */
  back?: { href: string; label: string }
  width?: keyof typeof WIDTHS
  divider?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${WIDTHS[width]}`}>
      <PageHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        actions={actions}
        back={back}
        divider={divider}
      />
      {children}
    </div>
  )
}
