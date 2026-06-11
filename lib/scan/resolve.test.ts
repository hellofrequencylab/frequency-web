import { describe, it, expect } from 'vitest'
import { resolveScannedText } from './resolve'

const HOST = 'frequencylocal.com'

describe('resolveScannedText', () => {
  it('resolves our own absolute URLs to their path + search', () => {
    expect(resolveScannedText('https://frequencylocal.com/q/abc123', HOST)).toEqual({
      ok: true,
      path: '/q/abc123',
    })
    expect(resolveScannedText('https://frequencylocal.com/n/node-1?s=tok', HOST)).toEqual({
      ok: true,
      path: '/n/node-1?s=tok',
    })
    expect(resolveScannedText('https://www.frequencylocal.com/people/vera', HOST)).toEqual({
      ok: true,
      path: '/people/vera',
    })
  })

  it('resolves codes printed for production while on another of our hosts', () => {
    expect(resolveScannedText('https://frequencylocal.com/q/abc', 'preview.vercel.app')).toEqual({
      ok: true,
      path: '/q/abc',
    })
    expect(
      resolveScannedText('https://preview.vercel.app/q/abc', 'preview.vercel.app'),
    ).toEqual({ ok: true, path: '/q/abc' })
  })

  it('accepts bare same-site paths (NFC tags)', () => {
    expect(resolveScannedText('/n/node-9', HOST)).toEqual({ ok: true, path: '/n/node-9' })
    // protocol-relative is NOT a path
    expect(resolveScannedText('//evil.com/x', HOST)).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('reports foreign QR codes without following them', () => {
    expect(resolveScannedText('https://example.com/menu', HOST)).toEqual({
      ok: false,
      reason: 'foreign',
      host: 'example.com',
    })
  })

  it('rejects junk and non-web schemes', () => {
    expect(resolveScannedText('', HOST)).toEqual({ ok: false, reason: 'unreadable' })
    expect(resolveScannedText('WIFI:T:WPA;S:cafe;P:pw;;', HOST)).toEqual({
      ok: false,
      reason: 'unreadable',
    })
    expect(resolveScannedText('mailto:hi@example.com', HOST)).toEqual({
      ok: false,
      reason: 'unreadable',
    })
  })
})
