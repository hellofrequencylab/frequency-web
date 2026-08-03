import * as React from 'react'

/**
 * The in-app season-rank pill (The Quest). Drives the `.rank-badge` primitive
 * off the rank spectrum so it reads in light and dark.
 */
export interface RankBadgeProps {
  /** A season rank (ghost·initiate·adept·master) or any spectrum color name
   *  (stone·clay·gold·olive·jade·teal·slate·indigo·plum·rose). */
  rank?: string
  /** Append the completion read ("2/3") for season ranks. */
  showStep?: boolean
  /** Override the label (defaults to the capitalized rank name). */
  children?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function RankBadge(props: RankBadgeProps): JSX.Element
