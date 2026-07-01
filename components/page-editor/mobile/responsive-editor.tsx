'use client'

// The ONE shared switch between the desktop <Puck> editor and the phone-native
// <MobileEditor>. Every editor (marketing pages, Space landings, Spotlight) wraps its
// existing <Puck> in this component, so all three become responsive from a single
// place — the mobile chrome is added without touching the desktop behaviour.
//
// Desktop (>= 768px): renders `desktop` verbatim (the existing <Puck> JSX, unchanged).
// Phone (< 768px):     renders <MobileEditor> over the SAME config + data, wired to the
//                      editor's own draft-save + publish actions (passed as props).
//
// Until the client resolves the viewport we render the desktop tree (SSR-stable, and
// the correct default for the admin desktop case), then swap on mount if narrow.

import { MobileEditor, type MobileEditorProps } from './mobile-editor'
import { useIsMobile } from './use-is-mobile'

export function ResponsiveEditor({
  desktop,
  mobile,
}: {
  /** The existing desktop <Puck> tree, rendered unchanged at >= 768px. */
  desktop: React.ReactNode
  /** Everything <MobileEditor> needs to drive the same document on a phone. */
  mobile: MobileEditorProps
}) {
  const isMobile = useIsMobile()
  if (isMobile) return <MobileEditor {...mobile} />
  return <>{desktop}</>
}
