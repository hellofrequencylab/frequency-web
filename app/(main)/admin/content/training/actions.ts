'use server'

import { revalidatePath } from 'next/cache'
import { requireStaffCap } from '@/lib/staff'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { parseInput, z } from '@/lib/validation'
import { TRAINING_TIERS } from '@/lib/onboarding/training-curriculum'
import { saveTierCurriculum, resetTierCurriculum } from '@/lib/onboarding/curriculum-store'
import type { CommunityRole } from '@/lib/core/roles'

// In-place curriculum editing (LIVE-690). Reading the authoring page stays open to community
// hosts and community staff; CHANGING what every promotion teaches is a community-staff write,
// so both actions gate on requireStaffCap('community', 'write') (it redirects anyone else).
// parseInput checks the payload's shape; the pure normalizeCurriculumEdit inside
// saveTierCurriculum then checks the content and writes only what it returns.

const STEP = z.object({ id: z.string().max(64).optional(), label: z.string().max(200), href: z.string().max(400) })
const EDIT = z.object({ title: z.string().max(200), blurb: z.string().max(1000), steps: z.array(STEP).max(50) })

function tierOf(role: string): CommunityRole | null {
  return (TRAINING_TIERS as readonly string[]).includes(role) ? (role as CommunityRole) : null
}

function refresh() {
  revalidatePath('/admin/content/training')
  revalidatePath('/training')
}

export async function saveTrainingTier(role: string, input: unknown): Promise<ActionResult> {
  const { profileId } = await requireStaffCap('community', 'write')
  const tier = tierOf(parseInput(z.string().max(32), role))
  if (!tier) return fail('That rung has no training path.')
  let edit: z.infer<typeof EDIT>
  try {
    edit = parseInput(EDIT, input)
  } catch {
    return fail('That edit could not be read. Reload the page and try again.')
  }
  const r = await saveTierCurriculum(tier, edit, profileId)
  if (!r.ok) return fail(r.error)
  refresh()
  return ok()
}

export async function resetTrainingTier(role: string): Promise<ActionResult> {
  const { profileId } = await requireStaffCap('community', 'write')
  const tier = tierOf(parseInput(z.string().max(32), role))
  if (!tier) return fail('That rung has no training path.')
  await resetTierCurriculum(tier, profileId)
  refresh()
  return ok()
}
