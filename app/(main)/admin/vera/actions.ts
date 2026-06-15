'use server'

import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { authorizeAction } from '@/lib/admin/guard'
import { saveVeraConfig } from '@/lib/ai/vera/config'
import { refreshFeaturedPosts, unfeaturePost } from '@/lib/ai/vera/feature-posts'
import type { ModelTier } from '@/lib/ai/models'

// PB.1h: the gate matches the page (requireAdmin('janitor', { staff: 'insights' }))
// — community janitor OR a staff role holding the `insights` domain (write), via the
// shared authorizeAction helper instead of a hand-rolled role check, so Vera tuning
// sits inside the staff matrix like the rest of the Insights dashboard. A denied
// caller still silently no-ops (the prior behavior).
async function veraOperator(): Promise<{ profileId: string } | null> {
  try {
    const caller = await authorizeAction(await getCallerProfile(), 'janitor', 'insights')
    return { profileId: caller.id }
  } catch {
    return null
  }
}

/** Save the operator-tuned Vera config (janitor / insights staff). */
export async function saveVera(formData: FormData): Promise<void> {
  const staff = await veraOperator()
  if (!staff) return

  const str = (k: string, max = 2000) => String(formData.get(k) ?? '').slice(0, max).trim()
  const lines = (k: string) => str(k, 4000).split('\n').map((s) => s.trim()).filter(Boolean)
  const tier = (['haiku', 'sonnet', 'opus'].includes(str('tier')) ? str('tier') : 'haiku') as ModelTier
  const maxReplyChars = Math.min(2000, Math.max(80, Number(formData.get('maxReplyChars')) || 320))

  await saveVeraConfig(
    {
      styleNote: str('styleNote'),
      register: str('register') === 'hot' ? 'hot' : 'cool',
      tier,
      maxReplyChars,
      greeting: str('greeting'),
      induction: {
        oathHeading: str('oathHeading'),
        oathBody: str('oathBody'),
        introHeading: str('introHeading'),
        introBody: str('introBody'),
        oathLabels: [str('oath0'), str('oath1'), str('oath2')],
        heardAbout: lines('heardAbout'),
      },
    },
    staff.profileId,
  )
  revalidatePath('/admin/vera-ai')
}

/** Re-run Vera's auto-curation of the splash "showing up for each other" feed
 *  (janitor / insights staff). Best-effort: leaves the section untouched if AI is
 *  unavailable. */
export async function refreshFeatured(): Promise<void> {
  const staff = await veraOperator()
  if (!staff) return
  await refreshFeaturedPosts()
  revalidatePath('/admin/vera-ai')
  revalidatePath('/')
}

/** Operator veto: drop one post from the featured splash feed. */
export async function vetoFeatured(formData: FormData): Promise<void> {
  const staff = await veraOperator()
  if (!staff) return
  const postId = String(formData.get('postId') ?? '').trim()
  if (!postId) return
  await unfeaturePost(postId)
  revalidatePath('/admin/vera-ai')
  revalidatePath('/')
}
