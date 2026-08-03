import * as React from 'react'

/**
 * A single-line text field. Hairline warm border, calm neutral focus ring
 * (text fields never glow amber). Accepts all native input props.
 */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Field label rendered above the control. */
  label?: string
  /** Leading icon node (e.g. a 16px lucide glyph). */
  icon?: React.ReactNode
  /** Danger border + danger hint color. */
  invalid?: boolean
  /** Helper / error text under the field. */
  hint?: string
}

export function Input(props: InputProps): JSX.Element
