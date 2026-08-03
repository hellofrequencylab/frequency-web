import * as React from 'react'

/**
 * One row in a list. Borderless with a hairline between rows — the "group, don't
 * box" list primitive. Pass exactly one of date / avatar / icon as the leading slot.
 */
export interface RowCardProps {
  icon?: string
  /** A date square: `{ mon: 'Aug', day: '6' }`. */
  date?: { mon: string; day: string | number }
  /** A rendered Avatar element. */
  avatar?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  trailing?: React.ReactNode
  accent?: 'primary' | 'signal' | 'broadcast' | 'move'
  divider?: boolean
  onClick?: () => void
  className?: string
  style?: React.CSSProperties
}

export function RowCard(props: RowCardProps): JSX.Element
