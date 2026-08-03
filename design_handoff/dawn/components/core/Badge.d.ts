import * as React from 'react'

/**
 * A small status / category pill. Tones map to the semantic palette; use one
 * accent per row and reserve `broadcast` for comms, `signal` for the rare teal.
 */
export interface BadgeProps {
  children: React.ReactNode
  /** Semantic tone. `success` is the brand teal, never green. */
  tone?: 'neutral' | 'primary' | 'signal' | 'broadcast' | 'success' | 'warning' | 'danger'
  /** Fill with the tone color for a louder marker. */
  solid?: boolean
  /** Optional leading icon (e.g. a 12px lucide glyph). */
  icon?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function Badge(props: BadgeProps): JSX.Element
