'use client'

import { useState } from 'react'
import { SettingsDrawer, type SettingsDrawerState } from '@/components/layout/settings-drawer'

// The admin RIGHT-rail column — the admin twin of the shell's member rail column, so the
// Settings drawer behaves IDENTICALLY on admin pages (owner directive: "in every instance"
// the drawer is stuck right, slides OVER the rail, and a grab handle widens it, pushing the
// center content over).
//
// Why this exists: admin routes suppress the shell's own right rail (railFor → 'none') and
// render their live info rail in-body instead. The shell-level SettingsDrawer overlays
// whatever rail COLUMN it is mounted inside — so on admin pages it must be mounted HERE,
// over the info rail, not in the shell's separate far-right column (which left it sitting
// BESIDE the rail). The shell skips its own drawer mount on admin routes (no double drawer).
//
// At rest the column is the info-rail footprint (xl: w-[18.5rem] = the 16rem rail + a 2.5rem
// gap, matching the shell's lg:gap-10 column gap so the admin content↔rail gap equals the
// content↔left-menu gap and the page reads uniform; lg: w-0, since the rail itself is xl+).
// When the drawer opens it reports its live width up here (onStateChange); this column grows to
// match and the admin center `flex-1` compresses. The width transition is dropped mid-drag so
// the column tracks the pointer 1:1.
export function AdminRailDrawerColumn({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsDrawerState>({ open: false, width: 288, resizing: false })

  return (
    <div
      className={`relative hidden w-0 shrink-0 justify-end lg:flex xl:w-[18.5rem] ${
        settings.resizing ? '' : 'transition-[width] duration-200 ease-out motion-reduce:transition-none'
      }`}
      // Open: take the live drawer width (overriding the rest w-0/xl:w-72). Closed: fall back
      // to the rail footprint so the rail shows at xl and nothing shows at lg.
      style={settings.open ? { width: settings.width } : undefined}
    >
      {/* The live info rail — xl+ only, sticky so it rides the scroll. Covered by the drawer
          when it is open. justify-end keeps it pinned right while the column grows. */}
      <aside className="hidden w-64 shrink-0 xl:block">
        <div className="sticky top-14 max-h-[calc(100vh-4.5rem)] overflow-y-auto pb-6 pt-2.5">
          {children}
        </div>
      </aside>

      {/* The settings drawer slides over THIS column (absolute, full height) on the
          `open-settings` event, reporting its width up so the column sizes to match. */}
      <SettingsDrawer onStateChange={setSettings} />
    </div>
  )
}
