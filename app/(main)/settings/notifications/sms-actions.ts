'use server'

// SMS opt-in + preference server actions (ADR-256). Three actions back the settings UI:
//
//   • sendSmsCode(phone)     — normalize the phone, write a `pending_verification` row to
//                              the sms_consent ledger (carrying a HASHED code + expiry),
//                              and text the member the code via the gated send path.
//   • verifySmsCode(code)    — re-hash the submitted code, and on a match insert an
//                              `opted_in` row (express written consent recorded) + flip
//                              the master SMS switch on so texts can start.
//   • saveSmsPreferences(p)  — write the sms_* channel toggles + quiet-hours window.
//
// Fail-closed everywhere: nothing texts unless isSmsProvisioned() AND the per-member
// gates pass; sendSmsCode still records the pending row so the flow is testable before
// the legal track lands, but the code SMS itself no-ops until provisioned (the member
// then can't verify, which is correct — SMS is off until the A2P track clears).
//
// authz: every action establishes the caller with getMyProfileId() (the authz-guard
// contract) and only ever writes the caller's own rows. sms_consent + the sms_* columns
// are not in the generated DB types yet, so writes go through the untyped admin client
// (repo convention, ADR-246).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMyProfileId } from '@/lib/auth'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isSmsProvisioned } from '@/lib/comms/sms'
import { enqueueSms } from '@/lib/comms/sms-send'
import {
  normalizeE164,
  generateSmsCode,
  hashSmsCode,
  checkSmsCode,
  smsCodeKey,
  SMS_CODE_TTL_MINUTES,
  type PendingVerification,
} from '@/lib/comms/sms-verification'

// The verbatim express-written-consent disclosure (docs/A2P-REGISTRATION.md §4b). Stored
// on the opted_in row as legally-retained evidence. Voice + naming checked (no em dashes).
const CONSENT_TEXT =
  'Text me Frequency updates (event reminders and group messages). Message and data rates may apply. Consent is not a condition of any purchase. See our Privacy Policy.'

/** The untyped sms_consent table seam (not in generated types yet, ADR-246). */
function smsConsentTable() {
  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (col: string, v: string) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>
            }
          }
        }
      }
      insert: (rows: Record<string, unknown>[]) => Promise<{ error: unknown }>
    }
  }
  return db.from('sms_consent')
}

/**
 * Step 1: send a verification code to a phone. Records a `pending_verification` row with
 * the hashed code + expiry, then texts the code (gated). Returns the normalized phone so
 * the UI can show "we texted +1•••123".
 */
export async function sendSmsCode(rawPhone: string): Promise<ActionResult<{ phone: string }>> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const phone = normalizeE164(rawPhone)
  if (!phone) return fail('Enter a valid phone number, including the area code.')

  if (!isSmsProvisioned()) {
    // Honest, in-voice: texts are not live yet (the A2P legal track is the gate).
    return fail('Texts are not turned on yet. Check back soon.')
  }

  const code = generateSmsCode()
  const pending: PendingVerification = {
    codeHash: hashSmsCode(code, phone, smsCodeKey()),
    expiresAt: new Date(Date.now() + SMS_CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
  }

  try {
    const { error } = await smsConsentTable().insert([
      {
        profile_id: profileId,
        phone,
        status: 'pending_verification',
        source: 'member',
        note: JSON.stringify(pending),
      },
    ])
    if (error) return fail('Could not start verification. Try again.')
  } catch {
    return fail('Could not start verification. Try again.')
  }

  // Text the code through the durable outbox. The body carries sender identity + a STOP
  // line, matching the A2P sample messages (docs/A2P-REGISTRATION.md §4a).
  await enqueueSms({
    to: phone,
    body: `Frequency: Your verification code is ${code}. It expires in ${SMS_CODE_TTL_MINUTES} minutes. Reply STOP to opt out.`,
    profileId,
  })

  revalidatePath('/settings/notifications')
  return ok({ phone })
}

/**
 * Step 2: verify the submitted code. Reads the latest sms_consent row; if it is a live
 * `pending_verification`, checks the code (expiry, attempt cap, constant-time hash). On
 * a match, inserts an `opted_in` row with the retained consent text AND flips the master
 * sms_enabled switch on. On a mismatch, writes back an incremented attempt count.
 */
