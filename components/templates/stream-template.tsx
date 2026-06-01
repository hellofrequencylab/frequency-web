// Stream template — the "feed" shell (PAGE-FRAMEWORK §3, Template A).
//
// One grammar for chronological/ranked streams (the home Feed, a Circle feed, a
// profile timeline): a title + description, an optional composer slot at the top,
// an optional sort/filter control, over the stream body.
//
// Presentational + server-friendly (no hooks).

export function StreamTemplate({
  eyebrow,
  title,
  description,
  action,
  composer,
  sort,
  children,
}: {
  /** Small contextual line above the title (e.g. today's date). Adds weight to thin headers. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action, e.g. a create menu. */
  action?: React.ReactNode
  /** Composer / create-post slot rendered above the stream. */
  composer?: React.ReactNode
  /** Sort/filter control shown on the header row (right side). Use when there's no `action`. */
  sort?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6 pb-5 border-b border-border">
        <div>
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-strong mb-1.5">
              {eyebrow}
            </p>
          )}
          <h1 className="text-2xl font-bold text-text mb-1">{title}</h1>
          {description && (
            <p className="text-sm text-muted leading-relaxed max-w-2xl">{description}</p>
          )}
        </div>
        {(action || sort) && <div className="shrink-0">{action ?? sort}</div>}
      </div>
      {composer && <div className="mb-6">{composer}</div>}
      {children}
    </div>
  )
}
