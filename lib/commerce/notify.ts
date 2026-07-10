import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueueEmail } from '@/lib/email'
import { formatCents } from '@/lib/finance/dashboard'
import { SITE_URL, SITE_NAME } from '@/lib/site'

/** Minimal HTML escape for member-controlled strings dropped into an email body. */
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  )
}

export interface OrderNotifyInput {
  id: string
  ownerKind: 'platform' | 'profile' | 'space'
  ownerProfileId: string | null
  ownerSpaceId: string | null
  buyerProfileId: string | null
  amountCents: number
  currency: string
}

/**
 * Tell the seller they made a sale — an in-app notification AND an email.
 *
 * Called once per order from the settle path (recordCommerceOrderFromSession). The pending->paid
 * flip there is single-shot (guarded by `.eq('status','pending')`), so this never double-fires on a
 * Stripe webhook retry. FULLY BEST-EFFORT: a notification or email failure must never block or
 * reverse an order that is already paid, so every side effect is wrapped and swallowed.
 *
 * A platform (Frequency Store) sale has no member seller, so it is skipped.
 */
export async function notifySellerOfOrder(admin: SupabaseClient, order: OrderNotifyInput): Promise<void> {
  // Resolve the member seller AND where they manage the sale: a maker owns its own listing and
  // works orders at /market/manage; a Space listing routes to the owner + the Space's shop console.
  let sellerProfileId: string | null = order.ownerKind === 'profile' ? order.ownerProfileId : null
  let sellerHref = '/market/manage'
  if (order.ownerKind === 'space' && order.ownerSpaceId) {
    const { data } = await admin
      .from('spaces')
      .select('owner_profile_id, slug')
      .eq('id', order.ownerSpaceId)
      .maybeSingle()
    sellerProfileId = (data?.owner_profile_id as string | null) ?? null
    const slug = data?.slug as string | null | undefined
    if (slug) sellerHref = `/spaces/${slug}/settings/shop`
  }
  if (!sellerProfileId) return

  const amount = formatCents(order.amountCents, order.currency)

  // 1. In-app notification. The bell prefixes the buyer's (actor's) name, so `body` is the predicate.
  try {
    await admin.from('notifications').insert({
      recipient_id: sellerProfileId,
      actor_id: order.buyerProfileId,
      type: 'order_received',
      reference_type: 'commerce_order',
      reference_id: order.id,
      body: `placed a ${amount} order with you`,
    })
  } catch {
    /* best-effort */
  }

  // 2. Email. Profiles carry no email; resolve it off auth.users via the admin API.
  try {
    const { data: seller } = await admin
      .from('profiles')
      .select('auth_user_id, display_name')
      .eq('id', sellerProfileId)
      .maybeSingle()
    const authUserId = seller?.auth_user_id as string | undefined
    if (!authUserId) return
    const { data: userRes } = await admin.auth.admin.getUserById(authUserId)
    const to = userRes?.user?.email
    if (!to) return

    const name = (seller?.display_name as string | null) ?? null
    const sellerUrl = `${SITE_URL}${sellerHref}`
    await enqueueEmail({
      to,
      subject: `You made a sale on ${SITE_NAME}`,
      html: `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">
  <p>${name ? `Hi ${esc(name)}, ` : ''}you have a new order on ${esc(SITE_NAME)}.</p>
  <p><strong>Order total:</strong> ${amount}</p>
  <p><a href="${sellerUrl}" style="color:#4f46e5;font-weight:600">Manage this order</a> to arrange fulfillment.</p>
</div>`,
      text: `${name ? `Hi ${name}, ` : ''}you have a new order on ${SITE_NAME}. Order total: ${amount}. Manage it: ${sellerUrl}`,
    })
  } catch {
    /* best-effort */
  }
}
