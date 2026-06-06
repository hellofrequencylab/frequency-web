'use server'

import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveSplashOverride } from '@/lib/onboarding/sequence-overrides'
import type { SequenceSplash } from '@/lib/onboarding/beta-sequences'

export async function saveSequenceSplash(slug: string, splash: SequenceSplash): Promise<{ ok: boolean }> {
  if (!(await getJanitor())) return { ok: false }
  const me = await getCallerProfile()
  await saveSplashOverride(slug, splash, me?.id ?? null)
  revalidatePath(`/beta/${slug}`)
  revalidatePath(`/pages/sequences/${slug}/edit`)
  return { ok: true }
}

// Upload a hero image for the splash editor to the public `site-media` bucket and
// return its URL. Janitor-gated (the sequences editor's own gate), so it doesn't ride
// the staff 'marketer' capability that the Puck image field uses.
export async function uploadSplashImage(formData: FormData): Promise<{ url: string } | { error: string }> {
  if (!(await getJanitor())) return { error: 'Sequences are janitor-only.' }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: 'No file selected.' }
  if (file.size > 8 * 1024 * 1024) return { error: 'Image must be under 8MB.' }

  const admin = createAdminClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const path = `splash/${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}.${ext}`
  const bytes = new Uint8Array(await file.arrayBuffer())
  const { error } = await admin.storage
    .from('site-media')
    .upload(path, bytes, { contentType: file.type || 'image/jpeg', upsert: false })
  if (error) return { error: error.message }
  const { data } = admin.storage.from('site-media').getPublicUrl(path)
  return { url: data.publicUrl }
}
