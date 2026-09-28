import Link from 'next/link'
import { spaceFrontDoor, type SpaceViewer } from '@/lib/spaces/front-door'
import { buttonClasses } from '@/components/ui/button'

// The card at the foot of a Space's Home (LIVE-524). ONE component, mounted from BOTH trees, which
// is the only shape compatible with how the two differ:
//
//   • `app/(public)/spaces/[slug]/page.tsx` is ISR and has no viewer at all, so it passes
//     `anonymous` and nothing else is knowable there (ADR-1465, ADR-1526).
//   • `app/(main)/spaces/[slug]/(profile)/full/page.tsx` is dynamic, so it resolves the real
//     standing from `getMyMembership`.
//
// Duplicating the markup per tree would let the visitor pitch and the member pitch drift apart,
// which is the parallel-system trap this repo keeps naming. The SENTENCE is `spaceFrontDoor()`,
// pure and tested on its own; this file only renders it.
//
// Returns null on a null door, so "nothing to say" costs no markup and the caller can fall back.
export function SpaceFrontDoor({
  viewer,
  brandName,
  spaceSlug,
  tierCount,
}: {
  viewer: SpaceViewer
  brandName: string | null
  spaceSlug: string
  tierCount: number
}) {
  const door = spaceFrontDoor({ viewer, brandName, spaceSlug, tierCount })
  if (!door) return null

  return (
    <div className="mx-auto mt-14 max-w-xl rounded-card bg-surface-elevated p-6 text-center lift-1">
      <h2 className="font-section text-lead font-bold text-text">{door.title}</h2>
      <p className="mt-2 text-body-sm leading-relaxed text-muted">{door.body}</p>
      {door.action ? (
        <Link href={door.action.href} className={`${buttonClasses('primary', 'sm')} mt-4`}>
          {door.action.label}
        </Link>
      ) : null}
    </div>
  )
}
