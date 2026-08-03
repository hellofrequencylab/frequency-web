import * as React from 'react'

/**
 * A transient achievement / status notice (Quest awards, "saved", "you earned
 * 5 zaps"). Soft elevated surface with an amber accent rail and slide-up entrance.
 */
export interface ToastProps {
  /** Leading icon node, tinted by tone. */
  icon?: React.ReactNode
  title: React.ReactNode
  /** Optional secondary line. */
  children?: React.ReactNode
  /** Tints the icon + left rail. */
  tone?: 'primary' | 'success' | 'broadcast' | 'danger'
  /** Show a dismiss button wired to this handler. */
  onClose?: () => void
  className?: string
  style?: React.CSSProperties
}

export function Toast(props: ToastProps): JSX.Element
