import { UnderlineTabs, type UnderlineTabItem } from '@/components/admin/underline-tabs'

// The two sections of the Page layout manager, rendered as tabs by the shared layout so both the
// Chrome (right-rail) manager and the Apps (per-scope override) manager sit under one surface
// (/admin/page-layout).
//
// PATTERN: UnderlineTabs — the one tab vocabulary (DAWN readme §"The composition system":
// "UnderlineTabs …, so pill tabs do not exist"). WHY: these are two sibling views of one surface,
// each its own real route segment, which is the exact case UnderlineTabs owns. It already does the
// pathname matching this file used to hand-roll, so this is now data plus a wrapper for the spacing
// the layout expects. Voice canon (no em dashes).

const TABS: UnderlineTabItem[] = [
  { href: '/admin/page-layout', label: 'Chrome' },
  { href: '/admin/page-layout/apps', label: 'Apps' },
]

export function PageLayoutTabs() {
  return (
    <div className="mb-6">
      <UnderlineTabs tabs={TABS} label="Page layout sections" />
    </div>
  )
}
