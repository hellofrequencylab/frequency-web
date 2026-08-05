import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'

// Small round avatar ANCHOR for the compact pulse rows — links to the person's
// profile. Plain presentational (no hooks), so it's usable from both the server
// pulse rows and the client welcome row.
//
// The disc itself is the one kit Avatar (components/ui/avatar.tsx) at its `sm` step; the
// only thing left here is the link, which is genuinely this component's job and is not
// something DAWN's Avatar does. `online` is forwarded rather than reimplemented, so a pulse
// row can show presence the day it has it — the thing neither old avatar could do.
export function PulseAvatar({
  href,
  displayName,
  avatarUrl,
  online,
}: {
  href: string
  displayName: string
  avatarUrl: string | null
  /** Presence, when the row has it. Omit and no dot is rendered. */
  online?: boolean
}) {
  return (
    <Link href={href} className="shrink-0">
      <Avatar src={avatarUrl} name={displayName} size="sm" online={online} />
    </Link>
  )
}
