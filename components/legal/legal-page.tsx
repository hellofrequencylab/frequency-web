// THE LEGAL PAGE FRAME, shared by /privacy, /terms, /guidelines and /space-email-policy: one body of text,
// two designs (ADR-1737, build-time).
//
//   DAWN       the FocusTemplate column with the `prose` wrapper, exactly as each page rendered it inline.
//   Frequency  the help article's reading layout (components/frequency/site/pages/legal/legal-reading.tsx).
//
// The text inside carries its classes through LEGAL (below), never as literals: under DAWN they are the
// strings each page always used, so the DAWN markup is byte-identical; under Frequency they are empty and
// the reading column's `.hp-prose` dresses the plain elements.

import { FocusTemplate } from '@/components/templates'
import { FrequencyLegalReading } from '@/components/frequency/site/pages/legal/legal-reading'
import { SITE_DESIGN } from '@/lib/theme/design'

const FREQUENCY = SITE_DESIGN === 'frequency'

/** The classes a legal page's text wears. Undefined under Frequency (no class attribute at all). */
export const LEGAL = {
  /** A section heading. */
  h2: FREQUENCY ? undefined : 'text-body-lg font-semibold text-text',
  /** A paragraph. */
  p: FREQUENCY ? undefined : 'text-muted leading-relaxed',
  /** A bulleted list. */
  ul: FREQUENCY ? undefined : 'text-muted space-y-2 list-disc list-inside',
  /** Bold lead-in words. */
  b: FREQUENCY ? undefined : 'text-text',
  /** An inline link. */
  a: FREQUENCY ? undefined : 'text-primary-strong hover:underline',
  /** A boxed note (the draft banner on /terms). */
  note: FREQUENCY ? 'lg-note' : 'rounded-lg border border-border bg-surface-elevated p-4',
}

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  /** The date part of "Last updated: …", e.g. "October 6, 2026". */
  updated: string
  children: React.ReactNode
}) {
  const line = `Last updated: ${updated}`
  if (FREQUENCY) {
    return (
      <FrequencyLegalReading title={title} updated={line}>
        {children}
      </FrequencyLegalReading>
    )
  }
  return (
    <div className="min-h-screen bg-surface">
      <div className="px-6 py-16">
        <FocusTemplate title={title} description={line} width="default">
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none space-y-8">{children}</div>
        </FocusTemplate>
      </div>
    </div>
  )
}
