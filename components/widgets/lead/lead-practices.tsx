import { Sparkles } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionHeader } from '@/components/ui/section-header'
import { EntityCard } from '@/components/cards/entity-card'
import { LeadCreatePrompt } from './lead-create-prompt'

// Leadership hub module: "Practices you authored" — the Practices this leader created (practices.
// created_by = me). Self-fetching RSC scoped to the caller via an inline created_by read (the
// lead-journeys inline-query pattern; the practices table isn't in the generated types, ADR-246, so
// the row shape is cast). ALWAYS renders (owner directive): no authored Practice -> a create prompt.
type AuthoredPractice = { id: string; title: string; status: string | null }

export async function LeadPractices(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  const { data } = await createAdminClient()
    .from('practices')
    .select('id, title, status')
    .eq('created_by', me.id)
    .order('created_at', { ascending: false })
    .limit(12)
  const authored = (data ?? []) as AuthoredPractice[]

  if (authored.length === 0) {
    return (
      <LeadCreatePrompt
        section="Practices you authored"
        icon={Sparkles}
        title="You have not authored a Practice yet"
        description="A Practice is a small, repeatable thing people do: a breath, a walk, a check-in. Build one and it joins the library for your circles to take on together."
        ctaHref="/practices/new"
        ctaLabel="Create a practice"
      />
    )
  }

  return (
    <section>
      <SectionHeader title="Practices you authored" count={authored.length} href="/practices" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {authored.map((p) => (
          <EntityCard
            key={p.id}
            href={`/practices/${p.id}`}
            anchor={
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
                <Sparkles className="h-5 w-5" aria-hidden />
              </span>
            }
            title={p.title}
            context={p.status && p.status !== 'published' ? `Status: ${p.status}` : undefined}
          />
        ))}
      </div>
    </section>
  )
}
