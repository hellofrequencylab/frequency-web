import * as React from 'react'

/**
 * The one header grammar. Pick the template, then open it with a PageHeading —
 * pages never hand-roll a title block.
 */
export interface PageHeadingProps {
  /** Uppercase grotesk kicker. Sentence content, not a label shout. */
  eyebrow?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Buttons, right-aligned. */
  actions?: React.ReactNode
  /** `page` default · `hero` for a Focus template · `section` inside a Detail. */
  size?: 'page' | 'hero' | 'section'
  className?: string
  style?: React.CSSProperties
}

export function PageHeading(props: PageHeadingProps): JSX.Element
