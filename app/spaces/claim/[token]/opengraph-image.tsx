import { resolveSpaceClaim } from '@/lib/spaces/claim'
import { getSpaceById } from '@/lib/spaces/store'
import { spaceTypeLabel } from '@/components/spaces/space-type'
import { coverPlaceholderFor } from '@/lib/spaces/cover-placeholder'
import { claimCardResponse, CLAIM_OG_SIZE } from '@/lib/og/claim-card'
import { OG_CONTENT_TYPE } from '@/lib/og/deliver'
import { SITE_NAME } from '@/lib/site'

export const runtime = 'nodejs'
export const alt = `Claim your business on ${SITE_NAME}`
export const size = CLAIM_OG_SIZE
// JPEG, not PNG. claimCardResponse re-encodes Satori's lossless output (lib/og/deliver.ts):
// this card is a photograph across the full canvas, which is 1,776KB as PNG and 151KB as JPEG.
// This literal must match the bytes deliverCard actually serves or og:image:type is a lie.
export const contentType = OG_CONTENT_TYPE

// The share card for a SEEDED SPACE claim link (/spaces/claim/<token>). A marketing pitch aimed at the
// real owner: the Space's own cover + name so they recognize it, the DESIGNATOR pill (Coach /
// Practitioner / Business / Non Profit / ...) from the Mode registry, and the Frequency watermark. The
// token is the secret; a resolvable token means the operator sent it to the owner, so surfacing the
// brand is intended. An unknown / used token falls back to a neutral pitch card that reveals nothing.

// Per-type accent literals (Satori cannot resolve token names): business #1EB6C5 · nonprofit #0F8E78.
const ACCENT_BY_TYPE: Record<string, string> = { business: '#1EB6C5', nonprofit: '#0F8E78' }

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const claim = await resolveSpaceClaim(token)
  const space = claim ? await getSpaceById(claim.spaceId) : null

  if (!claim || !space) {
    // Neutral pitch card — no identity to leak for a used / unknown token.
    return claimCardResponse({
      name: 'Your business',
      pill: 'Business',
      noun: 'business',
      placeholderRelPath: '/images/site/community-dinner.jpg',
      accent: ACCENT_BY_TYPE.business,
    })
  }

  const brandName = space.brandName?.trim() || space.name
  // The DESIGNATOR only (Business / Non Profit). NOT the Mode registry's modeLabel: that resolves a
  // FOCUS (mode_variant) like "Service business", which docs/NAMING.md keeps internal — a FOCUS is
  // how an operator classifies a Space, never a label a member or a business owner is shown. The
  // owner spotted "Service business" on their own share card, which is exactly the leak the canon
  // forbids.
  const pill = spaceTypeLabel(space.type)
  const noun = space.type === 'nonprofit' ? 'nonprofit' : 'business'
  const accent =
    space.brandAccent && /^#[0-9a-fA-F]{6}$/.test(space.brandAccent)
      ? space.brandAccent
      : (ACCENT_BY_TYPE[space.type] ?? ACCENT_BY_TYPE.business)

  return claimCardResponse({
    name: brandName,
    pill,
    noun,
    coverUrl: space.coverImageUrl ?? null,
    placeholderRelPath: coverPlaceholderFor(space.id),
    logoUrl: space.brandLogoUrl ?? null,
    accent,
  })
}
