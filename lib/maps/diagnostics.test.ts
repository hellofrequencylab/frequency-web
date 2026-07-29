import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapDiag, resetMapDiagForTests } from './diagnostics'

// The diagnostic exists because every map failure was silent. Two properties have to hold or
// it makes things worse rather than better:
//
//   1. It must NOT SPAM. A vector map that cannot reach its tile host fails once per tile —
//      dozens of times a second. An undeduped line would bury the one useful message and
//      would itself be a performance problem.
//   2. It must NEVER print the key. The browsable key is public by construction, but a line
//      in the console travels into screenshots, bug reports and pasted transcripts, and there
//      is no reason to help it.

describe('mapDiag', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetMapDiagForTests()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('emits one structured line and says so', () => {
    expect(mapDiag('maps.no_tiles', { style: 'https://example.test/style.json' })).toBe(true)
    expect(warn).toHaveBeenCalledTimes(1)

    const [tag, body] = warn.mock.calls[0] as [string, string]
    expect(tag).toBe('[maps]')
    const parsed = JSON.parse(body)
    expect(parsed.event).toBe('maps.no_tiles')
    expect(parsed.style).toBe('https://example.test/style.json')
    // Always names the build, so "did the fix deploy?" is answerable from a console screenshot.
    expect(parsed).toHaveProperty('build')
  })

  it('dedupes by event, so forty dead tiles are one line', () => {
    for (let i = 0; i < 40; i++) mapDiag('maps.maplibre_error', { attempt: i })
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('reports again when the caller supplies a distinct key', () => {
    mapDiag('maps.maplibre_error', { sourceId: 'openmaptiles' }, 'maps.maplibre_error:tiles:404')
    mapDiag('maps.maplibre_error', { sourceId: 'sprite' }, 'maps.maplibre_error:sprite:403')
    mapDiag('maps.maplibre_error', { sourceId: 'tiles' }, 'maps.maplibre_error:tiles:404')
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('returns false when deduped, so a caller can skip follow-up work', () => {
    expect(mapDiag('maps.provider_fallback')).toBe(true)
    expect(mapDiag('maps.provider_fallback')).toBe(false)
  })

  it('carries only what the caller passed — no key, no secret', () => {
    mapDiag('maps.google_auth_failure', { keyPresent: true })
    const body = (warn.mock.calls[0] as [string, string])[1]
    expect(JSON.parse(body).keyPresent).toBe(true)
    expect(body).not.toMatch(/AIza/)
  })
})
