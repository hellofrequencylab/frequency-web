import * as React from 'react'

/** A custom warm checkbox — amber fill + check when on (the beta Oath gate, settings, filters). */
export interface CheckboxProps {
  checked?: boolean
  onChange?: (next: boolean) => void
  /** Optional label (can be rich content). */
  label?: React.ReactNode
  disabled?: boolean
  id?: string
  className?: string
  style?: React.CSSProperties
}

export function Checkbox(props: CheckboxProps): JSX.Element
