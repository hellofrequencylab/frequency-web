// THE LEGAL PAGE FRAME, shared by /privacy, /terms, /guidelines, /space-email-policy and /accessibility: one
// body of text in the help article's reading layout (components/frequency/site/pages/legal/legal-reading.tsx).
// The reading column's `.hp-prose` dresses the plain elements, so the text carries no classes of its own;
// a boxed note wears the kit's `lg-note`.

import { FrequencyLegalReading } from '@/components/frequency/site/pages/legal/legal-reading'

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
  return (
    <FrequencyLegalReading title={title} updated={`Last updated: ${updated}`}>
      {children}
    </FrequencyLegalReading>
  )
}
