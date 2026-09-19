import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import {
  fileIsResidual,
  parseOkExports,
  scanAdmin,
  loadBaseline,
  readHeader,
  evaluate,
  DEFAULT_HEADER,
  MIN_SERVER_FILES,
  BASELINE,
} from './check-parse-input.mjs'

const USE = "'use server'\n"

function residualSrc(name = 'doThing') {
  return `${USE}export async function ${name}(id: string) {\n  return id\n}\n`
}

function parsedSrc(name = 'doThing') {
  return `${USE}import { parseInput, z } from '@/lib/validation'\nexport async function ${name}(id: string) {\n  return parseInput(z.object({ id: z.string() }), { id }).id\n}\n`
}

describe('fileIsResidual', () => {
  it('a use-server export that never calls parseInput is residual', () => {
    expect(fileIsResidual(residualSrc())).toBe(true)
  })

  it('a use-server export that calls parseInput is not residual', () => {
    expect(fileIsResidual(parsedSrc())).toBe(false)
  })

  it('a file that is not use-server is never residual', () => {
    expect(fileIsResidual('export async function doThing() { return 1 }')).toBe(false)
  })

  it('a comment that names parseInput does not count', () => {
    expect(
      fileIsResidual(`${USE}// remember to call parseInput\nexport async function doThing(id: string) {\n  return id\n}\n`),
    ).toBe(true)
  })

  it('an import of parseInput without a call in the export is still residual', () => {
    expect(
      fileIsResidual(
        `${USE}import { parseInput, z } from '@/lib/validation'\nexport async function doThing(id: string) {\n  return id\n}\n`,
      ),
    ).toBe(true)
  })

  it('one unparsed sibling keeps the whole file residual', () => {
    expect(fileIsResidual(parsedSrc('ok') + residualSrc('bad'))).toBe(true)
  })

  it('parse-ok on the comment block above an export exempts that export', () => {
    expect(
      fileIsResidual(
        `${USE}// parse-ok: read-only listing; no client fields to parse\nexport async function listThings() {\n  return []\n}\n`,
      ),
    ).toBe(false)
  })

  it('parse-ok not attached to an export does not exempt the file', () => {
    expect(
      fileIsResidual(`${USE}// parse-ok: someday\nconst x = 1\nexport async function doThing(id: string) {\n  return id\n}\n`),
    ).toBe(true)
  })
})

describe('parseOkExports attaches only to the next export', () => {
  it('binds the annotation to the export below it', () => {
    const src = `${USE}// parse-ok: read\nexport async function listThings() { return [] }\nexport async function writeThing() { return 1 }\n`
    expect([...parseOkExports(src)]).toEqual(['listThings'])
  })
})

describe('the ratchet fires — arm 1: a NEW residual file', () => {
  it('fails and names the added path', () => {
    const files = {
      'app/(main)/admin/a/actions.ts': residualSrc(),
      'app/(main)/admin/b/actions.ts': residualSrc(),
    }
    const scanned = scanAdmin({
      files: Object.keys(files),
      read: (f) => files[f] ?? '',
    })
    const r = evaluate({
      residual: scanned.residual,
      baseline: ['app/(main)/admin/a/actions.ts'],
      exists: (f) => f in files,
    })
    expect(r.code).toBe(1)
    expect(r.added).toEqual(['app/(main)/admin/b/actions.ts'])
  })
})

describe('the ratchet only shrinks — arm 2: a graduated file', () => {
  it('fails until the baseline drops the file that now parses', () => {
    const files = {
      'app/(main)/admin/a/actions.ts': parsedSrc(),
    }
    const scanned = scanAdmin({
      files: Object.keys(files),
      read: (f) => files[f] ?? '',
    })
    const r = evaluate({
      residual: scanned.residual,
      baseline: ['app/(main)/admin/a/actions.ts'],
      exists: (f) => f in files,
    })
    expect(r.code).toBe(1)
    expect(r.graduated).toEqual(['app/(main)/admin/a/actions.ts'])
    expect(scanned.residual).toEqual([])
  })
})

describe('stale baseline path — arm 3: a deleted file cannot grant amnesty', () => {
  it('fails when a baseline path no longer exists', () => {
    const r = evaluate({
      residual: [],
      baseline: ['app/(main)/admin/ghost/actions.ts'],
      exists: () => false,
    })
    expect(r.code).toBe(1)
    expect(r.stale).toEqual(['app/(main)/admin/ghost/actions.ts'])
  })
})

describe('the ratchet clears — matching residual and baseline', () => {
  it('passes when the frozen set is exactly the residual set', () => {
    const files = {
      'app/(main)/admin/a/actions.ts': residualSrc(),
      'app/(main)/admin/b/actions.ts': parsedSrc(),
    }
    const scanned = scanAdmin({
      files: Object.keys(files),
      read: (f) => files[f] ?? '',
    })
    const r = evaluate({
      residual: scanned.residual,
      baseline: ['app/(main)/admin/a/actions.ts'],
      exists: (f) => f in files,
    })
    expect(r.code).toBe(0)
    expect(r.added).toEqual([])
    expect(r.graduated).toEqual([])
    expect(r.stale).toEqual([])
  })
})

describe('readHeader preserves the leading comment block', () => {
  it('round-trips: regenerating with a different list leaves the header untouched', () => {
    const header = '# reason for a\n# reason for b\n'
    const before = header + 'app/(main)/admin/a/actions.ts\n'
    const after = readHeader(() => before) + ['app/(main)/admin/a/actions.ts', 'app/(main)/admin/c/actions.ts'].join('\n') + '\n'
    expect(after.startsWith(header)).toBe(true)
  })

  it('falls back to the default when there is no header to keep', () => {
    expect(readHeader(() => 'app/(main)/admin/a/actions.ts\n')).toBe(DEFAULT_HEADER)
    expect(
      readHeader(() => {
        throw new Error('ENOENT')
      }),
    ).toBe(DEFAULT_HEADER)
  })
})

describe('the real tree', () => {
  it('the baseline exists and every entry is still a residual admin action file', () => {
    expect(existsSync(BASELINE)).toBe(true)
    const baseline = loadBaseline(readFileSync(BASELINE, 'utf8'))
    expect(baseline.length).toBeGreaterThan(50)
    expect(baseline.every((e) => e.startsWith('app/(main)/admin/') && e.endsWith('.ts'))).toBe(true)
  })

  it('evaluate matches the committed baseline, so the freeze is honest', () => {
    const scanned = scanAdmin()
    expect(scanned.server.length).toBeGreaterThanOrEqual(MIN_SERVER_FILES)
    const r = evaluate({
      residual: scanned.residual,
      baseline: loadBaseline(readFileSync(BASELINE, 'utf8')),
    })
    expect(r.code, `added=${r.added.join(',')} graduated=${r.graduated.join(',')} stale=${r.stale.join(',')}`).toBe(0)
  })

  it('the first-wave files this row converted are off the residual list', () => {
    const scanned = scanAdmin()
    const converted = [
      'app/(main)/admin/payments/actions.ts',
      'app/(main)/admin/sms/actions.ts',
      'app/(main)/admin/community/actions.ts',
      'app/(main)/admin/roles/actions.ts',
      'app/(main)/admin/spaces/[id]/beta-grant-actions.ts',
      'app/(main)/admin/nonprofit-verifications/actions.ts',
      'app/(main)/admin/spaces/[id]/lifecycle-actions.ts',
    ]
    for (const file of converted) {
      expect(scanned.residual, file).not.toContain(file)
      expect(scanned.parsed, file).toContain(file)
    }
  })
})
