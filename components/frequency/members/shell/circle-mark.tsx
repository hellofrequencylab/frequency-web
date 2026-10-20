import { getInitials } from '@/lib/utils'

/** A Circle's mark in the rail (LIVE-1013, owner 2026-10-19: "use the profile/logo for each circle as the
 *  icon"): its own picture, cropped to the orb, or its initial when it has none. Decorative; the row's
 *  label or the link's aria-label names it. */
export function CircleMark({ label, image }: { label: string; image?: string | null }) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element -- an operator upload on any host, drawn at 36px
    return <img className="fqm-circle-img" src={image} alt="" loading="lazy" decoding="async" />
  }
  return <>{getInitials(label).slice(0, 1)}</>
}
