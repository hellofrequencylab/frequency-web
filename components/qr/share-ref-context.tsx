'use client'

import { createContext, useContext } from 'react'

// Carries the PROFILE OWNER's id down to the framework "QR & Share" control
// (QrShareDropdown, rendered deep inside the DetailTemplate's PageAdminBar) so the
// emitted share link/QR for a `/people/<handle>` page becomes `/people/<handle>?ref=<id>`.
// A new visitor who follows that link/scan is attributed to the owner at signup
// (proxy drops `fq_ref` → applyReferralAttribution sets referred_by_profile_id).
//
// Only the person page provides a value; every other page leaves it null, so no other
// share surface ever picks up a person ref (the empty-context default is fail-safe).
// The page (a Server Component) wraps its DetailTemplate in <ShareRefProvider>, which is
// an ancestor of the client QrShareDropdown that reads it — no per-template prop threading.

const ShareRefContext = createContext<string | null>(null)

export function ShareRefProvider({
  profileId,
  children,
}: {
  /** The profile owner's id (a UUID). Threaded into the share url as `?ref=`. */
  profileId: string
  children: React.ReactNode
}) {
  return <ShareRefContext.Provider value={profileId}>{children}</ShareRefContext.Provider>
}

/** The current person page's owner id, or null on any non-person page. */
export function useShareRef(): string | null {
  return useContext(ShareRefContext)
}
