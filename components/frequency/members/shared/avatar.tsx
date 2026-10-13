import type { CSSProperties } from 'react'
import { avatarSrc } from '@/lib/images/avatar-focus'
import { getInitials } from '@/lib/utils'

// The kit's .av circle (.s 28 / default 40 / .m 48 / .l 96 / .xl 132) over a real photo, or the
// person's initials when they have none. Never a stock face: the design's photos are placeholders.
export function FqAvatar({
  url,
  name,
  size,
  className,
}: {
  url: string | null | undefined
  name: string
  size?: 's' | 'm' | 'l' | 'xl'
  className?: string
}) {
  const cls = ['av', size, className].filter(Boolean).join(' ')
  const style: CSSProperties | undefined = url ? { backgroundImage: `url("${avatarSrc(url)}")` } : undefined
  return (
    <span className={cls} style={style} role="img" aria-label={name}>
      {url ? null : <span className="fa-initials" aria-hidden>{getInitials(name)}</span>}
    </span>
  )
}

/** A .ph photo pane with a real image URL, or the bare placeholder ground when there is none. */
export function phStyle(url: string | null | undefined): CSSProperties | undefined {
  return url ? { backgroundImage: `url("${url}")` } : undefined
}
