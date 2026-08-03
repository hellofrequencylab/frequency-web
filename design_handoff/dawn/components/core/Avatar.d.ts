import * as React from 'react'

/**
 * A round member image with a warm initials fallback (amber-bg / primary-strong
 * text). Optional teal "online now" dot.
 */
export interface AvatarProps {
  /** Display name — used for the initials fallback and alt text. */
  name?: string
  /** Image URL. Falls back to initials when omitted. */
  src?: string
  /** Diameter in px (default 44). */
  size?: number
  /** Show the teal online dot. */
  online?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Avatar(props: AvatarProps): JSX.Element
