import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const admin = createAdminClient()
  const { data: caller } = await admin
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!caller || caller.community_role !== 'janitor') notFound()

  const { view } = await searchParams
  const tab: TabKey = view === 'subscribers' || view === 'beta' ? view : 'members'

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-5 h-5 text-primary-strong" />
        <h1 className="text-2xl font-bold text-text">People &amp; lists</h1>
      </div>
      <p className="text-sm text-muted mb-5">Members, email subscribers, and the beta waitlist.</p>

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
    </div>
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

  const allMembers = (members ?? []).map((m: any) => ({ ...m, regionName: m.nexus_regions?.name ?? null }))

  const emailMap: Record<string, string> = {}
  for (const m of allMembers) {
    if (m.auth_user_id) {
      try {
        const { data: { user: authUser } } = await admin.auth.admin.getUserById(m.auth_user_id)
        if (authUser?.email) emailMap[m.id] = authUser.email
      } catch { /* skip */ }
    }
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
        Manage campaigns in <StudioLink href="/studio/contacts">the Studio</StudioLink>.
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
        Admit signups in <StudioLink href="/studio/beta">the Studio</StudioLink>.
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
                <span className={`text-[11px] px-1.5 py-0.5 rounded-md font-medium capitalize ${BETA_STYLE[s.status]}`}>
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
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-subtle">
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
