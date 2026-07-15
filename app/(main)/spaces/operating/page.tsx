import { Suspense } from 'react'
import Link from 'next/link'
import {
  Building2,
  Users,
  Settings2,
  Crown,
  Plus,
  Globe,
  ShoppingBag,
  CalendarCheck,
  Ticket,
  Contact,
} from 'lucide-react'
import { IndexTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EntityCard } from '@/components/cards/entity-card'
import { getMyProfileId } from '@/lib/auth'
import { listOperatedSpaces, type OperatedSpace } from '@/lib/spaces/operated'
import { spaceTypeLabel } from '@/components/spaces/space-type'

// "Spaces you run" — the operator's FRONT DOOR to the Spaces they own or admin (the hub the
// operator-context switcher links to as "Manage your spaces"). Distinct from /spaces/directory
// (browse the whole network) and /admin/spaces (the platform-wide operator table): this is the
// person's OWN set, each card opening that Space's /manage console.
//
// Composed, not authored (PAGE-FRAMEWORK §3): the Index template provides the header grammar and
// each Space renders through the shared EntityCard. The list is naturally scoped to the Spaces the
// caller operates (listOperatedSpaces re-derives ownership + active-admin membership from the DB),
// so the gate is simply "signed in". FRAMING note: this hub reads the operator set from real
// authority, never from the context cookie.

export const metadata = {
  title: 'Spaces you run',
  description: 'Open the management console for any Space you own or help run.',
}

// A dimension-matched skeleton grid — same shape/spacing as the real card grid, so the streamed
// grid lands with no layout shift (PAGE-FRAMEWORK §5.4).
function GridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  )
}

/** The brand anchor: the Space's logo (a plain <img>, like BrandMark/SpaceCard — an arbitrary
 *  operator URL), or a neutral building chip fallback. Decorative (alt=""): the card title carries
 *  the name, so the anchor is not announced twice. */
function SpaceAnchor({ logoUrl }: { logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- operator-supplied Space logo URL, not a build-time asset (matches BrandMark / SpaceCard)
      <img
        src={logoUrl}
        alt=""
        className="h-11 w-11 rounded-xl border border-border bg-surface object-contain"
      />
    )
  }
  return (
    <span
      className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-elevated text-subtle"
      aria-hidden
    >
      <Building2 className="h-5 w-5" />
    </span>
  )
}

/** One "space you run" card — a thin composition of the shared EntityCard, linking to that Space's
 *  /manage console. The type badge + an owner/admin marker + a member count read in the meta row. */
function OperatedSpaceCard({ space }: { space: OperatedSpace }) {
  const memberLabel =
    space.memberCount != null
      ? `${space.memberCount} ${space.memberCount === 1 ? 'member' : 'members'}`
      : null
  return (
    <EntityCard
      href={space.manageHref}
      anchor={<SpaceAnchor logoUrl={space.logoUrl} />}
      title={space.name}
      badge={
        <span className="shrink-0 rounded-full bg-surface-elevated px-2 py-0.5 text-2xs font-semibold text-muted">
          {spaceTypeLabel(space.type)}
        </span>
      }
      context={space.via === 'owner' ? 'You own this space' : 'You help run this space'}
      meta={
        <>
          <span className="flex items-center gap-1">
            {space.via === 'owner' ? (
              <Crown className="h-3 w-3" aria-hidden />
            ) : (
              <Settings2 className="h-3 w-3" aria-hidden />
            )}
            {space.via === 'owner' ? 'Owner' : 'Admin'}
          </span>
          {memberLabel && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden />
              {memberLabel}
            </span>
          )}
        </>
      }
    />
  )
}

// What a Business Space gives an operator — the concrete, benefit-led points on the no-spaces splash.
// Plain nouns, one honest benefit each (CONTENT-VOICE §3/§5, no hype words, no em dashes).
const SPACE_BENEFITS = [
  { Icon: Globe, title: 'One branded page', body: 'Everything you offer on a single page your people can find and share.' },
  { Icon: CalendarCheck, title: 'Bookings and payments', body: 'Take appointments and get paid without bolting on another tool.' },
  { Icon: ShoppingBag, title: 'A Shop that sells', body: 'List your products and services in the network members already browse.' },
  { Icon: Ticket, title: 'Events and tickets', body: 'Run an event and sell tickets from the same page you already keep.' },
  { Icon: Contact, title: 'One place for your people', body: 'Every contact, lead, and member tracked in your own CRM.' },
] as const

// The no-spaces splash — the operator has nothing to manage yet, so this SELLS the Business Space
// instead of showing a dead end. Composed from the kit (the card shell + the shared button classes),
// benefit-led in the camp-counselor voice: concrete usage, no hype, no narrated feelings, no em dashes.
// Primary CTA opens the same create flow as the header action; the secondary points to the directory.
function NoSpacesSplash() {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface p-8 sm:p-10">
      <div className="max-w-2xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary-strong">Go Business</p>
        <h2 className="text-balance text-2xl font-bold text-text sm:text-3xl">Run your whole business here</h2>
        <p className="mt-3 text-base leading-relaxed text-muted">
          You do not run any Spaces yet. A Business Space is one page for everything you sell, everyone
          you serve, and every event you run. Your people find it in the same network they already
          browse, so getting listed is getting discovered.
        </p>
      </div>

      <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        {SPACE_BENEFITS.map(({ Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary-strong">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">{title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-9 flex flex-wrap items-center gap-4">
        <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
          <Plus className="h-4 w-4" aria-hidden />
          Create a Space
        </Link>
        <Link href="/spaces/directory" className={buttonClasses('secondary', 'md')}>
          Browse the directory
        </Link>
        <p className="text-sm text-subtle">Free to start. One connected network, shared discovery.</p>
      </div>
    </section>
  )
}

async function OperatedGrid({ profileId }: { profileId: string | null }) {
  const spaces = await listOperatedSpaces(profileId)

  if (spaces.length === 0) {
    return <NoSpacesSplash />
  }

  // The container-query grid (each card sizes to the grid, not the viewport) stays portable across
  // rail/no-rail widths (PAGE-FRAMEWORK ADR-295).
  return (
    <div className="@container">
      <div className="grid grid-cols-1 gap-6 @lg:grid-cols-2 @2xl:grid-cols-3">
        {spaces.map((space) => (
          <OperatedSpaceCard key={space.id} space={space} />
        ))}
      </div>
    </div>
  )
}

export default async function SpacesOperatingPage() {
  // Gate: signed in. The list is naturally scoped to the Spaces the caller operates.
  const profileId = await getMyProfileId()

  return (
    <IndexTemplate
      title="Spaces you run"
      description="Open the management console for any Space you own or help run. This is your front door to the spaces you operate, separate from the directory you browse."
      action={
        <Link href="/spaces/new" className={buttonClasses('primary', 'md')}>
          <Building2 className="h-4 w-4" aria-hidden />
          Create a space
        </Link>
      }
    >
      <Suspense fallback={<GridSkeleton />}>
        <OperatedGrid profileId={profileId} />
      </Suspense>
    </IndexTemplate>
  )
}
