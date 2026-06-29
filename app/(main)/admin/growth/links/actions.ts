'use server'

// The Link Generator's write path (BUILD-LIST P5 "unified link generator"). Composes a
// trackable destination (raw target + UTM) and stores it as a managed dynamic code in
// the EXISTING qr_codes table, reusing the same /q/<slug> resolver infrastructure the
// QR Studio writes (lib/qr/codes.ts validators, lib/qr/links.ts shortLinkUrl,
// lib/qr/render-styled.ts). No new table or RPC: a Link Generator link is a qr_codes
// row with destination_type 'url', exactly like a Studio dynamic link.
//
// AUTHZ (check:authz must stay green): every action is gated with the SAME staff
// capability the QR surface uses, requireAdmin('host', { staff: 'qr' }): the
// community host ladder OR the 'qr' staff domain at write. The admin client bypasses
// RLS, so this server-side guard is the authority; the UI gate is UX only. Reads
// fail-safe; writes fail-closed.

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import { generateSlug, normalizeSlug, isValidSlug } from '@/lib/qr/codes'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { DEFAULT_STYLE, type QrStyle } from '@/lib/qr/style'
import { composeLink, type UtmParams } from '@/lib/growth/link-compose'

const UNIQUE_VIOLATION = '23505'

export interface GenerateLinkInput {
  title: string
  /** The raw destination: an http(s) URL or a site-relative path. */
  target: string
  utm: UtmParams
  /** Optional custom slug; blank = a generated short slug. */
  slug?: string
}

export interface GeneratedLink {
  id: string
  slug: string
  /** The absolute /q/<slug> short link the printed QR / shared link encodes. */
  shortUrl: string
  /** The composed destination it redirects to (with UTM applied). */
  trackedUrl: string
  /** A styled QR for the short link, as an inline SVG string (server-rendered). */
  svg: string
}

/**
 * Compose + create a trackable link. Gated host+ OR staff 'qr' (the QR surface's
 * capability). Validation + UTM composition is the pure composeLink core; the write is
 * the same qr_codes insert link-actions.ts uses (destination_type 'url', source_tag
 * from the UTM). Returns the short link, the tracked destination, and a rendered QR SVG
 * so the caller can preview + copy without a second round-trip. Fail-closed.
 */
export async function generateLink(
  input: GenerateLinkInput,
): Promise<ActionResult<GeneratedLink>> {
  const { profileId } = await requireAdmin('host', { staff: 'qr' })

  const composed = composeLink({ title: input.title, target: input.target, utm: input.utm })
  if (typeof composed === 'string') return fail(composed)

  // Resolve a custom slug up front (validate before any DB attempt); else generate +
  // retry generated collisions, exactly like link-actions.ts createLink.
  const custom = input.slug ? normalizeSlug(input.slug) : ''
  if (input.slug && !isValidSlug(custom)) {
    return fail('Custom links use letters, numbers, and hyphens (3 to 48 characters).')
  }

  const db = createAdminClient()
  const style: QrStyle = DEFAULT_STYLE

  for (let attempt = 0; attempt < 6; attempt++) {
    const slug = custom || generateSlug()
    const { data, error } = await db
      .from('qr_codes')
      .insert({
        slug,
        title: composed.title,
        destination_type: 'url',
        target_url: composed.trackedUrl,
        source_tag: composed.sourceTag,
        active: true,
        created_by: profileId,
      })
      .select('id, slug')
      .single()

    if (!error && data) {
      revalidatePath('/admin/qr')
      const shortUrl = shortLinkUrl(data.slug)
      return ok<GeneratedLink>({
        id: data.id,
        slug: data.slug,
        shortUrl,
        trackedUrl: composed.trackedUrl,
        svg: renderStyledQrSvg(shortUrl, style, 200),
      })
    }
    if (error?.code === UNIQUE_VIOLATION) {
      if (custom) return fail('That custom link is already taken.')
      continue // generated collision, try another
    }
    return fail('Could not create the link. Try again.')
  }
  return fail('Could not generate a unique link. Try again.')
}
