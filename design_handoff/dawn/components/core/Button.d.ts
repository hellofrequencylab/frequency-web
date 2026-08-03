import * as React from 'react'

/**
 * The one Frequency action button. Amber `primary` is the only filled chrome
 * accent; `secondary` is the quiet outline; `ghost` is an inline text link.
 *
 */
export interface ButtonProps {
  children: React.ReactNode
  /** Visual role. `primary` = amber fill (the only filled chrome accent). */
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  /** Render as an <a>. Most marketing CTAs are navigations. */
  href?: string
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  /** Icon node rendered after the label (e.g. a lucide <ArrowRight/>). */
  iconRight?: React.ReactNode
  /** Icon node rendered before the label. */
  iconLeft?: React.ReactNode
  onClick?: (e: React.MouseEvent) => void
  className?: string
  style?: React.CSSProperties
}

export function Button(props: ButtonProps): JSX.Element
