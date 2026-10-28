import Link from 'next/link'
import { launchEntryEnabled } from '@/lib/launch/enabled'
import { FREE_SPOTLIGHT_LABEL, freeSpotlightHref } from '@/lib/launch/entry'

// THE "GET A FREE SPOTLIGHT" BUTTON (VLS-05). One server component for every public page that offers the
// doorway, so the label, the address and the on/off switch live in one place. It renders nothing while
// LAUNCH_ENTRY_ENABLED is off (and the launch itself is off), so a page that carries it is unchanged until
// the switch is turned on. The kit's own button classes, no CSS of its own.
export function FreeSpotlightButton({
  surface,
  detail,
  variant = 'ghost',
}: {
  surface: Parameters<typeof freeSpotlightHref>[0]
  detail?: string
  variant?: 'primary' | 'ghost'
}) {
  if (!launchEntryEnabled()) return null
  return (
    <Link className={variant === 'primary' ? 'btn fq-iri-btn' : 'btn btn-ghost fq-iri-rim'} href={freeSpotlightHref(surface, detail)}>
      {FREE_SPOTLIGHT_LABEL}
    </Link>
  )
}
