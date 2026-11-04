import { describe, expect, it } from 'vitest'
import { veraSettingCard, veraSettingKnown, veraSettingValue, veraSettingWhere, veraSettingsGuide } from './space-settings'

describe('Vera proposes a Space setting (LIVE-2186)', () => {
  it('checks a time zone against the tz database and trims it', () => {
    expect(veraSettingValue('calendar.time_zone', ' America/New_York ')).toBe('America/New_York')
    for (const bad of ['Mars/Olympus', 'EST5EDT; drop', '', 42]) expect(veraSettingValue('calendar.time_zone', bad)).toBeNull()
  })

  it('takes only on or off for a toggle', () => {
    expect(veraSettingValue('calendar.sky_markers', 'on')).toBe('on')
    expect(veraSettingValue('calendar.sky_markers', 'off')).toBe('off')
    for (const bad of ['yes', 'true', true, '']) expect(veraSettingValue('calendar.sky_markers', bad)).toBeNull()
  })

  it('knows nothing off its list, including inherited object keys', () => {
    for (const id of ['payments.payouts', 'toString', '__proto__', '']) {
      expect(veraSettingKnown(id), id).toBe(false)
      expect(veraSettingCard(id, 'on'), id).toBeNull()
    }
  })

  it('words the card from the checked value', () => {
    expect(veraSettingCard('calendar.time_zone', 'America/Chicago')).toBe("Keep this Space's dates in America/Chicago?")
    expect(veraSettingCard('calendar.sky_markers', 'off')).toBe("Hide sky markers on this Space's calendar?")
    expect(veraSettingCard('calendar.sky_markers', 'on')).toBe("Show sky markers on this Space's calendar?")
    expect(veraSettingWhere('calendar.sky_markers', 'sunrise')).toBe('/spaces/sunrise/settings/calendar')
  })

  it('lists each setting that applies with its value now, and nothing when none applies', () => {
    const guide = veraSettingsGuide('sunrise', { 'calendar.time_zone': 'America/Chicago', 'calendar.sky_markers': 'off', 'nope.x': 'y' })
    expect(guide).toContain('set_space_setting tool (space "sunrise"')
    expect(guide).toContain('- calendar.time_zone (Calendar time zone): The zone the Space keeps its dates in. Now: America/Chicago.')
    expect(guide).toContain('- calendar.sky_markers (Sky markers):')
    expect(guide).not.toContain('nope.x')
    expect(veraSettingsGuide('sunrise', {})).toBe('')
  })
})
