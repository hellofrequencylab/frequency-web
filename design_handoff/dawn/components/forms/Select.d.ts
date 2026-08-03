import * as React from 'react'

/** A styled native dropdown (toolbar filters, settings) matching Input chrome. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  /** Options as plain strings or {value,label} objects. */
  options?: Array<string | { value: string; label: string }>
  invalid?: boolean
  hint?: string
}

export function Select(props: SelectProps): JSX.Element
