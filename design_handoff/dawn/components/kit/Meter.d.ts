import * as React from 'react'

/**
 * An allowance against a cap. The pricing model is caps plus take-rate, never
 * feature locks: a Space never shows a lock, it shows the room it has left.
 */
export interface MeterProps {
  label: React.ReactNode
  used?: number
  /** Omit for an unlimited allowance (renders an open, striped track). */
  cap?: number
  /** e.g. "contacts", "sends". */
  unit?: string
  /** e.g. "this month". */
  period?: string
  /** Overrides the automatic near/full line. */
  hint?: React.ReactNode
  size?: 'sm' | 'md'
  className?: string
  style?: React.CSSProperties
}

export function Meter(props: MeterProps): JSX.Element
