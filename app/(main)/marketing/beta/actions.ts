'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireStaff } from '@/lib/staff'
import { sendBetaInviteEmail, sendBetaConfirmEmail } from '@/lib/email'
import { buildBetaConfirmUrl } from '@/lib/beta-tokens'
import { processQueue } from '@/lib/queue/outbox'
import { queueHandlers } from '@/lib/queue/handlers'
import { SITE_URL } from '@/lib/site'

// Manually drain the outbox (send all queued emails/pushes now). Useful when the
// Vercel cron isn't running (e.g. CRON_SECRET unset). Same logic as the cron.
export async function drainQueueNow(): Promise<void> {
  await requireStaff('marketer')
  await processQueue(queueHandlers, 100)
  revalidatePath('/marketing/beta')
}

// Admit a confirmed beta signup: mark invited + email them the "you're in" link.
export async function admitBetaSignup(id: string): Promise<void> {
  await requireStaff('marketer')
  const db = createAdminClient() as unknown as SupabaseClient

  const { data: c } = await db
    .from('contacts')
    .select('id, email, display_name, meta')
    .eq('id', id)
    .maybeSingle()
  if (!c) return

  const meta = {
    ...(c.meta && typeof c.meta === 'object' ? c.meta : {}),
    beta_status: 'invited',
    invited_at: new Date().toISOString(),
  }
  await db.from('contacts').update({ meta, updated_at: new Date().toISOString() }).eq('id', id)

  try {
    await sendBetaInviteEmail({
      to: c.email,
      signupUrl: `${SITE_URL.replace(/\/$/, '')}/sign-in`,
      displayName: c.display_name ?? null,
    })
  } catch (err) {
    console.error('[beta] failed to queue invite email:', err)
  }

  revalidatePath('/marketing/beta')
}

// Re-queue the double opt-in confirm email for a pending signup.
export async function resendBetaConfirm(id: string): Promise<void> {
  await requireStaff('marketer')
  const db = createAdminClient() as unknown as SupabaseClient

  const { data: c } = await db.from('contacts').select('email').eq('id', id).maybeSingle()
  if (!c) return

  try {
    await sendBetaConfirmEmail({ to: c.email, confirmUrl: buildBetaConfirmUrl(SITE_URL, c.email) })
  } catch (err) {
    console.error('[beta] failed to re-queue confirm email:', err)
  }

  revalidatePath('/marketing/beta')
}
