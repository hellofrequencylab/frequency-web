'use server'

import type { Data } from '@measured/puck'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireJanitor } from '@/lib/page-editor/guard'
import { EDITABLE_PAGES, pathForSlug, isEditableSlug, resolveSpaceId } from '@/lib/page-editor/data'

// Space-scoped (Phase 0.5e, ENTITY-SPACES-BUILD §0.5.13): writes carry a spaceId, defaulting to
// the root space, so per-Space micro-site pages are possible later. The 4-slug isEditableSlug
// allowlist still gates every write below; full un-gating to per-Space authoring is Phase 5.
// `space_id` isn't in the generated types yet, so the upsert/update payloads are cast (ADR-246).

// Save + publish a page (MVP: publishing writes both the working draft and the
// live version, then revalidates the public route).
export async function publishPage(slug: string, data: Data, spaceId?: string | null): Promise<void> {
  const janitor = await requireJanitor()
  if (!isEditableSlug(slug)) return
  const meta = EDITABLE_PAGES.find((p) => p.slug === slug)!
  const sid = await resolveSpaceId(spaceId)

  const db = createAdminClient()
  const now = new Date().toISOString()
  await db.from('pages').upsert(
    {
      slug,
      space_id: sid,
      title: meta.title,
      data,
      published_data: data,
      status: 'published',
      updated_at: now,
      updated_by: janitor.profileId,
      published_at: now,
    } as never,
    { onConflict: 'slug' },
  )

  revalidatePath(pathForSlug(slug))
  revalidatePath('/pages')
}

// Unpublish — clear the live document so the public route falls back to the
// hardcoded (coded) design. The working draft (`data`) is kept so the editor
// content isn't lost; only `published_data` is cleared.
export async function unpublishPage(slug: string, spaceId?: string | null): Promise<void> {
  const janitor = await requireJanitor()
  if (!isEditableSlug(slug)) return
  const sid = await resolveSpaceId(spaceId)

  const db = createAdminClient()
  // space_id isn't in the generated types yet, so reach the .eq('space_id', …) scope with an
  // untyped builder (ADR-246) so we only clear THIS space's published document.
  const q = db.from('pages').update({
    published_data: null,
    status: 'draft',
    published_at: null,
    updated_at: new Date().toISOString(),
    updated_by: janitor.profileId,
  }) as unknown as {
    eq: (col: string, val: string) => { eq: (col: string, val: string | null) => Promise<unknown> }
  }
  await q.eq('slug', slug).eq('space_id', sid)

  revalidatePath(pathForSlug(slug))
  revalidatePath('/pages')
}
