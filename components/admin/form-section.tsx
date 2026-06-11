// Annotated settings section (ADR-233 §3 Settings, §4). Polaris app-settings layout:
// a left column of title + self-documenting description, a right column of controls.
// Stacks on mobile. Use one per setting group on a Settings page so the page explains
// itself and reduces support load. Presentational + server-friendly.
//
//   <FormSection title="Host payouts" description="Let hosts collect tips, ticket
//     sales, and store revenue. Turn off to pause all payouts platform-wide.">
//     <Toggle ... />
//   </FormSection>

export function FormSection({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="grid gap-x-8 gap-y-4 border-t border-border/70 py-6 first:border-t-0 first:pt-0 md:grid-cols-3">
      <div className="md:col-span-1">
        <h3 className="text-sm font-bold text-text">{title}</h3>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="md:col-span-2">
        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">{children}</div>
      </div>
    </section>
  )
}
