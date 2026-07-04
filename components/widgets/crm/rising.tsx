import { AdminSection } from '@/components/templates'
import { getRisingMembers } from '@/lib/dashboard/scores'
import { RisingMembers } from '@/app/(main)/admin/crm/rising-members'

// Resonance CRM layout module (LP7, ADR-270/294): "About to resonate" — the overlooked pool worth a
// reach-out (members with room to move who are not yet resonant). Self-fetching RSC; the page owns the
// janitor gate, so this never re-gates. Its own <Suspense> boundary (a separate read). Fail-safe: the
// reader returns an empty pool on any error, so this degrades to a calm empty rather than a crash.
export async function CrmRising() {
  const rising = await getRisingMembers()
  return (
    <AdminSection title="About to resonate" description="Members with room to move who are not yet resonant. The reach-out that converts.">
      <RisingMembers members={rising} />
    </AdminSection>
  )
}
