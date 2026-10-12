import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

// The brand a Space's conversation email wears (owner ruling 2026-10-12: a message a Space sends
// through Frequency must look like the Space's, with Frequency as the small "sent with" line, not the
// masthead). One resolver, read fresh per send from the spaces row, so a renamed Space or a new logo
// shows on the next email with no cache to clear. FAIL-SAFE to null: a read fault renders the plain
// Frequency wrapper rather than refusing the send.

export interface EmailBrand {
  /** The display name: brand_name when the owner set one, else the Space's name. */
  name: string
  /** The Space's logo, when it has one. Absolute URL. */
  logoUrl: string | null
  /** The Space's accent colour as stored (a CSS colour string), when set. */
  accent: string | null
  /** The Space's public page. */
  url: string
}

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** Only an http(s) URL may become an <img src> in mail; anything else is dropped, not escaped. */
function safeHttpUrl(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!/^https?:\/\//i.test(s)) return null
  try {
    return new URL(s).toString()
  } catch {
    return null
  }
}

/** Only a plain CSS colour literal (hex, rgb(), hsl(), or a colour word) may reach an inline style. */
function safeColour(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim()
  if (!s || s.length > 40) return null
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i.test(s) ? s : null
}

export async function resolveSpaceEmailBrand(spaceId: string | null | undefined): Promise<EmailBrand | null> {
  if (!spaceId) return null
  try {
    const { data } = await createAdminClient()
      .from('spaces')
      .select('slug, name, brand_name, brand_logo_url, brand_accent')
      .eq('id', spaceId)
      .maybeSingle()
    if (!data) return null
    const name = (data.brand_name ?? '').trim() || (data.name ?? '').trim()
    if (!name) return null
    return {
      name,
      logoUrl: safeHttpUrl(data.brand_logo_url),
      accent: safeColour(data.brand_accent),
      url: `${APP}/spaces/${encodeURIComponent(data.slug)}`,
    }
  } catch {
    return null
  }
}
