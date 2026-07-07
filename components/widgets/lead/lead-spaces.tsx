import { Building2, Users } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { listOperatedSpaces } from '@/lib/spaces/operated'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { LeadCreatePrompt } from './lead-create-prompt'

// Leadership hub module: "Spaces you run" — the Spaces this leader OWNS or ADMINS, each opening its
// /manage console. Folds the retired /spaces/operating rail entry into Leadership (the Spaces menu
// reorg). Self-fetching RSC scoped strictly to the caller (listOperatedSpaces re-derives ownership +
// active-admin membership from the DB, request-cached). ALWAYS renders (owner directive): a leader who
// runs no Space sees a create prompt instead of the section vanishing.
export async function LeadSpaces(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const spaces = await listOperatedSpaces(me.id)

  if (spaces.length === 0) {
    return (
      <LeadCreatePrompt
        section="Spaces you run"
        icon={Building2}
        title="You do not run a Space yet"
        description="A Space is your own home on Frequency for a practice, business, or organization: a profile, a public site, offerings, and a CRM. Create one and it shows up here to manage."
        ctaHref="/spaces/new"
        ctaLabel="Create a space"
      />
    )
  }

  return (
    <section>
      <SectionHeader title="Spaces you run" count={spaces.length} href="/spaces/operating" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {spaces.map((s) => (
          <EntityCard
            key={s.id}
            href={s.manageHref}
            anchor={
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Building2 className="h-5 w-5" aria-hidden />
              </span>
            }
            title={s.name}
            context={`${spaceTypeLabel(s.type)} · you are ${s.via === 'owner' ? 'the owner' : 'an admin'}`}
            meta={
              s.memberCount != null ? (
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  {s.memberCount} {s.memberCount === 1 ? 'member' : 'members'}
                </span>
              ) : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}
