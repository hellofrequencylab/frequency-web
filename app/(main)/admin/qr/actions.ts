'use server'

// Admin write-path for QR/NFC codes. These are `nodes` rows (the existing
// physical-engagement registry, docs/ENGAGEMENT-ARCHITECTURE.md) — capture, the
// ledger, zaps, and partner redemptions are already wired, so authoring a code is
// just creating/editing a node. Writes go through the service-role client (nodes
// RLS denies all client reads/writes by design) and are gated to host+ here.
//
// Scope note (MVP): we author qr/nfc codes with no `location`/`secret`. Ghost-node
// geo authoring and signed payloads are a follow-up (they need a SECURITY DEFINER
// upsert RPC to build the PostGIS point + the /n claim flow to forward the secret).

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, type ActionResult } from '@/lib/action-result'

const TYPES = ['qr', 'nfc'] as const
const RULES = ['once_per_user', 'repeatable', 'once_global'] as const

export interface NodeInput {
  type: string
  label: string
  zaps_value: number
  capture_rule: string
  /** ISO datetime or '' / null for "no expiry". */
  valid_until: string | null
  /** Partner id to make this a plaque, or null for a community code. */
  partner_id: string | null
}

function clean(input: NodeInput) {
  if (!TYPES.includes(input.type as (typeof TYPES)[number])) return null
  if (!RULES.includes(input.capture_rule as (typeof RULES)[number])) return null
  const label = input.label.trim()
  if (!label) return null
  const zaps = Number.isFinite(input.zaps_value) ? Math.max(0, Math.round(input.zaps_value)) : 0
  return {
    type: input.type,
    label,
    zaps_value: zaps,
    capture_rule: input.capture_rule,
    valid_until: input.valid_until ? input.valid_until : null,
    partner_id: input.partner_id ? input.partner_id : null,
  }
}

/** Create a new code (node). Returns the new id so the UI can show its QR. */
export async function createNode(input: NodeInput): Promise<ActionResult<{ id: string }>> {
  await requireAdmin('host')
  const row = clean(input)
  if (!row) return fail('Give the code a label and valid settings.')

  const db = createAdminClient()
  const { data, error } = await db.from('nodes').insert(row).select('id').single()
  if (error || !data) return fail('Could not create the code.')

  revalidatePath('/admin/qr')
  return ok({ id: data.id as string })
}

/** Edit an existing code's reward, rule, expiry, or partner link. */
export async function updateNode(id: string, input: NodeInput): Promise<ActionResult> {
  await requireAdmin('host')
  const row = clean(input)
  if (!row) return fail('Give the code a label and valid settings.')

  const db = createAdminClient()
  const { error } = await db.from('nodes').update(row).eq('id', id)
  if (error) return fail('Could not save changes.')

  revalidatePath('/admin/qr')
  return ok()
}

/** Retire / re-activate a code without deleting its capture history. An inactive
 *  node 404s the scan landing page, so a printed code goes dark instantly. */
export async function setNodeActive(id: string, active: boolean): Promise<ActionResult> {
  await requireAdmin('host')
  const db = createAdminClient()
  const { error } = await db.from('nodes').update({ active }).eq('id', id)
  if (error) return fail('Could not update the code status.')

  revalidatePath('/admin/qr')
  return ok()
}
