import * as React from 'react'

export interface TabItem {
  value: string
  label: string
  /** Optional leading icon node. */
  icon?: React.ReactNode
  /** Optional trailing count. */
  count?: number
}

/**
 * The in-app DetailTemplate tab row — underline style, amber active marker.
 * Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`).
 */
export interface TabsProps {
  /** Tabs as strings or {value,label,icon?,count?}. */
  tabs: Array<string | TabItem>
  value?: string
  defaultValue?: string
  onChange?: (value: string) => void
  className?: string
  style?: React.CSSProperties
}

export function Tabs(props: TabsProps): JSX.Element
