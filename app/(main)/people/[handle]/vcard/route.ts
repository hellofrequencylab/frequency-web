import { createAdminClient } from '@/lib/supabase/admin'
import { connectUrl } from '@/lib/qr/links'
import { parseVcard, buildVcf } from '@/lib/vcard'

export const dynamic = 'force-dynamic'

// Public "Save contact" vCard for a member's profile code. Only the fields the
// member opted into (parseVcard) are included; returns 404 when they haven't
// enabled a card. The profile QR / profile page link here.
export async function GET(_request: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params
  const admin = createAdminClient()
  const { data: p } = await admin
    .from('profiles')
    .select('display_name, handle, bio, avatar_url, vcard')
    .eq('handle', handle)
    .maybeSingle()
  if (!p) return new Response('Not found', { status: 404 })

  const vcf = buildVcf(
    {
      displayName: p.display_name,
      handle: p.handle,
      bio: p.bio,
      avatarUrl: p.avatar_url,
      profileUrl: connectUrl(p.handle),
    },
    parseVcard(p.vcard),
  )
  if (!vcf) return new Response('No contact card', { status: 404 })

  return new Response(vcf, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': `attachment; filename="${p.handle}.vcf"`,
      'Cache-Control': 'public, max-age=300',
    },
  })
}
