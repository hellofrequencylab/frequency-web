import * as React from 'react'

/**
 * The streak, told honestly: count, earned freezes, and the last seven days.
 * A miss is a hollow dot. Never red, never a guilt state.
 */
export interface StreakMeterProps {
  days?: number
  /** Earned or bought streak freezes. Hidden at zero. */
  freezes?: number
  /** Seven entries, oldest first. */
  week?: Array<'logged' | 'frozen' | 'missed' | 'today'>
  /** Personal best, shown right-aligned. */
  best?: number
  size?: 'md' | 'lg'
  showWeek?: boolean
  /** One plain line, e.g. "Never miss twice". No threats. */
  hint?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function StreakMeter(props: StreakMeterProps): JSX.Element
