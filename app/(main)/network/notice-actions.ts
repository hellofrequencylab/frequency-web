'use server'

import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { networkNoticeCookie } from '@/components/people/network-notice-cookie'

/** Remember that this member closed the Members / Friends / My Contacts how-to notice. A cookie keyed on
 *  the member, so it follows them on this device and needs no column. Signed-out calls do nothing. */
export async function dismissNetworkNotice(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  ;(await cookies()).set(networkNoticeCookie(user.id), '1', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
  })
}
