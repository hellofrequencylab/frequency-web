// Stream template — the "feed" shell (PAGE-FRAMEWORK §3, Template A).
//
// One grammar for chronological/ranked streams (the home Feed, a Circle feed, a
// profile timeline): a title + description, an optional composer slot at the top,
// an optional sort/filter control, over the stream body.
//
// Presentational + server-friendly (no hooks).

export function StreamTemplate({
  title,
  description,
  composer,
  sort,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Composer / create-post slot rendered above the stream. */
  composer?: React.ReactNode
  /** Sort/filter control shown on the header row (right side). */
  sort?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">{title}</h1>
          {description && (
            <p className="text-sm text-muted leading-relaxed max-w-2xl">{description}</p>
          )}
        </div>
        {sort && <div className="shrink-0">{sort}</div>}
      </div>
      {composer && <div className="mb-6">{composer}</div>}
      {children}
    </div>
  )
}
