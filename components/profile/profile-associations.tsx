import Link from 'next/link'
import { BookOpen, Building2, CalendarDays, CircleDot, Lock, Sparkles, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { StatCard } from '@/components/ui/stat-card'
import {
  getProfileAssociations,
  type AssociationKind,
  type AssociationLink,
  type AssociationStat,
} from '@/lib/people/associations'

// The associations panel (ADR-895) — the answer to "why is this page here". An async Server
// Component: it does its own reads behind the parent's <Suspense>, so a six-read fan-out never
// blocks the hero's first byte.
//
// COMPOSED, NOT AUTHORED (docs/PAGE-FRAMEWORK.md §3): SectionHeader for the heading, StatCard for
// every number, plain Link rows for the peek. No hand-rolled header, no sixth bordered box, semantic
// tokens only.
//
// The privacy rules are NOT here. They live in lib/people/associations.ts as query predicates, which
// is the only place they can be enforced (that module reads through the admin client, where RLS does
// not fire). This file's one privacy-shaped job: a `count: null` tile is OMITTED, never rendered as
// a zero — null means the read failed, and printing "Circles 0" would publish a false statement
// about the member off a transient DB hiccup.

const KIND: Record<
  AssociationKind,
  { label: string; detail: string; icon: LucideIcon; chip: string; href: string }
> = {
  // `href` is the browse index each tile drills into. Deliberately NOT a `?host=` facet: no index
  // reads one, and a filtered link nothing honours is a dead link wearing a live one's clothes. The
  // peek rows carry the real per-item destinations. A real `?host=` facet is a separate workstream.
  circles: { label: 'Circles', detail: 'Hosting', icon: CircleDot, chip: 'Circle', href: '/circles' },
  // 🔴 /spaces has NO page.tsx — the index is /spaces/directory. Linking /spaces 404s the tile.
  spaces: { label: 'Spaces', detail: 'Running', icon: Building2, chip: 'Space', href: '/spaces/directory' },
  events: { label: 'Events', detail: 'Upcoming', icon: CalendarDays, chip: 'Event', href: '/events' },
  journeys: { label: 'Journeys', detail: 'Published', icon: BookOpen, chip: 'Journey', href: '/journeys' },
  practices: { label: 'Practices', detail: 'Published', icon: Sparkles, chip: 'Practice', href: '/practices' },
  classifieds: {
    label: 'Classifieds',
    detail: 'Active',
    icon: Tag,
    chip: 'Classifieds listing',
    href: '/classifieds',
  },
}

/** Total peek rows under the grid, across all kinds. Six is a glance, not a second index. */
const PEEK_ROWS = 6

export async function ProfileAssociations({
  profileId,
  handle,
  firstName,
  viewerProfileId,
  isOwner,
  blocked,
}: {
  profileId: string
  handle: string
  firstName: string
  viewerProfileId: string | null
  isOwner: boolean
  blocked?: boolean
}) {
  const { built, shared, mine } = await getProfileAssociations({
    profileId,
    viewerProfileId,
    isOwner,
    blocked,
  })

  // Only kinds with a real, non-zero number get a tile. A grid of zeroes reads as a broken page, and
  // a null count is a failed read, not an empty one.
  const tiles = built.filter((s): s is AssociationStat & { count: number } => (s.count ?? 0) > 0)
  const sharedRows = shared ?? []
  const ownGroups = mine ?? []

  // Nothing to say: render nothing at all, no heading and no empty frame — the ProfileAwards module
  // contract. The owner still gets the section, because for them it is an invitation.
  if (tiles.length === 0 && sharedRows.length === 0 && ownGroups.length === 0 && !isOwner) return null

  // The peek is one flat list capped across kinds, taken in tile order, so a member with six Circles
  // and one Journey still shows the Journey rather than six Circle rows.
  const peek: (AssociationLink & { chip: string })[] = []
  for (const stat of tiles) {
    for (const item of stat.peek) {
      if (peek.length >= PEEK_ROWS) break
      peek.push({ ...item, chip: KIND[stat.kind].chip })
    }
  }

  // NO CARD BACKGROUND (owner ruling, 2026-07-28): "No back ground, just a Preview card for any
  // Spaces, Circles, Journeys etc." In the right column this sits beside genuinely boxed panels
  // (Standing, Signature, Achievements), and a fourth box turns a glance into more furniture.
  // The tiles inside keep their own quiet surface, so the content still reads as grouped.
  return (
    <section className="space-y-1">
      <SectionHeader title={isOwner ? 'What you run' : `What ${firstName} runs`} />

      {/* Two-up at every width: this now lives in the 1/3 rail, where the old sm:grid-cols-3
          squeezed each tile below a readable width. */}
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {tiles.map((stat) => {
            const k = KIND[stat.kind]
            return (
              <StatCard
                key={stat.kind}
                label={k.label}
                // The Events read is capped, so above the ceiling the number is a floor. Say so with
                // a `+` rather than printing a confidently wrong exact count.
                value={stat.approximate ? `${stat.count}+` : stat.count}
                detail={k.detail}
                icon={k.icon}
                // Events is the one kind with a real per-host index.
                href={stat.kind === 'events' ? `/discover/events/organizer/${handle}` : k.href}
                // The tile reads "3 / Circles / Hosting" and links to the directory, which without
                // this says "3 Circles live in there". Name whose number it is and where the link
                // goes; only the Events tile has a genuinely per-person destination.
                title={
                  stat.kind === 'events'
                    ? `${stat.approximate ? 'At least ' : ''}${stat.count} upcoming ${stat.count === 1 ? 'event' : 'events'} ${isOwner ? 'you are' : `${firstName} is`} hosting. Opens their events.`
                    : `${stat.count} ${k.label.toLowerCase()} ${isOwner ? 'you' : firstName} ${k.detail.toLowerCase()}. Opens the ${k.label.toLowerCase()} directory.`
                }
              />
            )
          })}
        </div>
      )}

      {peek.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {peek.map((item) => (
            <li key={`${item.chip}-${item.id}`}>
              <Link
                href={item.href}
                // The label is `truncate`, so a long Circle or Space name is cut mid-word with no
                // way to read the rest. The title carries the full name plus what it is, which is
                // the only place the chip's meaning and the clipped text are both recoverable.
                title={`${item.label} (${item.chip})`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-body-sm text-text transition-colors hover:bg-surface-elevated"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                <span className="shrink-0 text-meta text-subtle">{item.chip}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Tier B — renders even when tier A is empty, which is what stops a new member's profile
          going from one association to none. Every Circle here is one the viewer is already in. */}
      {sharedRows.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-1.5 text-meta font-semibold text-muted">Circles you are both in</p>
          <div className="flex flex-wrap gap-2">
            {sharedRows.map((c) => (
              <Link
                key={c.id}
                href={c.href}
                // A bare pill with a name does not say it is a link to that Circle, and this row's
                // heading ("Circles you are both in") is the only context; the title restates the
                // destination so the pill stands on its own.
                title={`Open ${c.label}`}
                className="inline-flex items-center gap-1.5 rounded-pill bg-surface-elevated/60 px-2.5 py-1 text-meta font-medium text-text transition-colors hover:bg-surface-elevated"
              >
                <CircleDot className="h-3 w-3 shrink-0 text-subtle" aria-hidden />
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tier C — the owner's own picture, behind the treatment PrivateContactPanel established.
          aria-label so the privacy boundary is announced, not just coloured. */}
      {isOwner && ownGroups.length > 0 && (
        <div
          aria-label="Only you can see this"
          className="mt-4 rounded-card border border-border bg-surface-elevated/40 p-4"
        >
          <p className="mb-2 flex items-center gap-1.5 text-meta font-bold text-text">
            <Lock className="h-3.5 w-3.5 text-subtle" aria-hidden /> Only you can see this
          </p>
          <dl className="space-y-2">
            {ownGroups.map((g) => (
              <div key={g.key}>
                <dt className="text-meta font-semibold text-muted">{g.label}</dt>
                <dd className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {g.items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="text-body-sm font-medium text-text transition-colors hover:text-primary-strong"
                    >
                      {item.label}
                    </Link>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* The owner's zero state: three invitations, not an empty grid. All four /new routes are
          confirmed in the tree. */}
      {isOwner && tiles.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {[
            { href: '/circles/new', label: 'Host a Circle' },
            { href: '/events/new', label: 'Host an event' },
            { href: '/journeys/new', label: 'Publish a Journey' },
          ].map((cta) => (
            <Link
              key={cta.href}
              href={cta.href}
              className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-body-sm font-medium text-text transition-colors hover:bg-surface-elevated"
            >
              {cta.label}
            </Link>
          ))}
        </div>
      )}

      {isOwner && (
        <p className="mt-3 text-meta text-subtle">Drafts and private items stay off this list.</p>
      )}
    </section>
  )
}
