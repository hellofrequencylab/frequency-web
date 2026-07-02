'use client'

import { SlidersHorizontal } from 'lucide-react'

/** The window event the Space customize drawer opens on. Shared by the button + the drawer so the
 *  Server Component chrome can trigger a client drawer without prop threading. */
export const OPEN_SPACE_CUSTOMIZE = 'open-space-customize'

// THE ONE CUSTOMIZE CONTROL for a Space profile (owner/admin/editor only). It replaces the three
// separate affordances that used to sit on the profile (Edit profile · Customize page · the divider
// Settings cog) — they all opened the SAME settings rail, so this collapses them to one button. It
// dispatches a window event the space-scoped SpaceCustomizeDrawer listens for, sliding the rail in from
// the right with the core page settings (cover, accent, page + block order) and an "Edit fullscreen"
// button into the full Puck editor. A CLIENT button because the profile chrome is a Server Component and
// the rail is opened by a window event. Styling is passed in so it matches the on-ink (Hero overlay) or
// in-flow treatment.
export function SpaceCustomizeButton({ className, label = 'Customize' }: { className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_SPACE_CUSTOMIZE))}
      className={className}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden />
      {label}
    </button>
  )
}
