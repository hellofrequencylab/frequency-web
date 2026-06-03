import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import { EntityCard } from '@/components/cards/entity-card'
import { DemoBadge } from '@/components/ui/demo-badge'

// The one "person" card — Friends, Directory, and any people list render through
// this so a person reads identically everywhere. It wraps EntityCard with a round
// avatar anchor (+ optional online dot). Businesses/partners use EntityCard
// directly with an icon tile, since they aren't people.
export function PersonCard({
  handle,
  displayName,
  avatarUrl,
  online = false,
  context,
  meta,
  action,
  isDemo = false,
}: {
  handle: string
  displayName: string
  avatarUrl?: string | null
  /** Show the green "online now" dot on the avatar. */
  online?: boolean
  /** One-line under the name. Defaults to the @handle. */
  context?: React.ReactNode
  /** Footer row — role badge, region, etc. */
  meta?: React.ReactNode
  /** Floating top-right action (its own client component): Friend / Message / Accept… */
  action?: React.ReactNode
  /** Beta demo profile — badge it and grey it back behind real members. */
  isDemo?: boolean
}) {
  return (
    <EntityCard
      href={`/people/${handle}`}
      badge={isDemo ? <DemoBadge /> : undefined}
      dimmed={isDemo}
      anchor={
        <div className="relative">
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={displayName}
              width={44}
              height={44}
              className="h-11 w-11 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-bg text-sm font-semibold text-primary-strong select-none">
              {getInitials(displayName)}
            </div>
          )}
          {online && (
            <span
              aria-label="Online now"
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-surface"
            />
          )}
        </div>
      }
      title={displayName}
      context={context ?? `@${handle}`}
      meta={meta}
      action={action}
    />
  )
}
