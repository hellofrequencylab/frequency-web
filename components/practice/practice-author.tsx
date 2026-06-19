import Link from 'next/link'

// Author attribution for a practice — a small, quiet "by {Name}" link to the
// creator's profile (/people/{handle}). Shared by the library card footer and the
// practice detail header. Renders nothing when there's no human creator (some
// seeded/system practices have no author) or the profile lacks a handle.
//
// Presentational + server-friendly (no hooks). The name is its own link, so it
// only nests where the surrounding element is NOT already a link (the EntityCard
// `footer` slot sits outside the card's main anchor).
export function PracticeAuthor({
  creator,
  prefix = 'by',
  className = '',
}: {
  creator: { handle: string | null; display_name: string | null; avatar_url?: string | null } | null | undefined
  /** Lead-in word before the name ("by" on cards, "Created by" on the detail page). */
  prefix?: string
  className?: string
}) {
  if (!creator?.handle) return null
  const name = creator.display_name?.trim() || creator.handle
  return (
    <p className={`flex items-center gap-1.5 text-xs text-subtle ${className}`}>
      <span>{prefix}</span>
      <Link
        href={`/people/${creator.handle}`}
        className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-text hover:underline"
      >
        {creator.avatar_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatar_url} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
        )}
        <span className="truncate">{name}</span>
      </Link>
    </p>
  )
}
