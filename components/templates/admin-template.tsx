// Admin template — the operator shell for /admin/* (PAGE-FRAMEWORK §3 + §8.1). The
// admin-nav sibling of Dashboard: it composes the SAME shared <PageHeading> grammar as
// every other template (so admin pages read identically to the rest of the app), adds
// the page's own content, and groups its body in <AdminSection> blocks.
//
// This promotes the old standalone `AdminPage` component into the first-class template
// kit — admin pages now live inside the framework like everything else. `AdminPage` is
// re-exported as an alias from @/components/admin/admin-page for back-compat.
//
//   <AdminTemplate title="Engagement" icon={Activity} eyebrow="Insights"
//                  description="Live first-party signal." actions={<Button>Export</Button>}>
//     <AdminSection title="Activation funnel">…</AdminSection>
//   </AdminTemplate>
//
// Presentational + server-friendly (no hooks). MUST stay client-importable — a few
// client components render it — so never read from next/headers here.

import type { LucideIcon } from 'lucide-react'
import { AdminFrameSection, AdminPageFrame } from '@/components/frequency/admin/admin-page-frame'

export function AdminTemplate({
  title,
  eyebrow,
  description,
  actions,
  back,
  hideBackLink = false,
  headless = false,
  children,
}: {
  title: string
  /** Accepted for existing callers; the admin shell's page head does not draw a title icon. */
  icon?: LucideIcon
  /** Small kicker above the title — usually the section group (e.g. "Insights"). */
  eyebrow?: React.ReactNode
  description?: React.ReactNode
  /** Right-aligned header controls (buttons, links). */
  actions?: React.ReactNode
  /** Accepted for existing callers; the admin shell's page head owns action alignment. */
  actionsAlign?: 'start' | 'end' | 'center'
  /** Explicit back-link. The shell's breadcrumb covers the parent trail; this adds a direct link. */
  back?: { href: string; label: string }
  /** Suppress the explicit back-link entirely — for a page that reads as a top-level
   *  workspace rather than a nested sub-page. */
  hideBackLink?: boolean
  /** Accepted for existing callers; the admin shell owns the settings bar. */
  adminBar?: boolean
  /** Accepted for existing callers; the admin shell owns page width. */
  width?: 'narrow' | 'default' | 'wide'
  /** Accepted for existing callers; the admin shell owns the vertical rhythm. */
  contentSpacing?: 'default' | 'tight'
  /** A full-bleed tool whose own frame carries its name (the CyberUnicorn portal): the page head is kept
   *  for screen readers but takes no room, so the tool starts at the top. */
  headless?: boolean
  children: React.ReactNode
}) {
  // Every admin page sits in the design's admin shell, so it wears the shell's page frame: the design's
  // head and section heads around the page's own content. An explicit back link is kept (the shell's
  // breadcrumb replaces the automatic one).
  return (
    <AdminPageFrame kicker={eyebrow} title={title} meta={description} actions={actions} back={hideBackLink ? undefined : back} headless={headless}>
      {children}
    </AdminPageFrame>
  )
}

/** A titled content block within an admin page. Optional description + right-side
 *  actions; renders a header row only when something is passed. */
export function AdminSection({
  title,
  description,
  actions,
  children,
}: {
  title?: string
  description?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <AdminFrameSection title={title} description={description} actions={actions}>
      {children}
    </AdminFrameSection>
  )
}
