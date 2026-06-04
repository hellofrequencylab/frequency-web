import { notFound } from 'next/navigation'
import { QrCode, ScanLine } from 'lucide-react'
import { requireProfileId } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle, isSafeLogoSrc, type QrStyle } from '@/lib/qr/style'
import { ensureMemberCodes, type MemberCodePurpose } from '@/lib/qr/member-codes'
import { MemberCodes, type MemberCodeCard } from './member-codes'

export const dynamic = 'force-dynamic'

// A member's personal codes hub. Everyone gets three editable codes (connect /
// referral / gift), provisioned on first visit, tied into The Quest (referral +
// gift award zaps) and built for personal outreach. All encode /q/<slug>, so scans
// are tracked and the design is editable without reprinting.
export default async function CodesPage() {
  const profileId = await requireProfileId()
  const supabase = await createClient()
  const { data: me } = await supabase
    .from('profiles')
    .select('handle, display_name, avatar_url')
    .eq('id', profileId)
    .maybeSingle()
  if (!me?.handle) notFound()

  const codes = await ensureMemberCodes(profileId, me.handle)

  const admin = createAdminClient()
  const { count: referralCount } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('referred_by_profile_id', profileId)

  const avatar = me.avatar_url && isSafeLogoSrc(me.avatar_url) ? me.avatar_url : null

  const cards: MemberCodeCard[] = codes.map((c) => {
    const base = parseStyle(c.style)
    // Drop the member's avatar into the center by default (they can change it).
    const style: QrStyle = !base.logo && avatar ? { ...base, logo: avatar } : base
    const url = shortLinkUrl(c.slug)
    return {
      id: c.id,
      purpose: c.purpose as MemberCodePurpose,
      title: c.title,
      slug: c.slug,
      url,
      scans: c.scan_count,
      style,
      svg: renderStyledQrSvg(url, style, 220),
    }
  })

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-2">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-text">
          <QrCode className="h-5 w-5 text-primary-strong" /> Your codes
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your personal QR codes — share them in person or in your outreach. Design each one, and
          watch the scans add up.
        </p>
      </header>

      <MemberCodes cards={cards} referralCount={referralCount ?? 0} />

      <div className="rounded-2xl border border-border bg-surface-elevated/50 p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold text-text">
          <ScanLine className="w-4 h-4 text-primary-strong" /> Scanning a code
        </h2>
        <p className="mt-1 text-sm text-muted">
          Point your phone&apos;s camera at any Frequency QR — on a poster, plaque, or someone&apos;s
          screen — to connect, join, or send a zap.
        </p>
      </div>
    </div>
  )
}
