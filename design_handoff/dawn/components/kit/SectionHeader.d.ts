import * as React from 'react'

/** Names a group without boxing it — the "group, don't box" primitive. */
export interface SectionHeaderProps {
  title: React.ReactNode
  /** A quiet mono count beside the title. */
  count?: number | string
  /** Text for the right-hand affordance ("See all"). */
  action?: React.ReactNode
  onAction?: () => void
  className?: string
  style?: React.CSSProperties
}

export function SectionHeader(props: SectionHeaderProps): JSX.Element
