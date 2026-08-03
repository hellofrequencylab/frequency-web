import * as React from 'react'

/**
 * A warm, encouraging empty surface — icon chip + title + one line of guidance
 * + optional CTA. Never a cold "No data"; always point to the next human action.
 */
export interface EmptyStateProps {
  /** Icon node shown in the amber chip. */
  icon?: React.ReactNode
  title: string
  /** One line of guidance. */
  children?: React.ReactNode
  /** Optional CTA (e.g. a <Button/>). */
  action?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function EmptyState(props: EmptyStateProps): JSX.Element
