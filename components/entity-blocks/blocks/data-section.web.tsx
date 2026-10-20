// THE ONE COMPONENT OF A DATA BLOCK'S AUTHORED PART (lib/entity-blocks/contract/{about,stats,offerings,...}.ts).
// A data block's body is drawn from the entity's live rows by its widget on the server; what the operator
// writes is the section's eyebrow and title, and this draws exactly that header.
export default function DataSectionHeader({ eyebrow, title }: { eyebrow?: string; title?: string }) {
  if (!eyebrow && !title) return null
  return (
    <header>
      {eyebrow ? <p className="eyebrow text-muted">{eyebrow}</p> : null}
      {title ? <h2 className="text-lead font-semibold text-text">{title}</h2> : null}
    </header>
  )
}
