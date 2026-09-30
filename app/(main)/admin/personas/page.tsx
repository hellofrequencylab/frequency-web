import Link from 'next/link'
import Image from 'next/image'
import { BadgeCheck, Clock, ShieldCheck, Zap, Ban } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Banner, StatusChip, type StatusTone } from '@/components/admin/status'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import {
  getPersonaQueue,
  personaQueueStats,
  connectBindingState,
  isMoneyPersona,
  CONNECT_BINDING_META,
  personaActivationVerdict,
  awaitingPayout,
  PERSONA_META,
  PERSONA_STATE_META,
  type PersonaQueueRow,
} from '@/lib/personas'
import { getGlobalTrustScores } from '@/lib/trust'
import { PersonaControls } from './persona-controls'

export const dynamic = 'force-dynamic'

// State + binding tone → the shared StatusChip vocabulary (one status language across admin).
const STATE_TONE: Record<'pending' | 'success' | 'muted', StatusTone> = {
  pending: 'warning',
  success: 'success',
  muted: 'neutral',
}

function PersonaRow({ row, trust }: { row: PersonaQueueRow; trust?: number }) {
  const meta = PERSONA_META[row.persona]
  const stateMeta = PERSONA_STATE_META[row.state]
  // The payout binding readout, shown only for the money programs (Practitioner, Organization).
  // Activate is offered only when the member's Connect account can take charges (LIVE-696).
  const binding = isMoneyPersona(row.persona) ? connectBindingState(row) : null
  const bindingMeta = binding ? CONNECT_BINDING_META[binding] : null
  const canActivate = personaActivationVerdict(row.persona, row.ownerPayout).ok
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Link href={`/people/${row.handle ?? ''}`} className="flex min-w-0 flex-1 items-center gap-3">
        {row.avatarUrl ? (
          <Image src={avatarSrc(row.avatarUrl)} alt={row.displayName} width={36} height={36} className="h-9 w-9 rounded-pill object-cover" style={avatarFocusStyle(row.avatarUrl)} />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-pill bg-primary-bg text-meta font-semibold text-primary-strong">
            {getInitials(row.displayName)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-body-sm font-semibold text-text">{row.displayName}</p>
          <p className="truncate text-meta text-subtle">
            {meta.emoji} {meta.label}
            {row.handle ? ` · @${row.handle}` : ''}
          </p>
        </div>
      </Link>
      {/* Operator-only trust readout (ADR-247) — context for the verify decision. */}
      <span className="text-meta font-medium text-subtle tabular-nums" title="Global trust score">
        Trust {trust ?? 0}
      </span>
      {bindingMeta && (
        <StatusChip size="sm" tone={STATE_TONE[bindingMeta.tone]}>
          {bindingMeta.label}
        </StatusChip>
      )}
      <StatusChip tone={STATE_TONE[stateMeta.tone]}>{stateMeta.label}</StatusChip>
      <PersonaControls profileId={row.profileId} persona={row.persona} state={row.state} canActivate={canActivate} />
    </li>
  )
}

/** A titled queue list with its own empty state, sorted pending-first. */
function PersonaQueueList({
  rows,
  trustByProfile,
  empty,
}: {
  rows: PersonaQueueRow[]
  trustByProfile: Map<string, number>
  empty: { title: string; description: string }
}) {
  if (rows.length === 0) {
    return <EmptyState variant="cleared" title={empty.title} description={empty.description} />
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {rows.map((r) => (
        <PersonaRow key={`${r.profileId}-${r.persona}`} row={r} trust={trustByProfile.get(r.profileId)} />
      ))}
    </ul>
  )
}

// Pending claims float to the top of every list (the operator's to-do), then newest first
// (the queue already arrives newest-first from getPersonaQueue).
function pendingFirst(rows: PersonaQueueRow[]): PersonaQueueRow[] {
  return [...rows].sort((a, b) => Number(b.state === 'claimed') - Number(a.state === 'claimed'))
}

export default async function AdminPersonasPage() {
  // Partner verification is a platform operation — community janitor OR a staff
  // 'profiles'-domain operator (ADR-127).
  await requireAdmin('janitor', { staff: 'profiles' })

  const queue = await getPersonaQueue()
  // Operator-only trust readout for the verify decision (ADR-247). One batched read;
  // safe zeros until the trust_signals table is applied / signals accrue.
  const trustByProfile = await getGlobalTrustScores(queue.map((r) => r.profileId)).catch(
    () => new Map<string, number>(),
  )

  const stats = personaQueueStats(queue)
  // EM2-5 scopes the primary queue to the money-moving programs: Practitioner + Organization.
  const money = pendingFirst(queue.filter((r) => isMoneyPersona(r.persona)))
  const other = pendingFirst(queue.filter((r) => !isMoneyPersona(r.persona)))
  const moneyPending = money.filter((r) => r.state === 'claimed').length
  const awaitingAccount = money.filter((r) => awaitingPayout(r.persona, r.state, r.ownerPayout)).length

  return (
    <AdminTemplate
      title="Partner verification"
      icon={BadgeCheck}
      eyebrow="People"
      description="Vet partner program claims. Verify to turn a program’s tools on; suspend to revoke. Practitioner and Organization run the money paths, so they go Active only once the member has a payout account."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Pending review" value={stats.pending} icon={Clock} />
        <StatCard label="Verified" value={stats.verified} icon={ShieldCheck} />
        <StatCard label="Active" value={stats.active} icon={Zap} detail="bound" />
        <StatCard label="Suspended" value={stats.suspended} icon={Ban} />
      </div>

      {awaitingAccount > 0 && (
        <Banner tone="info" title={`${awaitingAccount} verified, waiting on a payout account`}>
          Their tools are on. Activate appears once the member adds a payout account in Settings under
          Billing, and activating binds that account to the program. They see the same prompt on
          their Partner programs page.
        </Banner>
      )}

      <AdminSection
        title="Practitioner & Organization"
        description={
          moneyPending
            ? `${moneyPending} waiting on you. These run the money paths.`
            : 'The money-path programs. Verify turns the tools on; Active needs the member’s payout account.'
        }
      >
        <PersonaQueueList
          rows={money}
          trustByProfile={trustByProfile}
          empty={{
            title: 'No Practitioner or Organization claims',
            description: 'New claims for the money-path programs land here for verification.',
          }}
        />
      </AdminSection>

      {other.length > 0 && (
        <AdminSection
          title="Other partner programs"
          description="Collaborator and Business claims. Same verify ladder, no payout binding."
        >
          <PersonaQueueList
            rows={other}
            trustByProfile={trustByProfile}
            empty={{
              title: 'Nothing else to review',
              description: 'Collaborator and Business claims land here.',
            }}
          />
        </AdminSection>
      )}
    </AdminTemplate>
  )
}
