import { ShieldAlert } from 'lucide-react'
import { DashArea, TileGrid, Tile, MiniStat, MiniGrid } from '@/components/admin/dash'
import { AttentionList, type AttentionItem } from '@/components/admin/attention-list'
import { FreshnessNote } from '@/components/admin/freshness-note'
import { createAdminClient } from '@/lib/supabase/admin'
import { ticketStatusCounts } from '@/lib/support/store'
import { isOpenStatus } from '@/lib/support/types'

// Community layout module (LP7): "Trust & safety" — the live queue, led by what needs attention now.
// Self-fetching RSC; the page owns the gate, so this never re-gates. Fail-safe: any read error
// degrades to an honest zero queue with no attention items. Semantic tokens + DashArea grammar only.

const DAY = 24 * 60 * 60 * 1000

interface TrustData {
  reportsOpen: number
  openTickets: number
  verifyQueue: number
  recentModeration: number
}

const EMPTY: TrustData = { reportsOpen: 0, openTickets: 0, verifyQueue: 0, recentModeration: 0 }

async function load(): Promise<TrustData> {
  try {
    const admin = createAdminClient()
    const weekAgo = new Date(new Date().getTime() - 7 * DAY).toISOString()

    const [openReports, recentModeration, ticketCounts, pendingPersonas] = await Promise.all([
      admin.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('admin_audit_log').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo),
      ticketStatusCounts(),
      // profile_personas isn't in the generated types yet (repo convention: untyped cast).
      // A `claimed` persona is pending the staff verify queue (lib/personas.ts).
      admin
        .from('profile_personas')
        .select('id', { count: 'exact', head: true })
        .eq('state', 'claimed'),
    ])

    const openTickets = Object.entries(ticketCounts).reduce(
      (sum, [status, n]) => (isOpenStatus(status as never) ? sum + n : sum),
      0,
    )

    return {
      reportsOpen: openReports.count ?? 0,
      openTickets,
      verifyQueue: pendingPersonas.count ?? 0,
      recentModeration: recentModeration.count ?? 0,
    }
  } catch {
    return EMPTY
  }
}

export async function CommunityTrustSafety() {
  const { reportsOpen, openTickets, verifyQueue, recentModeration } = await load()

  // The domain attention spine, only actionable items, ranked by what's waiting.
  const attention: AttentionItem[] = []
  if (reportsOpen > 0) {
    attention.push({
      id: 'reports',
      severity: reportsOpen > 5 ? 'risk' : 'watch',
      title: `${reportsOpen} ${reportsOpen === 1 ? 'report' : 'reports'} waiting`,
      finding: 'Member reports pending a moderation decision.',
      action: { label: 'Review', href: '/admin/moderation' },
    })
  }
  if (openTickets > 0) {
    attention.push({
      id: 'tickets',
      severity: openTickets > 10 ? 'risk' : 'watch',
      title: `${openTickets} open ${openTickets === 1 ? 'ticket' : 'tickets'}`,
      finding: 'Support requests still waiting on a reply.',
      action: { label: 'Open support', href: '/admin/support' },
    })
  }
  if (verifyQueue > 0) {
    attention.push({
      id: 'personas',
      severity: 'watch',
      title: `${verifyQueue} partner ${verifyQueue === 1 ? 'claim' : 'claims'} to verify`,
      finding: 'Persona claims awaiting verification.',
      action: { label: 'Verify', href: '/admin/personas' },
    })
  }

  return (
    <DashArea
      icon={ShieldAlert}
      label="Trust & safety"
      blurb="The live queue: open reports, support tickets, partner verification, and recent moderation. Start with whatever is waiting longest."
      href="/admin/moderation"
      hrefLabel="Open Moderation"
      footnote={<FreshnessNote at={new Date()} label="Read" />}
    >
      <TileGrid>
        {attention.length > 0 && (
          <Tile label="Needs attention" span={3}>
            <AttentionList items={attention} />
          </Tile>
        )}
        <Tile label="The queue" span={3} caption="Each number opens its filtered queue.">
          <MiniGrid>
            <MiniStat value={reportsOpen.toLocaleString()} label="Open reports" tone={reportsOpen > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={openTickets.toLocaleString()} label="Open tickets" tone={openTickets > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={verifyQueue.toLocaleString()} label="Verify queue" tone={verifyQueue > 0 ? 'bad' : 'neutral'} />
            <MiniStat value={recentModeration.toLocaleString()} label="Mod actions · 7d" />
          </MiniGrid>
        </Tile>
      </TileGrid>
    </DashArea>
  )
}
