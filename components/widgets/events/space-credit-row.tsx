import Image from 'next/image'
import Link from 'next/link'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import type { SpaceHostLite } from '@/lib/events/active-event'

// ONE row for a SPACE credited on an event — the hosting Space at the top of the Host & Co Hosts
// section, and every Space co-hosting it underneath. Both used to be hand-rolled in two separate
// boxes (SpaceHostBox / CollaboratorSpacesBox); one row component keeps a Host and a Co Host
// visually identical apart from size and the role line, which is the whole point of the merge.
//
// Spaces render as a rounded SQUARE logo tile; people render as a round avatar. That shape contrast
// is how a member tells an owner-named Business Space ("Daniel Tyack") from the person of the same
// name inside one section (ADR-835 keeps the person/Space line structural, never name-based).
export function SpaceCreditRow({
  space,
  role,
  lead = false,
}: {
  space: SpaceHostLite
  /** The one-line role under the name: "Hosting this event" / "Co-hosting this event". */
  role: string
  /** The Host row leads the section at a larger size; Co Host rows sit under it. */
  lead?: boolean
}) {
  const box = lead ? 'h-12 w-12' : 'h-10 w-10'
  const px = lead ? 48 : 40

  return (
    <Link
      href={`/spaces/${space.slug}`}
      className="flex items-center gap-3 rounded-xl p-1 transition-colors hover:bg-surface-elevated"
    >
      {space.logoUrl ? (
        <Image
          src={avatarSrc(space.logoUrl)}
          alt={space.name}
          width={px}
          height={px}
          className={`${box} shrink-0 rounded-xl object-cover`}
          style={avatarFocusStyle(space.logoUrl)}
        />
      ) : (
        <div
          className={`${box} flex shrink-0 select-none items-center justify-center rounded-xl bg-primary-bg font-semibold text-primary-strong ${
            lead ? 'text-base' : 'text-sm'
          }`}
        >
          {getInitials(space.name)}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{space.name}</p>
        <p className="text-xs text-subtle">{role}</p>
      </div>
    </Link>
  )
}
