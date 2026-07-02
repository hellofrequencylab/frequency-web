import Link from 'next/link'
import { ArrowUpRight, ShieldCheck } from 'lucide-react'
import { AdminSection } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import {
  getStrongestConnections,
  type StrongConnection,
  type ConnectionParty,
} from '@/lib/resonance/graph-overview'

// Resonance Graph layout module (ADR-270/294): the relationship view as a RANKED, ACCESSIBLE list of
// the strongest consented connections (no heavy graph-viz dependency; semantic tokens only), each
// linking to Member Intelligence. Consent is mandatory — an edge only exists for two members who BOTH
// opted in, so this can never over-surface a tie. Self-fetching + fail-safe; shows the consent-first
// empty state (the trust explanation) when no one has opted in.
export async function CrmGraphConnections() {
  const connections = await getStrongestConnections()

  return (
    <AdminSection
      title="Strongest connections"
      description="The highest-resonance ties between consenting members, with the plain reason behind each. Tap a member to open their intelligence."
    >
      {connections.length === 0 ? (
        <EmptyState
          variant="first-use"
          icon={ShieldCheck}
          title="No consented connections yet"
          description="Only relationships where both members opted in to matching appear here. As members opt in, the overnight refresh finds the ties they share and the strongest ones show up first. Nothing is ever shown without both sides saying yes."
        />
      ) : (
        <ul className="space-y-3">
          {connections.map((c, i) => (
            <ConnectionRow key={`${c.a.profileId}-${c.b.profileId}-${i}`} connection={c} rank={i + 1} />
          ))}
        </ul>
      )}
    </AdminSection>
  )
}

/** A score band → semantic tone for the strength meter (mirrors the health legend bands). */
function scoreTone(score: number): string {
  if (score >= 0.5) return 'bg-success'
  if (score >= 0.25) return 'bg-warning'
  return 'bg-primary'
}

function ConnectionRow({ connection, rank }: { connection: StrongConnection; rank: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, connection.score)) * 100)
  const reasons = connection.reasons.map((r) => r.label)
  const why = reasons.length ? reasons.join(' and ') : 'a shared affinity'
  return (
    <li className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          <span className="text-xs font-bold tabular-nums text-subtle">{rank}</span>
          <PartyLink party={connection.a} />
          <span className="shrink-0 text-subtle">resonates with</span>
          <PartyLink party={connection.b} />
        </div>
        <span className="shrink-0 text-sm font-bold tabular-nums text-text">{pct}%</span>
      </div>
      {/* The strength meter: an accessible bar, semantic tokens only (no graph-viz, no hardcoded hex). */}
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-elevated"
        role="img"
        aria-label={`Resonance strength ${pct} percent`}
      >
        <div className={`h-full rounded-full ${scoreTone(connection.score)}`} style={{ width: `${Math.max(4, pct)}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">Because {why}.</p>
    </li>
  )
}

/** One member, linking to Member Intelligence (the per-node drill) when a contact is stitched. */
function PartyLink({ party }: { party: ConnectionParty }) {
  const name = <span className="truncate font-semibold text-text">{party.name}</span>
  if (!party.contactId) return <span className="min-w-0 truncate">{name}</span>
  return (
    <Link
      href={`/admin/marketing/contacts/${party.contactId}`}
      className="group inline-flex min-w-0 items-center gap-0.5 truncate text-text transition-colors hover:text-primary-strong"
    >
      {name}
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary-strong" />
    </Link>
  )
}
