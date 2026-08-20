import { notFound } from 'next/navigation'
import { QrCode, ScanLine } from 'lucide-react'
import { requireProfileId, getCallerProfile } from '@/lib/auth'
import { resolveQrStudio, type QrStudioConfig } from '@/lib/elements/qr-studio'
import { isPaidViewer } from '@/lib/core/viewer-hats'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle, withMemberAvatar, type QrStyle } from '@/lib/qr/style'
import { ensureMemberCodes, type MemberCodePurpose } from '@/lib/qr/member-codes'
import { listMarketingTargets, MARKETING_CODE_LIMIT } from '@/lib/qr/marketing'
import { parseVcard } from '@/lib/vcard'
import { isGoogleWalletConfigured } from '@/lib/wallet/google'
import { MemberCodes, type MemberCodeCard } from './member-codes'
import { MarketingCodes, type MarketingCard } from './marketing-codes'
import { VcardEditor } from './vcard-editor'
import { updateMyVcard } from './actions'
import { FocusTemplate } from '@/components/templates'

export const dynamic = 'force-dynamic'

// Personal member surface: titled for the tab, kept out of the index.
export const metadata = { title: 'Your codes', robots: { index: false } }

// A member's personal codes hub. Everyone gets three editable codes (connect /
// referral / gift), provisioned on first visit, tied into The Quest (referral +
// gift award zaps) and built for personal outreach. All encode /q/<slug>, so scans
// are tracked and the design is editable without reprinting.
export default async function CodesPage() {
  const profileId = await requireProfileId()
  const supabase = await createClient()
  const { data: me } = await supabase
    .from('profiles')
    .select('handle, display_name, avatar_url, vcard')
    .eq('id', profileId)
    .maybeSingle()
  if (!me?.handle) notFound()

  const codes = await ensureMemberCodes(profileId, me.handle)

  const admin = createAdminClient()
  const { count: referralCount } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by_profile_id', profileId)

  const isCrew = await isPaidViewer()

  // The qr-studio ELEMENT config (LIVE-066, mirrors the header pages' resolveHeaderElement call): which
  // design controls THIS member may use. Role-gated, so a plain member loses the editor-tier controls
  // (eye color, gradient, logo, frame) unless the operator lowers those tiers in /admin/elements.
  const caller = await getCallerProfile()
  const qrConfig = await resolveQrStudio({
    viewer: { communityRole: caller?.community_role ?? null, webRole: caller?.webRole ?? null },
  })

  const cards: MemberCodeCard[] = codes.map((c) => {
    const base = parseStyle(c.style)
    const url = shortLinkUrl(c.slug)
    // The personal `connect` code always centers the member's CURRENT profile pic, rounded; the
    // avatar is layered on for the rendered SVG only, so the editor below still tunes the base
    // design (and saving never bakes a soon-stale avatar URL into the stored style).
    const renderStyle: QrStyle =
      c.purpose === 'connect' ? withMemberAvatar(base, me.avatar_url) : base
    return {
      id: c.id,
      purpose: c.purpose as MemberCodePurpose,
      title: c.title,
      slug: c.slug,
      url,
      scans: c.scan_count,
      style: base,
      svg: renderStyledQrSvg(url, renderStyle, 220),
    }
  })

  return (
    <FocusTemplate
      width="wide"
      title={<span className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary-strong" /> Your codes</span>}
      description="Your personal QR codes. Share them in person or in your outreach. Design each one, and watch the scans add up."
    >
      <div className="space-y-6">
        <MemberCodes cards={cards} referralCount={referralCount ?? 0} walletEnabled={isGoogleWalletConfigured()} qrConfig={qrConfig} />

        <VcardEditor config={parseVcard(me.vcard)} handle={me.handle} onSave={updateMyVcard} />

        {isCrew && <CrewMarketing profileId={profileId} qrConfig={qrConfig} />}

        <div className="rounded-card border border-border bg-surface-elevated/50 p-4">
          <h2 className="flex items-center gap-2 text-body-sm font-bold text-text">
            <ScanLine className="w-4 h-4 text-primary-strong" /> Scanning a code
          </h2>
          <p className="mt-1 text-body-sm text-muted">
            Point your phone&apos;s camera at any Frequency QR (on a poster, plaque, or someone&apos;s
            screen) to connect, join, or send a Zap.
          </p>
        </div>
      </div>
    </FocusTemplate>
  )
}

// Crew-only: up to MARKETING_CODE_LIMIT funnel codes pointing at a circle/event
// the member is promoting. Rendered as a child so its data load stays out of the
// member-codes path for non-crew.
async function CrewMarketing({ profileId, qrConfig }: { profileId: string; qrConfig?: QrStudioConfig }) {
  const db = createAdminClient()
  const [{ data: rows }, targets] = await Promise.all([
    // Personal crew marketing codes ONLY: owner-owned, purpose-null, and NOT tenant-scoped to a Space.
    // A Space code now stamps owner_profile_id (for scan attribution) AND space_id, so this list must
    // exclude space codes or a member who created one for their Space would see it in their personal
    // funnel list.
    db
      .from('qr_codes')
      .select('id, slug, title, target_url, scan_count, style')
      .eq('owner_profile_id', profileId)
      .is('purpose', null)
      .is('space_id', null)
      .order('created_at', { ascending: false }),
    listMarketingTargets(profileId),
  ])

  const cards: MarketingCard[] = (rows ?? []).map((r) => {
    const style = parseStyle(r.style)
    const url = shortLinkUrl(r.slug)
    return {
      id: r.id,
      title: r.title,
      slug: r.slug,
      url,
      targetPath: r.target_url ?? '',
      scans: r.scan_count,
      style,
      svg: renderStyledQrSvg(url, style, 200),
    }
  })

  return <MarketingCodes cards={cards} targets={targets} limit={MARKETING_CODE_LIMIT} qrConfig={qrConfig} />
}
