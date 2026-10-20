// Reply shapes for the v1 commands, from PROTOCOL.md §3. Device data is never trusted to match: every
// field is optional and screens read it defensively, so a firmware that sends more (or less) still
// renders. The planned commands' fields are "as agreed for v1" and may be renamed by their app branch.

export type SystemStatus = {
  os?: string
  version?: string
  bruce_version?: string
  heap_free?: number
  heap_min?: number
  uptime_s?: number
  wifi?: { connected?: boolean; ssid?: string; ip?: string; ap_ip?: string }
  ble?: { enabled?: boolean; connected?: number; at_boot?: boolean }
  hat?: { live?: string[]; probed_s_ago?: number | null }
}

export type AppsList = { apps?: { name: string; hidden?: boolean }[] }

export type HatProbe = {
  pn532?: boolean
  cc1101?: boolean
  nrf24?: boolean
  ir_likely?: boolean
  ook_likely?: boolean
  live_count?: number
  summary?: string
  advice?: string
}

export type LightShowState = {
  running?: boolean
  scene?: number
  scene_name?: string
  level?: number
  level_percent?: number
  level_count?: number
  pin?: number
  scenes?: string[]
  starting?: boolean
}

export type LedColor = { r?: number; g?: number; b?: number }
export type LightRead = { raw?: number; percent?: number }
export type SensorsRead = { sensors?: { name?: string; kind?: string; value?: number | string; unit?: string }[] }
/** A tag as the firmware's putCard() reports it (apps/remote/app_handlers.cpp): `uri` is what the tag
 *  holds and `kind` is checkUrl()'s verdict ("member card", "venue tag", ...). */
export type TagRead = { uid?: string; type?: string; ntag?: boolean; locked?: boolean; capacity?: number; uri?: string; kind?: string }
/** frequency.write_tag: the tag after the write, plus `written` as host + path (no query string). */
export type TagWritten = TagRead & { written?: string }
export type CliResult = { output?: string; result?: boolean; truncated?: boolean }

/** The hat modules `hat.live` can name, as a person reads them. */
export const HAT_NAMES: Record<string, string> = {
  pn532: 'PN532 NFC',
  cc1101: 'CC1101 sub-GHz radio',
  nrf24: 'nRF24 2.4 GHz radio',
  ir: 'Infrared',
  ook433: '433 MHz receiver',
}

/** Light Show brightness steps (PROTOCOL.md: 4/8/15/25/40 %). */
export const LIGHTSHOW_LEVELS = [4, 8, 15, 25, 40]

/** The LED app's modes, as proposed for v1. */
export const LED_MODES = ['off', 'solid', 'rainbow', 'breathe'] as const
