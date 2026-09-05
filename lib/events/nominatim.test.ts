import { describe, it, expect, afterEach } from 'vitest'
import { nominatimContact, nominatimUserAgent, nominatimMinIntervalMs } from './nominatim'

// scan2 L3-02 (2026-09-05). `.env.example` ships GEOCODER_CONTACT_EMAIL= and NOMINATIM_MIN_INTERVAL_MS=
// blank. Before the fix the User-Agent read `Frequency/1.0 ()` (the usage policy the module comment
// says it satisfies), and `Number('') === 0` passed the `v >= 0` guard so the 1100 ms spacing between
// calls vanished for the whole three-pass cascade.

const KEYS = ['GEOCODER_CONTACT_EMAIL', 'NEXT_PUBLIC_APP_URL', 'NOMINATIM_MIN_INTERVAL_MS'] as const
const saved = new Map<string, string | undefined>()
function setEnv(patch: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const k of KEYS) if (!saved.has(k)) saved.set(k, process.env[k])
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}
afterEach(() => {
  for (const [k, v] of saved) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  saved.clear()
})

describe('nominatimUserAgent', () => {
  it('never produces an empty contact: blank falls through to the app URL, then the project URL', () => {
    setEnv({ GEOCODER_CONTACT_EMAIL: '', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })
    expect(nominatimContact()).toBe('http://localhost:3000')
    expect(nominatimUserAgent()).toBe('Frequency/1.0 (http://localhost:3000)')
    setEnv({ GEOCODER_CONTACT_EMAIL: '', NEXT_PUBLIC_APP_URL: '' })
    expect(nominatimUserAgent()).toBe('Frequency/1.0 (https://frequencylocal.com)')
    expect(nominatimUserAgent()).not.toContain('()')
  })

  it('uses a set contact email', () => {
    setEnv({ GEOCODER_CONTACT_EMAIL: 'ops@example.test' })
    expect(nominatimUserAgent()).toBe('Frequency/1.0 (ops@example.test)')
  })
})

describe('nominatimMinIntervalMs', () => {
  it('keeps the polite 1100 ms default for unset, blank, and non-numeric', () => {
    setEnv({ NOMINATIM_MIN_INTERVAL_MS: undefined })
    expect(nominatimMinIntervalMs()).toBe(1100)
    setEnv({ NOMINATIM_MIN_INTERVAL_MS: '' })
    expect(nominatimMinIntervalMs()).toBe(1100)
    setEnv({ NOMINATIM_MIN_INTERVAL_MS: 'fast' })
    expect(nominatimMinIntervalMs()).toBe(1100)
    setEnv({ NOMINATIM_MIN_INTERVAL_MS: '-1' })
    expect(nominatimMinIntervalMs()).toBe(1100)
  })

  it('an explicit 0 is a deliberate 0 (what the venue-search test relies on)', () => {
    setEnv({ NOMINATIM_MIN_INTERVAL_MS: '0' })
    expect(nominatimMinIntervalMs()).toBe(0)
    setEnv({ NOMINATIM_MIN_INTERVAL_MS: '250' })
    expect(nominatimMinIntervalMs()).toBe(250)
  })
})
