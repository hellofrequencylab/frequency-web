import type { ReactNode } from 'react'
import { NETWORK_BLOCK_CSS } from '@/components/sites/network-css'

// NETWORK SECTIONS ON A FREQUENCY SPACE PAGE. A website theme never styles a Frequency page (Daniel, 2026-10-27,
// LIVE-1509), so the body never wears the Network paper, scheme or faces: the sections bring only their own
// structural sheet (NETWORK_BLOCK_CSS), in the Space's own palette, the same way they do on a website in another
// theme. The app keeps its chrome and its canvas.

/** Give a page body that carries Network sections the sheet those sections need. */
export function NetworkPageScope({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{NETWORK_BLOCK_CSS}</style>
      {children}
    </>
  )
}
