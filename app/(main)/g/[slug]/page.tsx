import { redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import { requireProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInitials } from '@/lib/utils'
import { FocusTemplate } from '@/components/templates'
import { GiftButton } from './gift-button'

export const dynamic = 'force-dynamic'

// Confirm page for a "gift a zap" code (the /q resolver sends signed-in scanners
// here). One tap awards the owner a zap (idempotent per giver/day).
export default async function GiftPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = await requireProfileId()
  const { slug } = await params
  const admin = createAdminClient()

  const { data: code } = await admin
    .from('qr_codes')
    .select('owner_profile_id, active, purpose')
    .eq('slug', slug)
    .maybeSingle()
  if (!code || !code.active || code.purpose !== 'gift_zap' || !code.owner_profile_id) {
    redirect('/code-unavailable')
  }

  const { data: owner } = await admin
    .from('profiles')
    .select('display_name, handle, avatar_url')
    .eq('id', code.owner_profile_id)
    .maybeSingle()
  if (!owner) redirect('/code-unavailable')

  const isSelf = code.owner_profile_id === me
  const name = owner.display_name ?? `@${owner.handle}`

  return (
    <FocusTemplate
      width="narrow"
      divider={false}
      title={
        <span className="flex items-center justify-center gap-1.5">
          <Zap className="h-5 w-5 text-primary" /> Gift {name} a zap
        </span>
      }
    >
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-primary-bg text-primary-strong">
          {owner.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={owner.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-lg font-bold">{getInitials(name)}</span>
          )}
        </div>

        <div className="mt-6 flex justify-center">
          {isSelf ? (
            <p className="text-sm text-muted">This is your own code — share it for others to gift you a zap.</p>
          ) : (
            <GiftButton slug={slug} />
          )}
        </div>
      </div>
    </FocusTemplate>
  )
}
