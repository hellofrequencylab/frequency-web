import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminPage } from '@/components/admin/admin-page'
import { Users, Mail, Rocket, ArrowUpRight } from 'lucide-react'
import { MemberAdmin } from './member-admin'
import { listSubscribers, type ContactRow } from '@/lib/studio/contacts'
import { listBetaSignups, summarizeBeta, type BetaSignup, type BetaStatus } from '@/lib/studio/beta'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'members', label: 'Members', Icon: Users },
  { key: 'subscribers', label: 'Subscribers', Icon: Mail },
  { key: 'beta', label: 'Beta invites', Icon: Rocket },
] as const

type TabKey = (typeof TABS)[number]['key']

function fmt(d: string | null): string {
  if (!d) return '-'
  const date = new Date(d)
  return isNaN(date.getTime()) ? '-' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  await requireAdmin('janitor')

  const { view } = await searchParams
  const tab: TabKey = view === 'subscribers' || view === 'beta' ? view : 'members'

  return (
    <AdminPage
      title="People & lists"
      eyebrow="Platform"
      icon={Users}
      description="Members, email subscribers, and the beta waitlist."
      width="wide"
    >
      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key
          const href = key === 'members' ? '/admin/members' : `/admin/members?view=${key}`
          return (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active ? 'border-primary text-primary-strong' : 'border-transparent text-muted hover:text-text'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          )
        })}
      </div>

      {tab === 'members' && <MembersTab />}
      {tab === 'subscribers' && <SubscribersTab />}
      {tab === 'beta' && <BetaTab />}
    </AdminPage>
  )
}

// ── Members ──────────────────────────────────────────────────────────────────
async function MembersTab() {
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('profiles')
    .select(`
      id, auth_user_id, display_name, handle, avatar_url, bio, community_role,
      is_active, created_at, current_season_rank, current_season_zaps,
      nexus_regions!nexus_region_id ( name )
    `)
    .eq('is_system', false)
    .order('created_at', { ascending: false })
    .limit(200)

  const allMembers = (members ?? []).map((m) => ({
    ...m,
    community_role: m.community_role ?? 'member',
    regionName: m.nexus_regions?.name ?? null,
  }))

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
      <p className="text-sm text-muted mb-4">{allMembers.length} total members</p>
      <MemberAdmin members={allMembers} emailMap={emailMap} />
    </>
  )
}

// ── Subscribers ──────────────────────────────────────────────────────────────
async function SubscribersTab() {
  const subs = await listSubscribers()
  return (
    <>
      <p className="text-sm text-muted mb-4">
        {subs.length} confirmed email {subs.length === 1 ? 'subscriber' : 'subscribers'}.
        Manage campaigns in <StudioLink href="/marketing/contacts">Marketing</StudioLink>.
      </p>
      {subs.length === 0 ? (
        <Empty>No subscribers yet.</Empty>
      ) : (
        <Table head={['Email', 'Name', 'Member', 'Source', 'Joined']}>
          {subs.map((c: ContactRow) => (
            <tr key={c.id} className="border-b border-border/60 last:border-0">
              <Td className="text-text">{c.email}</Td>
              <Td>{c.displayName ?? '-'}</Td>
              <Td>{c.profileId ? 'Yes' : 'No'}</Td>
              <Td>{c.source ?? '-'}</Td>
              <Td>{fmt(c.createdAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

// ── Beta invites ─────────────────────────────────────────────────────────────
const BETA_STYLE: Record<BetaStatus, string> = {
  pending: 'bg-warning-bg text-warning',
  confirmed: 'bg-success-bg text-success',
  invited: 'bg-signal-bg text-signal-strong',
  unsubscribed: 'bg-danger-bg text-danger',
}

async function BetaTab() {
  const signups = await listBetaSignups()
  const stats = summarizeBeta(signups)
  return (
    <>
      <p className="text-sm text-muted mb-4">
        {stats.confirmed} confirmed and ready to admit · {stats.pending} pending · {stats.invited} invited.
        Admit signups in <StudioLink href="/marketing/beta">Marketing</StudioLink>.
      </p>
      {signups.length === 0 ? (
        <Empty>No beta signups yet.</Empty>
      ) : (
        <Table head={['Email', 'Name', 'Status', 'Requested']}>
          {signups.map((s: BetaSignup) => (
            <tr key={s.id} className="border-b border-border/60 last:border-0">
              <Td className="text-text">{s.email}</Td>
              <Td>{s.displayName ?? '-'}</Td>
              <Td>
                <span className={`text-xs px-1.5 py-0.5 rounded-md font-medium capitalize ${BETA_STYLE[s.status]}`}>
                  {s.status}
                </span>
              </Td>
              <Td>{fmt(s.requestedAt)}</Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  )
}

// ── Shared bits ──────────────────────────────────────────────────────────────
function StudioLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-primary-strong font-medium hover:underline">
      {children} <ArrowUpRight className="w-3 h-3" />
    </Link>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/60 px-4 py-10 text-center">
      <p className="text-sm text-muted">{children}</p>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-subtle">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function Td({ children, className = 'text-muted' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 ${className}`}>{children}</td>
}
