'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Data } from '@measured/puck'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireJanitor } from '@/lib/page-editor/guard'
import { EDITABLE_PAGES, pathForSlug, isEditableSlug } from '@/lib/page-editor/data'

// Save + publish a page (MVP: publishing writes both the working draft and the
// live version, then revalidates the public route).
export async function publishPage(slug: string, data: Data): Promise<void> {
  const janitor = await requireJanitor()
  if (!isEditableSlug(slug)) return
  const meta = EDITABLE_PAGES.find((p) => p.slug === slug)!

  const db = createAdminClient() as unknown as SupabaseClient
  const now = new Date().toISOString()
  await db.from('pages').upsert(
    {
      slug,
      title: meta.title,
      data,
      published_data: data,
      status: 'published',
      updated_at: now,
      updated_by: janitor.profileId,
      published_at: now,
    },
    { onConflict: 'slug' },
  )

  revalidatePath(pathForSlug(slug))
  revalidatePath('/pages')
}

// Save the working draft only (not yet wired to a UI button; kept for parity).
export async function savePageDraft(slug: string, data: Data): Promise<void> {
  const janitor = await requireJanitor()
  if (!isEditableSlug(slug)) return
  const meta = EDITABLE_PAGES.find((p) => p.slug === slug)!
  const db = createAdminClient() as unknown as SupabaseClient
  await db.from('pages').upsert(
    { slug, title: meta.title, data, updated_at: new Date().toISOString(), updated_by: janitor.profileId },
    { onConflict: 'slug' },
  )
}
