import type { Metadata } from 'next'
import { redirect, notFound } from 'next/navigation'
import { getMyProfileId } from '@/lib/auth'
import { getPractice, listSubcategories, getPracticeTagLabels } from '@/lib/practices'
import { getPillars } from '@/lib/pillars'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { PracticeBuilder } from '@/components/studio/practice/practice-builder'
import { PracticeComposer } from '@/components/studio/practice/practice-composer'

export const metadata: Metadata = { title: 'Edit practice' }
export const dynamic = 'force-dynamic'

// Edit a practice you created (ADR-096). Free for any member, on their OWN practices
// (ownership enforced). To change a library practice you don't own, the practice page
// offers "Remix" (fork → a private copy → here).
export default async function EditPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profileId = await getMyProfileId()
  if (!profileId) redirect(`/sign-in?next=/practices/${id}/edit`)

  const practice = await getPractice(id)
  if (!practice) notFound()
  const isAdmin = (await getGlobalCapabilities()).has('admin.access')
  if (practice.created_by !== profileId && !isAdmin) {
    // Not yours, and not an admin — you can only edit your own. (Remix a copy instead.)
    notFound()
  }

  const [pillars, subcategories, tags] = await Promise.all([
    getPillars(),
    listSubcategories(),
    getPracticeTagLabels(id),
  ])

  return (
    <PracticeBuilder
      id={practice.id}
      title={practice.title}
      summary={practice.summary}
      description={practice.description}
      body={practice.body}
      cadence={practice.cadence}
      durationMin={practice.duration_min}
      category={practice.category}
      timerKind={practice.timer_kind}
      movementConfig={practice.movement_config}
      icon={practice.icon}
      domainId={practice.domain_id}
      focusDetails={practice.focus_details ?? {}}
      subcategoryId={practice.subcategory_id}
      headerImage={practice.header_image}
      weightClass={practice.weight_class}
      pillars={pillars.map((p) => ({ id: p.id, name: p.name }))}
      subcategories={subcategories.map((s) => ({ id: s.id, domain_id: s.domain_id, name: s.name }))}
      initialTags={tags}
      isAdmin={isAdmin}
      rewardZaps={practice.reward_zaps}
      rewardNote={practice.reward_note}
      // Vera composer (ADR-358): "Build with Vera" until the practice has a guide, then "Edit with
      // Vera". Empty = no body yet, so a freshly-created draft opens ready to build.
      veraComposer={<PracticeComposer id={practice.id} isEmpty={!practice.body?.trim()} />}
    />
  )
}
