import Link from 'next/link'
import Image from 'next/image'
import { BadgeCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { AdminTemplate, AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusChip, type StatusTone } from '@/components/admin/status'
import { getInitials } from '@/lib/utils'
import {
  getPersonaQueue,
  PERSONA_META,
  PERSONA_STATE_META,
  type PersonaQueueRow,
} from '@/lib/personas'
import { getGlobalTrustScores } from '@/lib/trust'
import { PersonaControls } from './persona-controls'

export const dynamic = 'force-dynamic'

// State tone → the shared StatusChip vocabulary (retired the local TONE_CLS dict).
const STATE_TONE: Record<'pending' | 'success' | 'muted', StatusTone> = {
  pending: 'warning',
  success: 'success',
  muted: 'neutral',
}

function PersonaRow({ row, trust }: { row: PersonaQueueRow; trust?: number }) {
  const meta = PERSONA_META[row.persona]
  const stateMeta = PERSONA_STATE_META[row.state]
  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Link href={`/people/${row.handle ?? ''}`} className="flex min-w-0 flex-1 items-center gap-3">
        {row.avatarUrl ? (
          <Image src={row.avatarUrl} alt={row.displayName} width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-bg text-xs font-semibold text-primary-strong">
            {getInitials(row.displayName)}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{row.displayName}</p>
          <p className="truncate text-xs text-subtle">
            {meta.emoji} {meta.label}
            {row.handle ? ` · @${row.handle}` : ''}
          </p>
        </div>
      </Link>
      {/* Operator-only trust readout (ADR-247) — context for the verify decision. */}
      <span className="text-xs font-medium text-subtle tabular-nums" title="Global trust score">
        Trust {trust ?? 0}
      </span>
      <StatusChip tone={STATE_TONE[stateMeta.tone]}>{stateMeta.label}</StatusChip>
      <PersonaControls profileId={row.profileId} persona={row.persona} state={row.state} />
    </li>
  )
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
  const pending = queue.filter((r) => r.state === 'claimed')
  const rest = queue.filter((r) => r.state !== 'claimed')

  return (
    <AdminTemplate
      title="Partner verification"
      icon={BadgeCheck}
      eyebrow="People"
      description="Vet partner persona claims. Verify to turn the program’s tools on; activate once it’s fully bound; suspend to revoke. Stripe payout binding arrives with Connect."
    >
      <AdminSection
        title="Pending review"
        description={pending.length ? `${pending.length} waiting on you.` : undefined}
      >
        {pending.length === 0 ? (
          <EmptyState variant="cleared" title="Nothing to review" description="New partner claims land here for verification." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {pending.map((r) => (
              <PersonaRow key={`${r.profileId}-${r.persona}`} row={r} trust={trustByProfile.get(r.profileId)} />
            ))}
          </ul>
        )}
      </AdminSection>

      {rest.length > 0 && (
        <AdminSection title="All personas" description="Verified, active, and suspended claims.">
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {rest.map((r) => (
              <PersonaRow key={`${r.profileId}-${r.persona}`} row={r} trust={trustByProfile.get(r.profileId)} />
            ))}
          </ul>
        </AdminSection>
      )}
    </AdminTemplate>
  )
}
