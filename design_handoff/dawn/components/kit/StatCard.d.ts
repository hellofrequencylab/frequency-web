import * as React from 'react'

/**
 * The operator register's number tile — the Dashboard template's unit. Never put
 * one on a primary member page: members see the four game counts, not analytics.
 */
export interface StatCardProps {
  label: React.ReactNode
  value: React.ReactNode
  unit?: React.ReactNode
  /** e.g. "+12%". Rendered with a trend glyph. */
  delta?: React.ReactNode
  direction?: 'up' | 'down' | 'flat'
  hint?: React.ReactNode
  /** Bare numbers for the sparkline. */
  spark?: number[]
  className?: string
  style?: React.CSSProperties
}

export function StatCard(props: StatCardProps): JSX.Element
