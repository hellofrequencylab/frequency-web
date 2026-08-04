import Link from 'next/link'
import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

// Small round avatar anchor for the compact pulse rows — links to the person's
// profile. Plain presentational (no hooks), so it's usable from both the server
// pulse rows and the client welcome row.
export function PulseAvatar({
  href,
  displayName,
  avatarUrl,
}: {
  href: string
  displayName: string
  avatarUrl: string | null
}) {
  return (
    <Link href={href} className="shrink-0">
      {avatarUrl ? (
        <Image
          src={avatarSrc(avatarUrl)}
          alt={displayName}
          width={36}
          height={36}
          style={avatarFocusStyle(avatarUrl)}
          className="h-9 w-9 rounded-pill object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary-bg text-2xs font-semibold text-primary-strong select-none">
          {getInitials(displayName)}
        </div>
      )}
    </Link>
  )
}
