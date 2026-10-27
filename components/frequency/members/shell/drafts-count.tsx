/** The existing server-resolved proposal count, shared by actual Frequency menu rows. */
export function draftsBadgeLabel(count: number | undefined): string | null {
  if (count === undefined || !Number.isFinite(count) || count < 1) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}

export function DraftsCount({ href, count }: { href?: string; count?: number }) {
  const label = draftsBadgeLabel(count)
  if (href !== '/drafts' || label === null) return null
  return <b className="fqm-nav-count" aria-label={`${count} drafts waiting`}>{label}</b>
}
