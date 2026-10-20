import Link from 'next/link'
import { EntityCard } from '@/components/cards/entity-card'
import { FqAvatar } from '@/components/frequency/members/shared/avatar'
import { getInitials } from '@/lib/utils'
import { SITE_DESIGN } from '@/lib/theme/design'

// THE PERSON TILE (LIVE-1086): one landscape card for a person who is not a profile row, a lead you met or a
// saved contact. FREQUENCY draws the members kit's `.card` with the kit avatar and `.tag` chips (the same
// card Members and Friends use); DAWN keeps the bordered tile it always had. Inlined at build.
const FREQUENCY = SITE_DESIGN === 'frequency'

export function PersonTile({
  href,
  name,
  sub,
  tags = [],
}: {
  href: string
  name: string
  /** One line under the name. */
  sub: string
  tags?: string[]
}) {
  if (FREQUENCY) {
    return (
      <EntityCard
        href={href}
        anchor={<FqAvatar url={null} name={name} size="m" />}
        title={name}
        context={sub}
        meta={tags.length > 0 ? tags.map((t) => <span key={t} className="tag">{t}</span>) : undefined}
      />
    )
  }
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:bg-surface-elevated"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary-bg text-body-sm font-semibold text-primary-strong select-none">
        {getInitials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-body-sm font-semibold text-text">{name}</span>
          {tags.map((t) => (
            <span key={t} className="shrink-0 rounded-md bg-surface-elevated px-1.5 py-0.5 text-3xs font-medium text-muted">
              {t}
            </span>
          ))}
        </span>
        <span className="mt-0.5 block truncate text-meta text-muted">{sub}</span>
      </span>
    </Link>
  )
}
