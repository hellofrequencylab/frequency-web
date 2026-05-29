// Index template - the "list / discovery" shell (PAGE-FRAMEWORK §3, Template B).
//
// One grammar for browse pages (Circles, Interests, Events, Partners, Directory):
// a title + description, an optional header action (create/new), an optional
// toolbar (filters/search), over the list body. The body and any right rail are
// the page's own; this is the consistent chrome around them.
//
// Presentational + server-friendly (no hooks).

export function IndexTemplate({
  title,
  description,
  action,
  toolbar,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  /** Header-right action, e.g. a "New circle" button. */
  action?: React.ReactNode
  /** Optional filter/search row under the header. */
  toolbar?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text mb-1">{title}</h1>
          {description && (
            <p className="text-sm text-muted leading-relaxed max-w-2xl">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {toolbar && <div className="mb-4">{toolbar}</div>}
      {children}
    </div>
  )
}
