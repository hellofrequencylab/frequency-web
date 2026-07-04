import { Server } from 'lucide-react'
import { DashArea, TileGrid, Tile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { createAdminClient } from '@/lib/supabase/admin'
import { demoContentExists } from '@/lib/platform-flags'

// Operations layout module (LP7): "Platform" — the platform keys: published pages, the audit trail,
// and whether demo content is present. Self-fetching RSC; the page owns the janitor + platform-staff
// gate, so this never re-gates. Fail-safe: any read error degrades to honest zeros. The trail is the
// security record of sensitive actions in the last 7 days. Semantic tokens + DashArea grammar only.

const WEEK = 7 * 24 * 60 * 60 * 1000

interface PlatformData {
  pages: number
  auditEntries: number
  hasDemo: boolean
  demoMembers: number
}

const EMPTY: PlatformData = { pages: 0, auditEntries: 0, hasDemo: false, demoMembers: 0 }

async function load(): Promise<PlatformData> {
  try {
    const admin = createAdminClient()
    const weekAgo = new Date(new Date().getTime() - WEEK).toISOString()

    const [pages, auditEntries, hasDemo, demoRows] = await Promise.all([
      admin.from('pages').select('id', { count: 'exact', head: true }),
      admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      demoContentExists(),
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_demo', true),
    ])

    return {
      pages: pages.count ?? 0,
      auditEntries: auditEntries.count ?? 0,
      hasDemo,
      demoMembers: demoRows.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

export async function OperationsPlatform() {
  const { pages, auditEntries, hasDemo, demoMembers } = await load()

  return (
    <DashArea
      icon={Server}
      label="Platform"
      blurb="The platform keys — published pages, payouts, the audit trail, and whether demo content is present. The trail is the security record of sensitive actions in the last 7 days."
      href="/admin/audit"
      hrefLabel="Open audit log"
    >
      <TileGrid>
        <Tile label="Infrastructure">
          <MiniGrid>
            <MiniStat value={pages.toLocaleString()} label="Pages" />
            <MiniStat value={auditEntries.toLocaleString()} label="Audit · 7d" />
            <MiniStat value={hasDemo ? 'Present' : 'None'} label="Demo content" />
            <MiniStat value={demoMembers.toLocaleString()} label="Demo members" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}
