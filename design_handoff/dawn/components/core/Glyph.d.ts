import * as React from 'react'

/**
 * A React-owned Lucide icon. Use this ANYWHERE an icon is needed — never
 * `<i data-lucide>`, which `lucide.createIcons()` replaces out from under React
 * and unmounts the tree on the next render.
 *
 * Colour comes from `currentColor`, so set it on the parent.
 */
export interface GlyphProps extends Omit<React.SVGProps<SVGSVGElement>, 'name' | 'style'> {
  /** Lucide icon name, kebab-case, e.g. `calendar-days`. */
  name: string
  /** Rendered square size in px. Default 16. */
  size?: number
  /** Stroke width. Default 2; use 1.75 for large display glyphs. */
  stroke?: number
  className?: string
  style?: React.CSSProperties
}

export declare function Glyph(props: GlyphProps): React.ReactElement
