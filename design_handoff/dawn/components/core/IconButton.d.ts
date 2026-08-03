import * as React from 'react'

/**
 * A compact icon-only control (reactions, kebab menus, toolbar actions). Quiet
 * by default; `active` lights it in a tone.
 */
export interface IconButtonProps {
  /** The icon node (e.g. a lucide glyph). */
  children: React.ReactNode
  /** Accessible label (also the tooltip). Required for icon-only buttons. */
  label: string
  /** Square size in px (default 36 — keep ≥ 36 for touch). */
  size?: number
  /** Active color. */
  tone?: 'neutral' | 'danger' | 'signal' | 'broadcast'
  /** Lit/selected state. */
  active?: boolean
  /** Round (pill) instead of rounded-square. */
  round?: boolean
  onClick?: (e: React.MouseEvent) => void
  className?: string
  style?: React.CSSProperties
}

export function IconButton(props: IconButtonProps): JSX.Element
