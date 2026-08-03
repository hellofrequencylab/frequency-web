import * as React from 'react'

/**
 * The honest state of a capability that exists but is not switched on. Four
 * kinds, and none of them read as an error:
 *  · `preview` — you can look, the action is inert (every billing CTA in the beta)
 *  · `gated`   — turns on at a known moment (September 1 graduation)
 *  · `dormant` — built and waiting on a key or a flag (SMS, push, AI)
 *  · `hold`    — deliberately parked (white-label sites)
 */
export interface GateNoticeProps {
  kind?: 'preview' | 'gated' | 'dormant' | 'hold'
  title?: React.ReactNode
  children?: React.ReactNode
  /** A disabled control, or a link to the thing that IS available. */
  action?: React.ReactNode
  /** Render as a small pill beside a control instead of a block. */
  inline?: boolean
  className?: string
  style?: React.CSSProperties
}

export function GateNotice(props: GateNoticeProps): JSX.Element
