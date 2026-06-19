import { getActiveSpace } from '@/lib/spaces/active-space'
import { ModuleCard } from '@/components/modules/module-card'

// ENTITY MODULE — About (ENTITY-SPACES-BUILD §B.2, row `entity-about`). A self-fetching RSC bound
// in the widget registry: it reads the active Space (request-scoped, lib/spaces/active-space.ts)
// and renders the entity's story prose in a kit `ModuleCard`. NULL when there's no active Space
// (a non-profile route) so binding it elsewhere is harmless.
//
// COPY (CONTENT-VOICE §10): the starter line is plain, names the entity, narrates no feelings, no
// em/en dashes. A real Space overrides this with its own About copy once the settings surface
// ships (Epic 1.7); for now the brand name carries the meaning (proper nouns do the magic).
export async function EntityAbout() {
  const space = getActiveSpace()
  if (!space) return null

  const name = space.brandName ?? space.name
  // The Space's own About prose isn't a typed column yet (it lands with the settings surface,
  // Epic 1.7). Until then a plain, on-voice placeholder keeps the section legible (the skeptic
  // test, §A.3): who this is, said plainly.
  const about = `${name} hosts sessions, practices, and gatherings on Frequency. Browse what's on, start a practice, or book a time.`

  return (
    <ModuleCard title="About" tile>
      <p className="text-sm leading-relaxed text-muted">{about}</p>
    </ModuleCard>
  )
}
