import * as React from 'react'

/**
 * A big display numeral over an uppercase label — the editorial way Frequency
 * shows counts. Group three for a stat strip.
 */
export interface StatProps {
  /** The number or short string (e.g. 24, "1.2k"). Anton display face. */
  value: React.ReactNode
  /** Uppercase caption under the value. */
  label: string
  /** `ink` for use inside a dark band. */
  tone?: 'light' | 'ink'
  className?: string
  style?: React.CSSProperties
}

export function Stat(props: StatProps): JSX.Element
