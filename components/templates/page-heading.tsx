// The one page-header grammar, shared by the Index / Stream / Dashboard / Focus
// templates. Detail pages keep their richer context band (badges + tabs) but use
// the same type scale. Match this and every page's title block reads the same —
// the cohesion the audits found missing (REDESIGN-INAPP defect #1/#5).
//
// Presentational + server-friendly (no hooks).

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageAdminBar } from '@/components/layout/page-admin-bar'

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  back,
  divider = true,
  inlineActions = false,
  actionsAlign = 'start',
  adminBar = true,
}: {
  /** Small contextual kicker above the title (date, section, status). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right controls — primary action / create menu / sort. */
  actions?: React.ReactNode
  /** Back-link shown above the eyebrow (Focus + nested pages). */
  back?: { href: string; label: string }
  /** Hairline under the header (default on; Focus can drop it for a lighter band). */
  divider?: boolean
  /** Keep the action beside the title on MOBILE too (default stacks it below).
   *  Use only for compact actions (a small button/menu) that fit next to a
   *  phone-width title without crushing it. */
  inlineActions?: boolean
  /** Vertical alignment of the actions block against the title block: 'start'
   *  (default, top-aligned) or 'end' — bottom-aligned with the last line of the
   *  description (dashboard header stats sit on the subtitle's baseline). */
  actionsAlign?: 'start' | 'end' | 'center'
  /** Render the operator on-page "Settings" admin bar on the header rule (default on). Set false on
   *  pages that carry their own customizer (e.g. Practices' per-user "Customize this page"), so the
   *  old operator page-layout customizer doesn't double up. A plain divider is drawn instead. */
  adminBar?: boolean
}) {
  return (
    <>
    {/* The header-to-body gap reads the STRUCTURE axis token (--structure-rhythm, set per
        [data-structure] on the shell root, lib/theme/structure.ts): the calm + kids ends flow
        roomier, the bold preset tighter, from the same header. The 1.25rem base equals the old
        sm:mb-5; the multiplier defaults to 1 so non-app surfaces (no [data-structure]) are
        unchanged. */}
    <div
      className="mb-4 sm:mb-[calc(1.25rem*var(--structure-rhythm,1))]"
    >
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-body-sm font-medium text-muted transition-colors hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      {/* Mobile: title + description get the full width and the action drops BELOW
          them (a wide button beside a phone-width title crushes the text into a
          sliver) — unless `inlineActions` keeps a compact action on the row.
          sm+: title left, action top-right — one balanced row; the title block is
          min-w-0 so a long title WRAPS rather than crushing the action, and the
          action is shrink-0 so it always keeps its place on the right. */}
      <div
        className={
          inlineActions
            ? 'flex flex-row items-start justify-between gap-3 sm:gap-4'
            : 'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4'
        }
      >
        <div className="min-w-0">
          {/* `eyebrow` is the kit utility now, not four hand-rolled Tailwind classes.
              Same rendered size; the change is tracking, 0.1em -> DAWN's 0.18em. */}
          {eyebrow && <p className="eyebrow mb-1.5 text-primary-strong">{eyebrow}</p>}
          {/* THE page title role. Was `text-lead sm:text-2xl` — 1.25rem on mobile, where
              DAWN's page title is 1.5rem at every width, so small screens got a heading
              a fifth smaller than the design and headings stepped at an arbitrary
              breakpoint instead of holding one role. `--text-page-title` rides
              --type-scale, so the generation axis reaches h1 for the first time. */}
          <h1 className="mb-1 text-balance text-page-title font-bold text-text">{title}</h1>
          {description && (
            <p className="max-w-2xl text-body-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions && (
          <div
            className={`shrink-0 ${
              actionsAlign === 'end' ? 'sm:self-end' : actionsAlign === 'center' ? 'sm:self-center' : ''
            }`}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
    {/* The header's hairline rule, with the on-page "Settings" split sitting inline on
        it (one line). When the page opts out of the divider (Focus), no rule is drawn
        and the Settings control, if any, sits on its own. A page can opt out of the admin
        bar entirely (adminBar=false) when it owns its own customizer — a plain rule is drawn. */}
    {adminBar ? (
      divider ? <PageAdminBar asDivider /> : <PageAdminBar />
    ) : divider ? (
      <div className="mb-5 border-b border-border sm:mb-6" />
    ) : null}
    </>
  )
}
