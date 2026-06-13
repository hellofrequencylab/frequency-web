'use server'

import type { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { createAdminClient } from '@/lib/supabase/admin'
import { type ActionResult, ok, fail } from '@/lib/action-result'
import { isLocationBand, isDiscoverableBy } from '@/lib/connections/location'
import { getConnectionSettings } from '@/lib/connections/connection-settings'

// Mutations for the connection layer (ADR-186). Two authorities:
//   • per-user prefs — the caller edits their OWN profile row (self-authorized).
//   • platform settings — admin+ only (the master toggles + reward economics).

// Who may tune the platform connection settings.
const SETTINGS_MIN_ROLE = 'admin' as const

interface MyPrefsInput {
  directoryVisible?: boolean
  discoverableBy?: string
  locationBand?: string
  discoveryRadiusM?: number
  ghostMode?: boolean
}

/** Save the caller's own connection/location preferences. Self-authorized: only ever
 *  writes the caller's profile row, and validates every field (enums + radius clamped
 *  to the platform bounds). */
export async function saveMyConnectionPrefs(input: MyPrefsInput): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in to change your settings.')

  const settings = await getConnectionSettings()
  const patch: Record<string, unknown> = {}

  if (typeof input.directoryVisible === 'boolean') patch.directory_visible = input.directoryVisible
  if (typeof input.ghostMode === 'boolean') patch.ghost_mode = input.ghostMode
  if (input.discoverableBy !== undefined) {
    if (!isDiscoverableBy(input.discoverableBy)) return fail('Invalid discoverability option.')
    patch.discoverable_by = input.discoverableBy
  }
  if (input.locationBand !== undefined) {
    if (!isLocationBand(input.locationBand)) return fail('Invalid location precision.')
    patch.location_band = input.locationBand
  }
  if (input.discoveryRadiusM !== undefined) {
    const r = Math.round(Number(input.discoveryRadiusM))
    if (!Number.isFinite(r)) return fail('Invalid radius.')
    patch.discovery_radius_m = Math.min(
      Math.max(r, settings.minDiscoveryRadiusM),
      settings.maxDiscoveryRadiusM,
    )
  }

  if (Object.keys(patch).length === 0) return ok()

  const db = createAdminClient()
  const { error } = await db.from('profiles').update(patch as Database['public']['Tables']['profiles']['Update']).eq('id', me.id)
  if (error) return fail(error.message)
  revalidatePath('/settings')
  revalidatePath('/network')
  return ok()
}

/** Turn live-location sharing on (capturing the device position once) or off. Live
 *  coordinates are stored separately from the private home location and are still only
 *  ever exposed at the member's chosen band — never as exact coordinates (ADR-186). */
export async function setLiveLocation(input: {
  enabled: boolean
  lat?: number
  lng?: number
}): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me) return fail('Sign in to change your settings.')
  const db = createAdminClient()

  if (!input.enabled) {
    const { error } = await db
      .from('profiles')
      .update({ location_mode: 'home', live_lat: null, live_lng: null, live_updated_at: null })
      .eq('id', me.id)
    if (error) return fail(error.message)
    revalidatePath('/settings/connections')
    return ok()
  }

  const lat = Number(input.lat)
  const lng = Number(input.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return fail('Couldn’t read a valid location from your device.')
  }
  const { error } = await db
    .from('profiles')
    .update({ location_mode: 'live', live_lat: lat, live_lng: lng, live_updated_at: new Date().toISOString() })
    .eq('id', me.id)
  if (error) return fail(error.message)
  revalidatePath('/settings/connections')
  revalidatePath('/network')
  return ok()
}

interface SettingsInput {
  directoryEnabled?: boolean
  proximityEnabled?: boolean
  mapsEnabled?: boolean
  resonanceEnabled?: boolean
  nearMissEnabled?: boolean
  defaultLocationBand?: string
  minDiscoveryRadiusM?: number
  maxDiscoveryRadiusM?: number
  rewardIntroduction?: number
  rewardWelcome?: number
}

/** Save the platform connection settings (the singleton). Admin+ only; the action is
 *  the authority (re-checks the role server-side). */
export async function saveConnectionSettings(input: SettingsInput): Promise<ActionResult> {
  const me = await getCallerProfile()
  if (!me || !atLeastRole(me.community_role, SETTINGS_MIN_ROLE)) return fail('Not allowed.')

  const patch: Record<string, unknown> = { updated_by: me.id, updated_at: new Date().toISOString() }
  const bools: [keyof SettingsInput, string][] = [
    ['directoryEnabled', 'directory_enabled'],
    ['proximityEnabled', 'proximity_enabled'],
    ['mapsEnabled', 'maps_enabled'],
    ['resonanceEnabled', 'resonance_enabled'],
    ['nearMissEnabled', 'near_miss_enabled'],
  ]
  for (const [k, col] of bools) {
    if (typeof input[k] === 'boolean') patch[col] = input[k]
  }
  if (input.defaultLocationBand !== undefined) {
    if (!isLocationBand(input.defaultLocationBand)) return fail('Invalid default precision.')
    patch.default_location_band = input.defaultLocationBand
  }
  const ints: [keyof SettingsInput, string, number, number][] = [
    ['minDiscoveryRadiusM', 'min_discovery_radius_m', 0, 200000],
    ['maxDiscoveryRadiusM', 'max_discovery_radius_m', 0, 200000],
    ['rewardIntroduction', 'reward_introduction', 0, 10000],
    ['rewardWelcome', 'reward_welcome', 0, 10000],
  ]
  for (const [k, col, lo, hi] of ints) {
    if (input[k] !== undefined) {
      const v = Math.round(Number(input[k]))
      if (!Number.isFinite(v)) return fail('Invalid number.')
      patch[col] = Math.min(Math.max(v, lo), hi)
    }
  }

  const db = createAdminClient()
  const { error } = await db.from('connection_settings').update(patch as Database['public']['Tables']['connection_settings']['Update']).eq('id', true)
  if (error) return fail(error.message)
  revalidatePath('/network')
  return ok()
}
