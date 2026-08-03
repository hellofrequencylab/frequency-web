import * as React from 'react'

/** A multi-line text field matching Input's chrome (composer, replies, bios). */
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  invalid?: boolean
  hint?: string
  /** Initial visible rows (default 4). */
  rows?: number
}

export function Textarea(props: TextareaProps): JSX.Element
