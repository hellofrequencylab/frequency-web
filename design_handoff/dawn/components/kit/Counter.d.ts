import * as React from 'react'

/**
 * The member register's number. A glyph plus a tabular value: playful, small, and
 * never an analytics read (deltas and sparklines are StatCard, operator only).
 */
export interface CounterProps {
  /** Picks the glyph and the tone. */
  kind?: 'zaps' | 'gems' | 'streak' | 'airtime' | 'amplitude' | 'members' | 'circles'
    | 'events' | 'practices' | 'journeys' | 'trophies' | 'invites' | 'checkins'
  value: React.ReactNode
  /** Uppercase caption (tile shape) or a trailing word (inline). */
  caption?: React.ReactNode
  /** Override the glyph with any lucide name. */
  icon?: string
  /** Override the tone. */
  tone?: 'primary' | 'signal' | 'broadcast' | 'move'
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** `inline` in a row · `chip` standalone in chrome · `tile` stacked in a triad. */
  shape?: 'inline' | 'chip' | 'tile'
  /** Grey it out: a zero, a frozen streak, an inactive season. */
  muted?: boolean
  title?: string
  className?: string
  style?: React.CSSProperties
}

export function Counter(props: CounterProps): JSX.Element

export interface CounterRowProps {
  /** Max four. The four game counts, in order. */
  items: CounterProps[]
  size?: 'xs' | 'sm' | 'md' | 'lg'
  shape?: 'inline' | 'chip' | 'tile'
  divided?: boolean
  className?: string
  style?: React.CSSProperties
}

export function CounterRow(props: CounterRowProps): JSX.Element
