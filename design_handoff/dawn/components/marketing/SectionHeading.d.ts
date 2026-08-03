import * as React from 'react'

/**
 * The one marketing section header: tracked uppercase eyebrow → Anton display
 * H2 → optional italic kicker. Every page heading routes through this.
 */
export interface SectionHeadingProps {
  /** Tracked uppercase eyebrow (color set by tone). Accent the brand word. */
  eyebrow?: string
  /** The Anton display headline. Wrap an accent word in <span className="text-primary">. */
  title: React.ReactNode
  /** Italic "deck" line under the headline. */
  kicker?: string
  /** `ink` for use on a dark band. */
  tone?: 'light' | 'ink'
  align?: 'left' | 'center'
  /** `sm` for sub-section headings. */
  size?: 'default' | 'sm'
  className?: string
  style?: React.CSSProperties
}

export function SectionHeading(props: SectionHeadingProps): JSX.Element
