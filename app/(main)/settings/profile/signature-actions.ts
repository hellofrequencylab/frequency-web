'use server'

// Self-service: save the current user's email signature (appended to their outbound conversation emails).
// Uses the RLS-scoped client so a member can only ever edit their OWN profile row.

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { type ActionResult, ok, fail } from '@/lib/action-result'

export async function updateEmailSignatureAction(signature: string): Promise<ActionResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('Sign in to continue.')
  // Empty → NULL, so the auto-generated default ("<name> · frequencylocal.com") takes over again.
  const clean = (signature ?? '').slice(0, 1000).trim()
  const { error } = await supabase
    .from('profiles')
    .update({ email_signature: clean || null })
    .eq('auth_user_id', user.id)
  if (error) return fail('Could not save your signature. Try again.')
  revalidatePath('/settings/profile')
  return ok()
}
