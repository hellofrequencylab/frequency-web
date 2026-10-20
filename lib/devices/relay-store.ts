import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { envFlag, envStringOrNull } from '@/lib/env/string'
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env'
import {
  RELAY_COMMANDS,
  realtimeUrl,
  relayTopic,
  sanitizeAllowedCommands,
  signDeviceToken,
  type RelayCommand,
} from './relay'
import { consoleStaffGate, type ScannerDevice } from './store'

// INTERNET RELAY, the IO half (LIVE-1155, ADR-1870, docs/LOYALTY.md section 8 "Internet relay").
// device_relay_settings is service-role only (scripts/table-grants.txt `internal`), so THIS file is
// the tenancy wall for it:
//   • the DEVICE side is pinned by the device credential: a device reads only its own row;
//   • the MEMBER side asks public.relay_manageable_devices(profile), the same SQL rule the
//     realtime.messages policy applies at join, so what the phone lists and what it may join agree.
// Reads FAIL-SAFE (relay off, empty list); writes FAIL-CLOSED on a manage miss.

/** The launch switch (`DEVICE_RELAY_ENABLED`, envFlag; gate in docs/RUNBOOKS.md "Internet relay").
 *  Off: the token route answers 404 and the member routes answer not_found, so nothing can join. */
export function deviceRelayEnabled(): boolean {
  return envFlag('DEVICE_RELAY_ENABLED')
}

/** The project JWT secret the device token is signed with. Server only; null when not configured. */
function relaySigningSecret(): string | null {
  const s = envStringOrNull('SUPABASE_JWT_SECRET')
  return s && s.length >= 32 ? s : null
}

interface RelaySetting {
  /** Whether a row exists. A device with no row has never been set up for the relay. */
  stored: boolean
  enabled: boolean
  allowedCmds: RelayCommand[]
  ownerProfileId: string | null
}

const OFF: RelaySetting = { stored: false, enabled: false, allowedCmds: [], ownerProfileId: null }

/** The device's relay setting. No row, or any error, reads as OFF. */
async function readRelaySetting(deviceId: string): Promise<RelaySetting> {
  try {
    const { data } = await createAdminClient()
      .from('device_relay_settings')
      .select('relay_enabled, relay_allowed_cmds, owner_profile_id')
      .eq('device_id', deviceId)
      .maybeSingle()
    if (!data) return OFF
    return {
      stored: true,
      enabled: data.relay_enabled === true,
      allowedCmds: sanitizeAllowedCommands(data.relay_allowed_cmds),
      ownerProfileId: data.owner_profile_id,
    }
  } catch {
    return OFF
  }
}

type RelayTokenOutcome =
  | {
      ok: true
      token: string
      expires_at: number
      channel: string
      realtime_url: string
      apikey: string
      allowed_cmds: RelayCommand[]
    }
  | { ok: false; reason: 'relay_disabled' | 'not_configured' }

/**
 * Mint the authenticated device's Realtime token. Refuses while the device's relay is off (the
 * owner's server-side switch) and when the signing secret is not configured. The device id comes
 * from the credential, never the body, so a device can only ever get a token for its own channel.
 */
export async function mintRelayToken(device: ScannerDevice): Promise<RelayTokenOutcome> {
  const secret = relaySigningSecret()
  if (!secret) return { ok: false, reason: 'not_configured' }
  const setting = await readRelaySetting(device.id)
  if (!setting.enabled) return { ok: false, reason: 'relay_disabled' }
  const { token, claims } = signDeviceToken(device.id, secret)
  return {
    ok: true,
    token,
    expires_at: claims.exp,
    channel: relayTopic(device.id),
    realtime_url: realtimeUrl(supabaseUrl()),
    apikey: supabaseAnonKey(),
    allowed_cmds: setting.allowedCmds,
  }
}

/** A device on the member's list. */
interface ManagedDevice {
  id: string
  label: string
  space: { id: string; name: string; slug: string | null } | null
  channel: string
  relayEnabled: boolean
  allowedCmds: RelayCommand[]
  owned: boolean
  lastSeenAt: string | null
}

interface ManageableRow {
  device_id: string
  space_id: string
  label: string
  relay_enabled: boolean
  last_seen_at: string | null
}

async function manageableRows(profileId: string): Promise<ManageableRow[]> {
  const { data, error } = await createAdminClient().rpc('relay_manageable_devices', { p_profile_id: profileId })
  if (error) throw error
  return (data ?? []) as ManageableRow[]
}

