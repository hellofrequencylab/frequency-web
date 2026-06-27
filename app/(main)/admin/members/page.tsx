import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { Users, ArrowUpRight } from 'lucide-react'
import { MemberAdmin } from './member-admin'
import { UnderlineTabs } from '@/components/admin/underline-tabs'
import { SubscribersTable, BetaTable } from './lists-tables'
import { listSubscribers } from '@/lib/studio/contacts'
import { listBetaSignups, summarizeBeta } from '@/lib/studio/beta'
import { readSpotlightEnabled } from '@/lib/profile/spotlight-flags'

export const dynamic = 'force-dynamic'

type TabKey = 'members' | 'subscribers' | 'beta'

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  // ADR-223: janitor (web_role) OR a staff role with the `members` domain (write) —
  // Operations/Support do member assist (docs/ROLES.md §System 3). Matches the nav
  // link gate in sections.ts so the roster never shows-then-redirects.
  await requireAdmin('janitor', { staff: 'members' })

  const { view } = await searchParams
  const tab: TabKey = view === 'subscribers' || view === 'beta' ? view : 'members'

  // Query-state (?view=) tabs on ONE route — drive the active tab explicitly by href
  // since pathname matching can't tell `?view=` variants apart.
  const tabHref: Record<TabKey, string> = {
    members: '/admin/members',
    subscribers: '/admin/members?view=subscribers',
    beta: '/admin/members?view=beta',
  }

  return (
    <AdminTemplate
      title="People & lists"
      eyebrow="Platform"
      icon={Users}
      description="Members, email subscribers, and the beta waitlist."
      width="wide"
    >
      <AdminSection>
        <UnderlineTabs
          activeHref={tabHref[tab]}
          tabs={[
            { href: tabHref.members, label: 'Members' },
            { href: tabHref.subscribers, label: 'Subscribers' },
            { href: tabHref.beta, label: 'Beta invites' },
          ]}
        />
        <div className="mt-6">
          {tab === 'members' && <MembersTab />}
          {tab === 'subscribers' && <SubscribersTab />}
          {tab === 'beta' && <BetaTab />}
        </div>
      </AdminSection>
    </AdminTemplate>
  )
}

// ── Members ──────────────────────────────────────────────────────────────────
async function MembersTab() {
  const admin = createAdminClient()
  // `meta` is read server-side ONLY to derive the Spotlight boolean below; it holds
  // PII (acquisition/UTM, streak, persona) and is never passed to the client.
  const select = `
      id, auth_user_id, display_name, handle, avatar_url, bio, community_role,
      is_active, is_system, created_at, current_season_rank, current_season_zaps, meta,
      nexus_regions!nexus_region_id ( name )
    `
  // The system voice (Vera, ADR-231) is fetched separately and PINNED to the top:
  // she's the oldest row, so the newest-200 window would silently drop her, and
  // janitors must always be able to reach her settings from here.
  const [{ data: members }, { data: systemProfiles }] = await Promise.all([
    admin
      .from('profiles')
      .select(select)
      .eq('is_system', false)
      .order('created_at', { ascending: false })
      .limit(200),
    admin.from('profiles').select(select).eq('is_system', true),
  ])

  // Strip `meta` here: derive only the Spotlight boolean and drop the raw blob so no
  // PII crosses the server→client boundary (the member list is a client component).
  const allMembers = [...(systemProfiles ?? []), ...(members ?? [])].map((row) => {
    const { meta, ...m } = row as typeof row & { meta?: unknown }
    return {
      ...m,
      community_role: m.community_role ?? 'member',
      regionName: m.nexus_regions?.name ?? null,
      spotlightEnabled: readSpotlightEnabled(meta),
    }
  })

  // Resolve emails by paging through the auth users (a few listUsers calls)
  // instead of one getUserById per member, which was up to 200 sequential
  // round-trips to the auth admin API on every page load.
  const emailByAuthId: Record<string, string> = {}
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    for (const u of users) if (u.email) emailByAuthId[u.id] = u.email
    if (error || users.length < 1000) break
  }
  const emailMap: Record<string, string> = {}
  for (const m of allMembers) {
    if (m.auth_user_id && emailByAuthId[m.auth_user_id]) emailMap[m.id] = emailByAuthId[m.auth_user_id]
  }

  return (
    <>
      <p className="mb-4 text-sm text-muted">{allMembers.filter((m) => !m.is_system).length} total members</p>
      <MemberAdmin members={allMembers} emailMap={emailMap} />
    </>
  )
}

// ── Subscribers ──────────────────────────────────────────────────────────────
async function SubscribersTab() {
  const subs = await listSubscribers()
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {subs.length} confirmed email {subs.length === 1 ? 'subscriber' : 'subscribers'}.
        Manage campaigns in <StudioLink href="/admin/marketing/contacts">Marketing</StudioLink>.
      </p>
      <SubscribersTable rows={subs} />
    </>
  )
}

// ── Beta invites ─────────────────────────────────────────────────────────────
async function BetaTab() {
  const signups = await listBetaSignups()
  const stats = summarizeBeta(signups)
  return (
    <>
      <p className="mb-4 text-sm text-muted">
        {stats.confirmed} confirmed and ready to admit · {stats.pending} pending · {stats.invited} invited.
        Admit signups in <StudioLink href="/admin/marketing/beta">Marketing</StudioLink>.
      </p>
      <BetaTable rows={signups} />
    </>
  )
}

function StudioLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-primary-strong hover:underline">
      {children} <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  )
}
