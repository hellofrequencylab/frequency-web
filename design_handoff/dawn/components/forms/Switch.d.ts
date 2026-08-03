import * as React from 'react'

/** A toggle for instant on/off settings. Amber when on; pill track + knob. */
export interface SwitchProps {
  checked?: boolean
  onChange?: (next: boolean) => void
  /** Optional trailing label (renders the whole thing as a clickable label). */
  label?: string
  disabled?: boolean
  id?: string
  className?: string
  style?: React.CSSProperties
}

export function Switch(props: SwitchProps): JSX.Element
