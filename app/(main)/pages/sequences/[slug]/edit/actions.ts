'use server'

import { revalidatePath } from 'next/cache'
import { getJanitor } from '@/lib/page-editor/guard'
import { getCallerProfile } from '@/lib/auth'
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
