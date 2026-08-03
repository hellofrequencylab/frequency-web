import * as React from 'react'

/**
 * The ONE tab vocabulary. Underline only — the system has no pill tabs, and a
 * Detail page's sub-navigation is always this.
 */
export interface UnderlineTabsProps {
  /** Strings, or `{ id, label, count }` when a tab carries a number. */
  tabs: Array<string | { id: string; label: React.ReactNode; count?: number }>
  value: string
  onChange?: (id: string) => void
  className?: string
  style?: React.CSSProperties
}

export function UnderlineTabs(props: UnderlineTabsProps): JSX.Element
