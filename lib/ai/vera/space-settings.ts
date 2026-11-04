// VERA CHANGES A SPACE SETTING (LIVE-2186, Vera assistants plan phase V3: toggles, choices and numbers inside a
// Space's settings sections). The small, typed list of settings Vera may PROPOSE, each with what it means, where
// it lives, how a value is checked, and the plain words on the confirm card. The confirm path maps each id to the
// settings page's OWN guarded action, so a tap is the same write the page makes, re-checked against the caller.
// Prose, money, publishing and anything that cannot be undone are never on this list: Vera coaches those.
//
// Pure: no I/O. The turn reads each setting's value now and hands it in.

import { isValidTimeZone } from '@/lib/time/zone'

interface VeraSpaceSetting {
  /** The name on the guide and the card. */
  label: string
  /** What it does, in a line. */
  meaning: string
  /** The settings page it lives on. */
  where: (slug: string) => string
  /** The value the model may send, checked; null for anything else. */
  read: (value: string) => string | null
  /** The confirm card for a checked value. */
  card: (value: string) => string
  /** What the guide tells the model a value looks like. */
  values: string
}

const onOff = (value: string): string | null => (value === 'on' || value === 'off' ? value : null)

const SETTINGS: Record<string, VeraSpaceSetting> = {
  'calendar.time_zone': {
    label: 'Calendar time zone',
    meaning: 'The zone the Space keeps its dates in.',
    where: (slug) => `/spaces/${slug}/settings/calendar`,
    read: (value) => (isValidTimeZone(value.trim()) ? value.trim() : null),
    card: (value) => `Keep this Space's dates in ${value}?`,
    values: 'an IANA zone name such as America/Los_Angeles',
  },
  'calendar.sky_markers': {
    label: 'Sky markers',
    meaning: 'Moon phases and zodiac changes drawn on the calendar.',
    where: (slug) => `/spaces/${slug}/settings/calendar`,
    read: onOff,
    card: (value) => `${value === 'on' ? 'Show' : 'Hide'} sky markers on this Space's calendar?`,
    values: 'on or off',
  },
}

/** Whether Vera may propose this setting at all. */
export function veraSettingKnown(id: string): boolean {
  return Object.hasOwn(SETTINGS, id)
}

/** The checked value for a setting, or null when the setting or the value is not one Vera may propose. */
export function veraSettingValue(id: string, value: unknown): string | null {
  if (!veraSettingKnown(id) || typeof value !== 'string') return null
  return SETTINGS[id].read(value)
}

/** The plain words on the confirm card, or null for a setting or value Vera may not propose. */
export function veraSettingCard(id: string, value: unknown): string | null {
  const checked = veraSettingValue(id, value)
  return checked === null ? null : SETTINGS[id].card(checked)
}

/** Where a setting lives, for her "done" line. */
export function veraSettingWhere(id: string, slug: string): string {
  return veraSettingKnown(id) ? SETTINGS[id].where(slug) : `/spaces/${slug}/manage`
}

/** The guide lines for an owner or admin: each setting she may propose, what it does, its value now, the
 *  values it takes and where it lives. `now` holds only the settings that apply to this Space. */
export function veraSettingsGuide(slug: string, now: Record<string, string>): string {
  const ids = Object.keys(now).filter(veraSettingKnown)
  if (!ids.length) return ''
  return [
    `You can also PROPOSE one of these settings with the set_space_setting tool (space "${slug}", the setting id, and a value). Same card, same rule: nothing changes until they tap it.`,
    ...ids.map((id) => {
      const s = SETTINGS[id]
      return `- ${id} (${s.label}): ${s.meaning} Now: ${now[id]}. Values: ${s.values}. Where: ${s.where(slug)}`
    }),
  ].join('\n')
}
