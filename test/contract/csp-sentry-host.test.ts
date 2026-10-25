import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const config = readFileSync(path.resolve(process.cwd(), 'next.config.ts'), 'utf8')
const ingestOrigin = 'https://o4512171150934016.ingest.us.sentry.io'

function sources(source: string, directive: string): string[] {
  const line = source.split('\n').find((line) => line.trim().startsWith(`"${directive} `))
  if (!line) throw new Error(`Missing ${directive} policy`)
  return line.trim().slice(1).replace(/",?$/, '').split(/\s+/).slice(1)
}

function isSentrySource(value: string): boolean {
  try {
    const hostname = new URL(value).hostname
    return hostname.split('.').slice(-2).join('.') === 'sentry.io'
  } catch {
    return false
  }
}

// Exact-source matching is intentional: accepting a wildcard would weaken this contract.
function auditedIngestAllowed(source: string): boolean {
  return new Set(sources(source, 'connect-src')).has(ingestOrigin)
}

describe('Sentry browser transport CSP', () => {
  it('permits the audited organization envelope origin for connections', () => {
    expect(auditedIngestAllowed(config)).toBe(true)
  })
  it('keeps unrelated organizations and Sentry wildcards outside the connection policy', () => {
    const connect = sources(config, 'connect-src')
    expect(connect.filter(isSentrySource)).toEqual([ingestOrigin])
    expect(connect).not.toContain('https://o999.ingest.us.sentry.io')
    expect(connect).not.toContain('https://*.sentry.io')
    expect(connect).not.toContain('https://*.ingest.us.sentry.io')
  })
  it('does not grant the ingest host script or framing privileges', () => {
    for (const directive of ['script-src', 'frame-src']) {
      const line = config.split('\n').find((line) => line.trim().startsWith(`"${directive} `) || line.trim().startsWith('`' + directive + ' '))
      expect(line, directive).toBeDefined()
      expect(line).not.toContain(ingestOrigin)
    }
  })
  it('detects removal or replacement of the audited destination', () => {
    expect(auditedIngestAllowed(config.replace(ingestOrigin, ''))).toBe(false)
    expect(auditedIngestAllowed(config.replace(ingestOrigin, 'https://o999.ingest.us.sentry.io'))).toBe(false)
    expect(auditedIngestAllowed(config.replace(ingestOrigin, 'https://*.ingest.us.sentry.io'))).toBe(false)
    for (const untrusted of [
      'https://o4512171150934016.ingest.us.sentry.io.attacker.test',
      'https://attacker.test/o4512171150934016.ingest.us.sentry.io',
      'https://o4512171150934016.ingest.us.sentry.io@attacker.test',
      'https://attacker.test@o4512171150934016.ingest.us.sentry.io',
      'https://o4512171150934016.ingest.us.sentry.io/envelope',
      'http://o4512171150934016.ingest.us.sentry.io',
      'not-a-url',
    ]) expect(auditedIngestAllowed(config.replace(ingestOrigin, untrusted)), untrusted).toBe(false)
  })
})
