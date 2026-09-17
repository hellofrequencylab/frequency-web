import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Info, MapPin } from 'lucide-react'
import { getCircleContext } from '@/lib/circles/active-circle'
import { getVisibleSpaceBySlug } from '@/lib/spaces/store'
import { spaceCircleEventScope } from '@/lib/events/circle-upcoming'

// ── THE SPACE INFO BOARD (the `circle-space-info` layout module, ADR-1393) ───────────────────────
//
// A Space Circle is a Space's communications hub and its INFO BOARD (owner, 2026-09-17: *"their
// primary group communication and info board. The hub where anybody can engage, get updates, find
// group info, events, etc."*). Events arrived through the calendar arm in lib/events/circle-upcoming.ts.
// This block is the other half: who this Space is and where to find it, on the hub itself, so a
// member who lands on the Circle does not have to leave it to learn what they have walked into.
//
// 🔴 IT RENDERS ONLY ON A SPACE CIRCLE, and the gate is `spaceCircleEventScope`, the SAME resolver
// the calendar arm uses. Not a second reading of `is_space_primary`: the thing that must never
// happen here is the root tenant resolving as "the Space", because every personal Circle on the
// platform is stamped to root and this block would then print the platform's own details onto
// someone's private room. One resolver, one place to get that wrong, and it already refuses root.
//
// 🔴 IT READS THROUGH `getVisibleSpaceBySlug`, NOT THE SERVICE-ROLE CLIENT, and that is a
// correctness fix rather than a style choice. The sibling widgets in this directory read their own
// Circle's rows through the admin client, which is fine because the Circle's own gate already ran.
// This block reads a DIFFERENT entity: a Space has its own visibility, and a private or suspended
// Space can own a Circle whose door is open. A bypassing read would have published a private
// Space's description and locality to anyone who could open that Circle. `getVisibleSpaceBySlug`
// is the one reader that owns that rule (active status, plus owner-or-active-member for a private
// Space) and it fails closed, so the block simply does not render for a viewer who may not see the
// Space. It also keeps this file off the `check:admin-client` ratchet.
//
// WHY IT SELF-FETCHES. The circle context carries `space` as four columns (slug, name, brand_name,
// type) — enough for the header's host line, not enough for an info board.
//
// IT HIDES WHEN IT HAS NOTHING, like every other block in this rail. A Space with no tagline, no
// about and no locality renders nothing rather than a card with a name in it — the operator has not
// filled their profile in yet, and an empty box teaches the eye that the column is skippable.
// Measured 2026-09-17: of 21 Spaces, 18 have an about, 18 have a tagline, 17 have a city, and NONE
// has a street, which is why the street line is conditional and the locality is not assumed.

export const CircleSpaceInfo = async () => {
  const ctx = getCircleContext()
  if (!ctx) return null
  const { circle, myProfileId } = ctx

  // The one gate. Null for every ordinary Circle, and for the root tenant.
  const spaceId = spaceCircleEventScope(circle)
  if (!spaceId) return null

  // The Circle already told us WHICH Space; this read decides whether this viewer may see it.
  const slug = circle.space?.slug
  if (!slug) return null
  const space = await getVisibleSpaceBySlug(slug, myProfileId)
  if (!space) return null

  const label = space.brandName?.trim() || space.name
  const tagline = space.tagline?.trim() || ''
  const about = space.about?.trim() || ''
  // The locality only. `spaces.street` is deliberately NOT read: no Space in production has one,
  // and a street address is the field most likely to be a person's home, so a board that prints it
  // by default is a privacy decision nobody made.
  const where = (space.city ?? '').trim()

  // Nothing worth a card. The name alone is already on the cover pill and the host line.
  if (!tagline && !about && !where) return null

  return (
    <div className="@container rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-body-sm font-bold text-text">
        <Info className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
        About {label}
      </h3>

      <div className="flex items-start gap-3">
        {space.brandLogoUrl && (
          <Image
            src={space.brandLogoUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-control object-cover"
          />
        )}
        <div className="min-w-0 space-y-2">
          {tagline && <p className="text-body-sm font-medium text-text">{tagline}</p>}
          {about && (
            /* Clamped rather than truncated in JS: the full text stays in the DOM for a crawler and
               for anyone reading with a screen reader, and the card keeps a predictable height. */
            <p className="line-clamp-4 text-body-sm leading-relaxed text-muted">{about}</p>
          )}
        </div>
      </div>

      {where && (
        <p className="mt-3 flex items-start gap-2 text-body-sm text-muted">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
          <span className="text-text">{where}</span>
        </p>
      )}

      {/* The way back to the Space. Its ROOT only, deliberately: the Space's other tabs (calendar,
          shop, book) are each behind an operator function switch that can be off, and a rail box is
          the wrong place to discover that a link goes nowhere. The Space's own nav offers whichever
          of them this Space actually runs. */}
      <Link
        href={`/spaces/${space.slug}`}
        className="mt-3 inline-flex items-center gap-1.5 text-meta font-semibold text-primary-strong hover:underline"
      >
        Visit {label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  )
}
