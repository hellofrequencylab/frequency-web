import React from 'react'

// Custom-property url() values do not reliably resolve relative to the document,
// so the mask always gets an absolute href.
function absolute(src) {
  try { return new URL(src, document.baseURI).href } catch (e) { return src }
}

/**
 * BrandMark — the Frequency wordmark rendered as an engraved, tinted fill (the
 * `.brandmark` motif): the logo PNG is used as an alpha MASK, filled with warm
 * dark-sandy-brown, with a two-tone emboss + a slow amber shine sweep. Reads as
 * burnt-in, not flat. Hover lifts the catch-light; press deepens the engrave.
 * Pass the logo URL (relative to the host page) and a width.
 */
export function BrandMark({ logo, width = 200, height = 36, href, className = '', style }) {
  const mark = (
    <span
      className="brandmark"
      style={{ '--brand-logo': `url("${absolute(logo)}")`, width, height, ...style }}
      role="img"
      aria-label="Frequency"
    />
  )
  if (href) {
    return (
      <a href={href} className={`brandmark-link ${className}`} aria-label="Frequency — home">
        {mark}
      </a>
    )
  }
  return <span className={`brandmark-link ${className}`}>{mark}</span>
}
