// Native push device tokens (LIVE-720): register and revoke rows in push_devices.
//
// The caller is the verified /api/v1 caller; the profile id comes from it, never from the body.
// Writes use the service role because a token is unique across the table: a phone that signs in
// as a different member moves its one row to the new profile (upsert on token), and no member
// policy could reassign a row it does not own. That reassignment is the point, so a shared phone
// never notifies the previous account.

import { createAdminClient } from '@/lib/supabase/admin'

export type PushPlatform = 'ios' | 'android'
export type PushProvider = 'expo' | 'apns'

export interface PushDeviceInput {
  platform: PushPlatform
  provider: PushProvider
  token: string
  appVersion?: string | null
}

/** Register (or refresh) this device for the caller. */
export async function registerPushDevice(profileId: string, input: PushDeviceInput): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await createAdminClient()
    .from('push_devices')
    .upsert(
      {
        profile_id: profileId,
        platform: input.platform,
        provider: input.provider,
        token: input.token,
        app_version: input.appVersion ?? null,
        last_seen_at: now,
      },
      { onConflict: 'token' },
    )
  if (error) throw new Error(`push_devices upsert failed: ${error.message}`)
}

/** Revoke one of the caller's devices (sign-out, notifications turned off). Another member's
 *  token is untouched: the delete is scoped to the caller's profile. */
export async function revokePushDevice(profileId: string, token: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('push_devices')
    .delete()
    .eq('profile_id', profileId)
    .eq('token', token)
  if (error) throw new Error(`push_devices delete failed: ${error.message}`)
}
