import Link from 'next/link'
import { Menu, ArrowLeft } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate } from '@/components/templates'
import { defaultMenu, isPinnedRailItem } from '@/lib/menus/defaults'
import { MenuArrangeBoard } from '@/components/admin/menu/menu-arrange-board'
import type { MenuSurfaceKey, ResolvedMenu } from '@/lib/menus/types'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Arrange menu' }

// The visual drag-and-drop arranger for any menu surface (a focused companion to the
// bulk Menu manager). Janitor-only, like the rest of /admin/menu.
const SURFACES: { key: MenuSurfaceKey; label: string }[] = [
  { key: 'left', label: 'Left rail' },
  { key: 'header', label: 'Header menu' },
  { key: 'footer', label: 'Footer' },
  { key: 'profile', label: 'Account menu' },
  { key: 'admin_header', label: 'Admin header' },
]

// Every page the surface's code defaults know about (leaf links only, deduped, minus the
// runtime-injected Profile pin). The board diffs this against the live menu to find the
// "unlinked" pages for the side palette.
function flattenPages(menu: ResolvedMenu): { label: string; href: string; icon?: string }[] {
  const out: { label: string; href: string; icon?: string }[] = []
  const seen = new Set<string>()
  const push = (items: ResolvedMenu['rootItems']) => {
    for (const i of items) {
      if (isPinnedRailItem(i.id) || seen.has(i.href)) continue
      seen.add(i.href)
      out.push({ label: i.label, href: i.href, icon: i.icon })
    }
  }
  const walk = (cats: ResolvedMenu['categories']) => {
    for (const c of cats) {
      push(c.items)
      walk(c.children)
    }
  }
  push(menu.rootItems)
  walk(menu.categories)
  return out
}

export default async function ArrangeMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ surface?: string }>
}) {
  await requireAdmin('janitor')
  const { surface } = await searchParams
  const surfaceKey = (SURFACES.some((s) => s.key === surface) ? surface : 'left') as MenuSurfaceKey
  const allPages = flattenPages(defaultMenu(surfaceKey))

  return (
    <AdminTemplate
      title="Arrange menu"
      eyebrow="Platform"
      icon={Menu}
      description="Drag groups to reorder them, drag unlinked pages in from the side, and spot any group holding a hidden page."
      width="wide"
    >
      <Link
        href="/admin/menu"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Menu manager
      </Link>
      <MenuArrangeBoard key={surfaceKey} surfaceKey={surfaceKey} surfaces={SURFACES} allPages={allPages} />
    </AdminTemplate>
  )
}
