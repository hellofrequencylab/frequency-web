// The kit draws avatars as round backgrounds (`.ap-me`, `.av`). This turns a stored avatar URL into
// that background, honouring the focus point a member picked (lib/images/avatar-focus.ts).

import type { CSSProperties } from 'react'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'

export function avatarBg(url: string | null | undefined): CSSProperties | undefined {
  if (!url) return undefined
  return {
    backgroundImage: `url(${JSON.stringify(avatarSrc(url))})`,
    backgroundPosition: avatarFocusStyle(url)?.objectPosition,
  }
}
