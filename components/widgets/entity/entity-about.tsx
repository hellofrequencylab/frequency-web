import { getActiveSpace } from '@/lib/spaces/active-space'
import { createAdminClient } from '@/lib/supabase/admin'
import { ModuleCard } from '@/components/modules/module-card'

// ENTITY MODULE — About (ENTITY-SPACES-BUILD §B.2, row `entity-about`). A self-fetching RSC bound
// in the widget registry: it reads the active Space (request-scoped, lib/spaces/active-space.ts)
// and renders the entity's own About prose (spaces.about) in a kit `ModuleCard`. NULL when there's
// no active Space (a non-profile route) so binding it elsewhere is harmless.
//
// `spaces.about` isn't on the mapped Space object (it isn't in the generated DB types yet, ADR-246),
// so it's read here through the untyped admin client by the active Space id. When the owner hasn't
// written a bio yet, a quiet on-voice placeholder keeps the section legible (the skeptic test, §A.3):
// who this is, said plainly, with no narrated feelings and no em/en dashes.

/** Read the not-yet-typed `about` column for a Space id. Fail-safe to null. */
async function readAbout(spaceId: string): Promise<string | null> {
  try {
    const { data } = (await createAdminClient()
      .from('spaces')
      .select('about')
      .eq('id', spaceId)
      .maybeSingle()) as { data: { about?: string | null } | null }
    const about = data?.about?.trim()
    return about ? about : null
  } catch {
    return null
  }
}

export async function EntityAbout() {
  const space = getActiveSpace()
  if (!space) return null

  const name = space.brandName ?? space.name
  const about = await readAbout(space.id)

  // No bio yet: a quiet, plain placeholder (the brand name carries the meaning, proper nouns do the
  // magic) rather than an empty card.
  const body =
    about ?? `${name} hosts sessions, practices, and gatherings on Frequency. Browse what's on, start a practice, or book a time.`

  return (
    <ModuleCard title="About" tile>
      <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{body}</p>
    </ModuleCard>
  )
}
