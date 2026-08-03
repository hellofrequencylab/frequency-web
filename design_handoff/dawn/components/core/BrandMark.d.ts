import * as React from 'react'

/**
 * The Frequency wordmark rendered as an engraved, tinted fill (the `.brandmark`
 * motif): the logo PNG is an alpha mask, filled warm-brown, with a two-tone
 * emboss + slow amber shine. Hover lifts the catch-light; press deepens it.
 */
export interface BrandMarkProps {
  /** URL of the wordmark PNG (relative to the host page). It is used as a mask. */
  logo: string
  /** Render width in px (default 200). */
  width?: number
  /** Render height in px (default 36). Match the logo's aspect ratio. */
  height?: number
  /** Wrap in a link to this href. */
  href?: string
  className?: string
  style?: React.CSSProperties
}

export function BrandMark(props: BrandMarkProps): JSX.Element
