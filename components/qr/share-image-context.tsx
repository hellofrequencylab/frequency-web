'use client'

import { createContext, useContext } from 'react'

// Carries the ENTITY's image (a Space brand logo, a Journey cover, an event cover, ...) down to the
// framework "QR & Share" control (QrShareDropdown → PageShareKit / PageQrManager, rendered deep inside
// the DetailTemplate's PageAdminBar) so the emitted QR for an entity page centers the ENTITY's image —
// never the viewer's own avatar (injecting the scanner's avatar on a non-personal surface is the visual
// half of the reported bug). The image is layered on at render only (withCenterLogo), so a new image
// needs no reprint.
//
// Only an entity page that opts in provides a value; every other page leaves it null, so the code shows
// no center mark (the safe default) rather than a wrong one. An entity page (a Server Component) wraps
// its DetailTemplate in <ShareImageProvider>, an ancestor of the client QrShareDropdown that reads it —
// no per-template prop threading.

const ShareImageContext = createContext<string | null>(null)

export function ShareImageProvider({
  imageUrl,
  children,
}: {
  /** The entity's image URL (validated for safe inlining by withCenterLogo at render). */
  imageUrl: string | null
  children: React.ReactNode
}) {
  return <ShareImageContext.Provider value={imageUrl}>{children}</ShareImageContext.Provider>
}

/** The current entity page's center image for its share QR, or null on any page that provides none. */
export function useShareImage(): string | null {
  return useContext(ShareImageContext)
}
