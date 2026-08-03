import * as React from 'react'

/**
 * The one Frequency surface card. A card means a *distinct object* — for lists,
 * group with a title + whitespace instead of a box each.
 *
 */
export interface CardProps {
  children: React.ReactNode
  /** `soft` borderless tint · `feature` hairline box · `elevated` pop shadow. */
  tone?: 'soft' | 'feature' | 'elevated'
  /** `xl` in-app cards · `2xl` marketing feature media. */
  radius?: 'lg' | 'xl' | '2xl'
  /** CSS padding value (default 1.5rem). */
  padding?: string
  /** Lift on hover (shadow-md + amber border) — for clickable cards. */
  hover?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Card(props: CardProps): JSX.Element
