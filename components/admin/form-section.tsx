// Annotated settings section (ADR-233 §3 Settings, §4). Polaris app-settings layout:
// a left column of title + self-documenting description, a right column of controls.
// Stacks on mobile. Use one per setting group on a Settings page so the page explains
// itself and reduces support load. Presentational + server-friendly.
//
//   <FormSection title="Host payouts" description="Let hosts collect tips, ticket
//     sales, and store revenue. Turn off to pause all payouts platform-wide.">
//     <Toggle ... />
//   </FormSection>
//
// FREQUENCY (ADR-1740): the same two columns in the admin kit's words: a `.t1` title over a `.t2` note, the
// controls on the glass `.panel`, sections parted by the kit's hairline (admin-pages.css `.adp-formsec`).

import { SITE_DESIGN } from '@/lib/theme/design'

const FREQUENCY = SITE_DESIGN === 'frequency'

export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  if (FREQUENCY) {
    return (
      <section className="adp-formsec grid gap-x-8 gap-y-4 md:grid-cols-3">
        <div className="stack adp-tight md:col-span-1">
          <h3 className="t1">{title}</h3>
          {description && <p className="t2">{description}</p>}
        </div>
        <div className="md:col-span-2">
          <div className="panel">{children}</div>
        </div>
      </section>
    )
  }
  return (
    <section className="grid gap-x-8 gap-y-4 border-t border-border/70 py-6 first:border-t-0 first:pt-0 md:grid-cols-3">
      <div className="md:col-span-1">
        <h3 className="text-body-sm font-bold text-text">{title}</h3>
        {description && <p className="mt-1 text-body-sm leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="md:col-span-2">
        <div className="rounded-card border border-border bg-surface p-4 sm:p-5">{children}</div>
      </div>
    </section>
  )
}
