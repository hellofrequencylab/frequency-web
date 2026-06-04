'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveVeraConfig } from '@/lib/ai/vera/config'
import { refreshFeaturedPosts, unfeaturePost } from '@/lib/ai/vera/feature-posts'
import type { ModelTier } from '@/lib/ai/models'

async function janitor(): Promise<{ profileId: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await createAdminClient()
    .from('profiles')
    .select('id, community_role')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  if (!data || data.community_role !== 'janitor') return null
  return { profileId: data.id }
}

/** Save the operator-tuned Vera config (janitor only). */
export async function saveVera(formData: FormData): Promise<void> {
  const staff = await janitor()
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
  revalidatePath('/admin/vera')
}

/** Re-run Vera's auto-curation of the splash "showing up for each other" feed
 *  (janitor only). Best-effort: leaves the section untouched if AI is unavailable. */
export async function refreshFeatured(): Promise<void> {
  const staff = await janitor()
  if (!staff) return
  await refreshFeaturedPosts()
  revalidatePath('/admin/vera')
  revalidatePath('/')
}

/** Janitor veto: drop one post from the featured splash feed. */
export async function vetoFeatured(formData: FormData): Promise<void> {
  const staff = await janitor()
  if (!staff) return
  const postId = String(formData.get('postId') ?? '').trim()
  if (!postId) return
  await unfeaturePost(postId)
  revalidatePath('/admin/vera')
  revalidatePath('/')
}
