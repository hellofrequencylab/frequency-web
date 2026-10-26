// The one page-header grammar, shared by the Index / Stream / Dashboard / Focus
// templates. Detail pages keep their richer context band (badges + tabs) but use
// the same type scale. Match this and every page's title block reads the same —
// the cohesion the audits found missing (REDESIGN-INAPP defect #1/#5).
//
// Presentational + server-friendly (no hooks).

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { PageAdminBar } from '@/components/layout/page-admin-bar'

// The heading is the members kit's `.head` (design_handoff/frequency/templates/members/*.html open every
// page with it): the `.k` eyebrow, the Unbounded `.h1`, the `.meta` line, the actions bottom-aligned on
// the right and wrapping under on a phone. The design draws no rule under a head. The operator Settings
// control still renders, on its own line.

export function PageHeading({
  eyebrow,
  title,
  description,
  actions,
  back,
  adminBar = true,
  headingLead,
  visualMask,
}: {
  /** Small contextual kicker above the title (date, section, status). */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right controls — primary action / create menu / sort. */
  actions?: React.ReactNode
  /** Back-link shown above the eyebrow (Focus + nested pages). */
  back?: { href: string; label: string }
  /** Accepted for existing callers and ignored: the kit's head draws no rule. */
  divider?: boolean
  /** Accepted for existing callers and ignored: the kit's `.h1` is the one title size. */
  size?: 'default' | 'hero'
  /** Accepted for existing callers and ignored: the kit's head owns how actions wrap. */
  inlineActions?: boolean
  /** Accepted for existing callers and ignored: the kit's head bottom-aligns actions. */
  actionsAlign?: 'start' | 'end' | 'center'
  /** Render the operator on-page "Settings" admin bar on the header rule (default on). Set false on
   *  pages that carry their own customizer (e.g. Practices' per-user "Customize this page"), so the
   *  old operator page-layout customizer doesn't double up. A plain divider is drawn instead. */
  adminBar?: boolean
  /** Content for the LEFT of the header's divider row, opposite the Settings control. One short
   *  line: it shares that row and wraps under the controls on a narrow viewport. */
  headingLead?: React.ReactNode
  /**
   * Stamps `data-visual-mask` on the HEADING ROW (title block + actions), so the visual suite
   * paints over it (test/e2e/surfaces.ts, VISUAL_MASK_SITES; same contract as ModuleCard's
   * `visualMask`). Set it on a page whose eyebrow or title is a READING (the feed's date and
   * time-of-day greeting); leave it off a page whose heading is design surface.
   *
   * The row, not the h1, and the reason is geometry rather than taste: the title block is a
   * content-sized flex item (`min-w-0` beside a `shrink-0` action), so its width follows the
   * title text, and a mask on the h1 alone would be a box of a DIFFERENT WIDTH on two honest
   * captures. The row is column-wide whatever the words are, which is what a mask needs
   * (ADR-1277 §3: a mask paints a box and moves nothing). The divider row below, with its
   * operator Settings control, stays in the picture.
   */
  visualMask?: string
}) {
  return (
    <>
      <div className="head" data-visual-mask={visualMask}>
        <div className="min-w-0">
          {back && (
            <Link href={back.href} className="mu-back">
              <ChevronLeft aria-hidden />
              {back.label}
            </Link>
          )}
          {eyebrow && <p className="k">{eyebrow}</p>}
          <h1 className="h1">{title}</h1>
          {description && <p className="meta">{description}</p>}
        </div>
        {actions && <div className="mu-actions">{actions}</div>}
      </div>
      {adminBar ? <PageAdminBar asDivider lead={headingLead} /> : null}
    </>
  )
}