/** Every device the member manages (owner, Space owner or Space admin), newest contact first. */
export async function listManagedDevices(profileId: string): Promise<ManagedDevice[]> {
  try {
    const rows = await manageableRows(profileId)
    if (rows.length === 0) return []
    const db = createAdminClient()
    const ids = rows.map((r) => r.device_id)
    const spaceIds = [...new Set(rows.map((r) => r.space_id))]
    const [{ data: settings }, { data: spaces }] = await Promise.all([
      db.from('device_relay_settings').select('device_id, relay_allowed_cmds, owner_profile_id').in('device_id', ids),
      db.from('spaces').select('id, name, slug').in('id', spaceIds),
    ])
    const bySetting = new Map((settings ?? []).map((s) => [s.device_id, s]))
    const bySpace = new Map((spaces ?? []).map((s) => [s.id, s]))
    return rows
      .map((r) => {
        const s = bySetting.get(r.device_id)
        const sp = bySpace.get(r.space_id)
        return {
          id: r.device_id,
          label: r.label,
          space: sp ? { id: sp.id, name: sp.name, slug: sp.slug ?? null } : null,
          channel: relayTopic(r.device_id),
          relayEnabled: r.relay_enabled === true,
          allowedCmds: s ? sanitizeAllowedCommands(s.relay_allowed_cmds) : [...RELAY_COMMANDS],
          owned: s?.owner_profile_id === profileId,
          lastSeenAt: r.last_seen_at,
        }
      })
      .sort((a, b) => (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''))
  } catch {
    return []
  }
}

interface RelaySettingPatch {
  relayEnabled?: boolean
  allowedCmds?: string[]
  /** `me` makes the caller the device's personal owner. There is no "none": an owner who is not a
   *  Space admin would lock themselves out, and a Space admin re-claims by sending `me`. */
  owner?: 'me'
}

/**
 * Change a device's relay setting as a member who manages it. Returns the device as listed, or
 * null when the member does not manage it (the route answers not_found, so an id cannot be probed).
 */
export async function updateRelaySetting(
  profileId: string,
  deviceId: string,
  patch: RelaySettingPatch,
): Promise<ManagedDevice | null> {
  const rows = await manageableRows(profileId)
  if (!rows.some((r) => r.device_id === deviceId)) return null
  const current = await readRelaySetting(deviceId)
  const { error } = await createAdminClient()
    .from('device_relay_settings')
    .upsert(
      {
        device_id: deviceId,
        relay_enabled: patch.relayEnabled ?? current.enabled,
        relay_allowed_cmds:
          patch.allowedCmds !== undefined
            ? sanitizeAllowedCommands(patch.allowedCmds)
            : current.stored
              ? current.allowedCmds
              : [...RELAY_COMMANDS],
        owner_profile_id: patch.owner === 'me' ? profileId : current.ownerProfileId,
        updated_by: profileId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'device_id' },
    )
  if (error) throw error
  return (await listManagedDevices(profileId)).find((d) => d.id === deviceId) ?? null
}

/** A device on the staff console's relay list. */
export interface ConsoleRelayDevice {
  deviceId: string
  label: string
  spaceName: string
  relayEnabled: boolean
  lastSeenAt: string | null
}

/**
 * Every active device, for the staff USB console's internet tab (/admin/cyberunicorn), newest contact
 * first. Platform staff only (consoleStaffGate); null on a gate miss, [] on any read error.
 * Listing is not joining: the realtime.messages policy still decides who may open `device:<id>`.
 */
export async function listRelayDevicesForStaff(): Promise<ConsoleRelayDevice[] | null> {
  if (!(await consoleStaffGate())) return null
  try {
    const db = createAdminClient()
    const { data: devices } = await db
      .from('scanner_devices')
      .select('id, label, last_seen_at, spaces(name, brand_name)')
      .eq('active', true)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .limit(200)
    if (!devices || devices.length === 0) return []
    const { data: settings } = await db
      .from('device_relay_settings')
      .select('device_id, relay_enabled')
      .in('device_id', devices.map((d) => d.id))
    const enabled = new Set((settings ?? []).filter((s) => s.relay_enabled === true).map((s) => s.device_id))
    return devices.map((d) => {
      const sp = d.spaces as unknown as { name: string | null; brand_name: string | null } | null
      return {
        deviceId: d.id,
        label: d.label,
        spaceName: sp?.brand_name?.trim() || sp?.name?.trim() || 'Space',
        relayEnabled: enabled.has(d.id),
        lastSeenAt: d.last_seen_at,
      }
    })
  } catch {
    return []
  }
}

/**
 * Switch a device's relay on or off from the staff console. Platform staff only (consoleStaffGate);
 * false on a gate miss or an unknown or retired device. A device with no row gets the default
 * allow-list, the same as a member switching it on for the first time.
 */
export async function setRelayEnabledForStaff(deviceId: string, on: boolean): Promise<boolean> {
  const gate = await consoleStaffGate()
  if (!gate) return false
  const db = createAdminClient()
  const { data: device } = await db.from('scanner_devices').select('id').eq('id', deviceId).eq('active', true).maybeSingle()
  if (!device) return false
  const current = await readRelaySetting(deviceId)
  const { error } = await db.from('device_relay_settings').upsert(
    {
      device_id: deviceId,
      relay_enabled: on,
      relay_allowed_cmds: current.stored ? current.allowedCmds : [...RELAY_COMMANDS],
      owner_profile_id: current.ownerProfileId,
      updated_by: gate.callerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' },
  )
  if (error) throw error
  return true
}
