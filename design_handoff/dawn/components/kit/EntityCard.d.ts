import * as React from 'react'

/**
 * A card for a distinct OBJECT (a Circle, an event, a Journey, a Space). If the
 * thing is a row in a list, use RowCard instead.
 */
export interface EntityCardProps {
  /** Cover photograph. Real photography only. */
  cover?: string
  /** Lucide glyph name, rendered in the accent chip. */
  icon?: string
  eyebrow?: React.ReactNode
  title: React.ReactNode
  meta?: React.ReactNode
  children?: React.ReactNode
  footer?: React.ReactNode
  /** Which accent the chip and eyebrow take. */
  accent?: 'primary' | 'signal' | 'broadcast' | 'move'
  hover?: boolean
  className?: string
  style?: React.CSSProperties
}

export function EntityCard(props: EntityCardProps): JSX.Element
