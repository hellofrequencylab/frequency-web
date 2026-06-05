'use server'

// Admin write-path for QR/NFC codes. These are `nodes` rows (the existing
// physical-engagement registry, docs/ENGAGEMENT-ARCHITECTURE.md) — capture, the
// ledger, zaps, and partner redemptions are already wired, so authoring a code is
// just creating/editing a node. Writes go through the service-role client (nodes
// RLS denies all client reads/writes by design) and are gated to host+ here.
//
// Location-aware earning (ADR-106): a code can carry a geofence (lat/lng + radius).
// The PostGIS point is written via the `set_node_geo` RPC (PostgREST can't build a
// geography from lat/lng), and the `/n` claim flow forwards the device location so
// verifyCapture enforces proximity. Signed payloads remain a follow-up.

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStyle, type QrStyle } from '@/lib/qr/style'
import { ok, fail, type ActionResult } from '@/lib/action-result'
import type { Json } from '@/lib/database.types'

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
  /** Geofence (location-aware earning). Both null = no proximity requirement. */
  lat: number | null
  lng: number | null
  /** Required radius in metres when a geofence is set (default 100). */
  proximityM: number | null
  /** Total verified-claim cap ("first N win"); null = unlimited. */
  maxClaims: number | null
  /** Require a signed payload — the code carries a server-issued secret (`?s=`)
   *  that verifyCapture must match, so a forged /n/<id> URL can't claim. */
  requireSignature: boolean
  /** Visual QR design; sanitized by parseStyle before persisting. */
  style: QrStyle
}

/** A URL-safe, unguessable signing token for a node payload. */
function newSecret(): string {
  return randomBytes(18).toString('base64url')
}

/** Validate a geofence, or null when none/invalid (which CLEARS the requirement). */
function cleanGeo(input: NodeInput): { lng: number; lat: number; proximityM: number } | null {
  if (input.lat == null || input.lng == null) return null
  const lat = Number(input.lat)
  const lng = Number(input.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  const prox =
    Number.isFinite(input.proximityM) && input.proximityM
      ? Math.min(Math.max(Math.round(input.proximityM), 5), 5000)
      : 100
  return { lng, lat, proximityM: prox }
}

function clean(input: NodeInput) {
  if (!TYPES.includes(input.type as (typeof TYPES)[number])) return null
  if (!RULES.includes(input.capture_rule as (typeof RULES)[number])) return null
  const label = input.label.trim()
  if (!label) return null
  const zaps = Number.isFinite(input.zaps_value) ? Math.max(0, Math.round(input.zaps_value)) : 0
  const maxClaims =
    input.maxClaims != null && Number.isFinite(input.maxClaims) && input.maxClaims > 0
      ? Math.round(input.maxClaims)
      : null
  return {
    type: input.type,
    label,
    zaps_value: zaps,
    capture_rule: input.capture_rule,
    valid_until: input.valid_until ? input.valid_until : null,
    partner_id: input.partner_id ? input.partner_id : null,
    max_claims: maxClaims,
    style: parseStyle(input.style) as unknown as Json,
  }
}

/** Create a new code (node). Returns the new id so the UI can show its QR. */
export async function createNode(input: NodeInput): Promise<ActionResult<{ id: string }>> {
  await requireAdmin('host')
  const row = clean(input)
  if (!row) return fail('Give the code a label and valid settings.')

  const db = createAdminClient()
  const insertRow = input.requireSignature ? { ...row, secret: newSecret() } : row
  const { data, error } = await db.from('nodes').insert(insertRow).select('id').single()
  if (error || !data) return fail('Could not create the code.')

  const geo = cleanGeo(input)
  if (geo) {
    await db.rpc('set_node_geo', {
      p_node_id: data.id as string,
      p_lng: geo.lng,
      p_lat: geo.lat,
      p_proximity_m: geo.proximityM,
    })
  }

  revalidatePath('/admin/qr')
  return ok({ id: data.id as string })
}

/** Edit an existing code's reward, rule, expiry, or partner link. */
export async function updateNode(id: string, input: NodeInput): Promise<ActionResult> {
  await requireAdmin('host')
  const row = clean(input)
  if (!row) return fail('Give the code a label and valid settings.')

  const db = createAdminClient()
  // Signed payload: mint a secret when first required, keep it while it stays on,
  // clear it when turned off. (Re-minting each save would invalidate printed codes.)
  const { data: existing } = await db.from('nodes').select('secret').eq('id', id).maybeSingle()
  const secretPatch: { secret?: string | null } = input.requireSignature
    ? existing?.secret
      ? {}
      : { secret: newSecret() }
    : { secret: null }
  const { error } = await db.from('nodes').update({ ...row, ...secretPatch }).eq('id', id)
  if (error) return fail('Could not save changes.')

  // Set or clear the geofence (null lat/lng clears the proximity requirement — the
  // SQL fn branches on `p_lng is null`). gen-types can't see that the function's
  // params are nullable, so it types them non-null; cast to pass the intended nulls.
  const geo = cleanGeo(input)
  await db.rpc('set_node_geo', {
    p_node_id: id,
    p_lng: geo?.lng ?? null,
    p_lat: geo?.lat ?? null,
    p_proximity_m: geo?.proximityM ?? null,
  } as unknown as { p_node_id: string; p_lng: number; p_lat: number; p_proximity_m: number })

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
