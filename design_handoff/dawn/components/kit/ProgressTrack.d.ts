import * as React from 'react'

/** The honest progress read: a bar, or discrete steps when the thing has steps. */
export interface ProgressTrackProps {
  label?: React.ReactNode
  /** The right-hand read, e.g. "1 Journey to go". */
  hint?: React.ReactNode
  /** Completed amount; with `steps`, the number of filled steps. */
  value?: number
  total?: number
  /** Render as N discrete segments instead of a bar. */
  steps?: number
  accent?: 'primary' | 'signal' | 'broadcast' | 'move'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  style?: React.CSSProperties
}

export function ProgressTrack(props: ProgressTrackProps): JSX.Element