export async function verifySmsCode(rawCode: string): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const code = (rawCode ?? '').trim()
  if (!/^\d{4,8}$/.test(code)) return fail('Enter the code we texted you.')

  let latest: Record<string, unknown> | null = null
  try {
    const { data } = await smsConsentTable()
      .select('status, phone, note')
      .eq('profile_id', profileId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    latest = data
  } catch {
    return fail('Could not verify the code. Try again.')
  }

  const status = (latest as { status?: string } | null)?.status
  const phone = (latest as { phone?: string } | null)?.phone
  const noteRaw = (latest as { note?: string } | null)?.note
  if (status !== 'pending_verification' || !phone || !noteRaw) {
    return fail('Send yourself a new code to verify your number.')
  }

  let pending: PendingVerification
  try {
    pending = JSON.parse(noteRaw) as PendingVerification
  } catch {
    return fail('Send yourself a new code to verify your number.')
  }

  const result = checkSmsCode(pending, code, phone, smsCodeKey())
  if (!result.ok) {
    if (result.reason === 'expired') return fail('That code expired. Send yourself a new one.')
    if (result.reason === 'too_many_attempts') {
      return fail('Too many tries. Send yourself a new code.')
    }
    // Mismatch: record the failed attempt so the cap actually bites.
    try {
      const next: PendingVerification = { ...pending, attempts: pending.attempts + 1 }
      await smsConsentTable().insert([
        {
          profile_id: profileId,
          phone,
          status: 'pending_verification',
          source: 'member',
          note: JSON.stringify(next),
        },
      ])
    } catch {
      // best-effort; the cap is a defence-in-depth nicety, not the gate
    }
    return fail("That code didn't match. Check it and try again.")
  }

  // Match: record express written consent (opted_in) + turn the channel on.
  try {
    await smsConsentTable().insert([
      {
        profile_id: profileId,
        phone,
        status: 'opted_in',
        source: 'member',
        consent_text: CONSENT_TEXT,
      },
    ])
  } catch {
    return fail('Could not save your opt-in. Try again.')
  }

  // Flip the master SMS switch on (the per-category toggles default off; the member
  // turns the categories they want on in the grid). Lazy-create the prefs row.
  try {
    await (createAdminClient() as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: unknown }>
      }
    })
      .from('notification_preferences')
      .upsert({ profile_id: profileId, sms_enabled: true }, { onConflict: 'profile_id' })
  } catch {
    // The opt-in is recorded; a prefs write hiccup is non-fatal (the member can toggle).
  }

  revalidatePath('/settings/notifications')
  return ok()
}

export interface SmsPreferences {
  sms_enabled: boolean
  sms_dispatches: boolean
  sms_events: boolean
  sms_quiet_start_hour: number
  sms_quiet_end_hour: number
}

/**
 * Save the SMS channel toggles + quiet-hours window. The hours are clamped to the legal
 * 8am-9pm bound at READ time by lib/notification-preferences (a member can only narrow,
 * never widen), so we persist what the member set and let the guard clamp. Sanitizes the
 * hours to 0-23 integers regardless.
 */
export async function saveSmsPreferences(prefs: SmsPreferences): Promise<ActionResult> {
  const profileId = await getMyProfileId()
  if (!profileId) return fail('Not signed in')

  const hour = (n: unknown): number => {
    const v = Math.trunc(Number(n))
    return Number.isFinite(v) ? Math.max(0, Math.min(23, v)) : 8
  }

  try {
    const { error } = await (createAdminClient() as unknown as {
      from: (t: string) => {
        upsert: (
          row: Record<string, unknown>,
          opts: { onConflict: string },
        ) => Promise<{ error: unknown }>
      }
    })
      .from('notification_preferences')
      .upsert(
        {
          profile_id: profileId,
          sms_enabled: !!prefs.sms_enabled,
          sms_dispatches: !!prefs.sms_dispatches,
          sms_events: !!prefs.sms_events,
          sms_quiet_start_hour: hour(prefs.sms_quiet_start_hour),
          sms_quiet_end_hour: hour(prefs.sms_quiet_end_hour),
        },
        { onConflict: 'profile_id' },
      )
    if (error) return fail('Could not save your SMS settings. Try again.')
  } catch {
    return fail('Could not save your SMS settings. Try again.')
  }

  revalidatePath('/settings/notifications')
  return ok()
}
