// The baseline-environment gate, measured rather than read (LIVE-213, LIVE-487).
//
// A `.test.ts` file, not a `.spec.ts` one: playwright.config.ts pins `testMatch: '**/*.spec.ts'`
// precisely so vitest files in this folder are not collected by the wrong runner.
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CAPTURE_STAMP_PATH,
  captureEnvironmentMismatch,
  classifyCaptureEnvironment,
  isCaptureRun,
  readCaptureStamp,
  serializeCaptureStamp,
  writeCaptureStamp,
} from './capture-env'

const roots: string[] = []
function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'capture-env-'))
  roots.push(root)
  return root
}
afterEach(() => {
  while (roots.length) rmSync(roots.pop() as string, { recursive: true, force: true })
})

describe('classifyCaptureEnvironment', () => {
  it('reads the apex domain as production', () => {
    expect(classifyCaptureEnvironment('https://frequencylocal.com')).toBe('production')
    expect(classifyCaptureEnvironment('https://www.frequencylocal.com/feed')).toBe('production')
  })

  it('reads a Vercel deployment host as a preview', () => {
    expect(
      classifyCaptureEnvironment(
        'https://frequency-web-git-claud-485859-hellofrequencylab-5611s-projects.vercel.app',
      ),
    ).toBe('preview')
    expect(classifyCaptureEnvironment('https://frequency-qtcin3gtg-hellofrequencylab-5611s-projects.vercel.app')).toBe(
      'preview',
    )
  })

  it('reads a dev server as local', () => {
    expect(classifyCaptureEnvironment('http://localhost:3000')).toBe('local')
    expect(classifyCaptureEnvironment('http://127.0.0.1:3000/')).toBe('local')
  })

  it('never throws, and never guesses', () => {
    expect(classifyCaptureEnvironment(undefined)).toBe('unknown')
    expect(classifyCaptureEnvironment('')).toBe('unknown')
    expect(classifyCaptureEnvironment('   ')).toBe('unknown')
    expect(classifyCaptureEnvironment('not a url')).toBe('unknown')
    expect(classifyCaptureEnvironment('https://example.com')).toBe('unknown')
  })
})

describe('isCaptureRun', () => {
  it('is true only for the two modes that WRITE existing baselines', () => {
    // `pnpm test:e2e:update` is `--update-snapshots`, which is 'changed' in playwright 1.63.
    expect(isCaptureRun('changed')).toBe(true)
    expect(isCaptureRun('all')).toBe(true)
    // 'missing' is the default on an ordinary compare run.
    expect(isCaptureRun('missing')).toBe(false)
    expect(isCaptureRun('none')).toBe(false)
    expect(isCaptureRun(undefined)).toBe(false)
  })
})

describe('the stamp on disk', () => {
  it('round-trips, and a hand-seeded stamp is byte-identical to a written one', () => {
    const root = tempRoot()
    const stamp = { environment: 'preview' as const, baseUrl: 'https://x.vercel.app' }
    writeCaptureStamp(stamp, root)
    expect(readFileSync(join(root, CAPTURE_STAMP_PATH), 'utf8')).toBe(serializeCaptureStamp(stamp))
    expect(readCaptureStamp(root)).toEqual(stamp)
  })

  it('is a no-op when the bytes already match, so four parallel workers do not fight', () => {
    const root = tempRoot()
    const stamp = { environment: 'production' as const, baseUrl: 'https://frequencylocal.com' }
    writeCaptureStamp(stamp, root)
    const before = readFileSync(join(root, CAPTURE_STAMP_PATH), 'utf8')
    writeCaptureStamp(stamp, root)
    writeCaptureStamp(stamp, root)
    expect(readFileSync(join(root, CAPTURE_STAMP_PATH), 'utf8')).toBe(before)
  })

  it('reads an absent, corrupt or unrecognised stamp as no claim rather than throwing', () => {
    const root = tempRoot()
    expect(readCaptureStamp(root)).toBeNull()
    mkdirSync(join(root, 'test/e2e/__screenshots__'), { recursive: true })
    writeFileSync(join(root, CAPTURE_STAMP_PATH), '{ not json')
    expect(readCaptureStamp(root)).toBeNull()
    writeFileSync(join(root, CAPTURE_STAMP_PATH), JSON.stringify({ environment: 'staging' }))
    expect(readCaptureStamp(root)).toBeNull()
  })
})

describe('captureEnvironmentMismatch', () => {
  const preview = { environment: 'preview' as const, baseUrl: 'https://a.vercel.app' }
  const production = { environment: 'production' as const, baseUrl: 'https://frequencylocal.com' }

  it('says nothing when the two agree', () => {
    expect(captureEnvironmentMismatch(preview, 'https://b.vercel.app')).toBeNull()
    expect(captureEnvironmentMismatch(production, 'https://www.frequencylocal.com')).toBeNull()
  })

  it('says nothing when there is no stamp to compare against', () => {
    expect(captureEnvironmentMismatch(null, 'https://frequencylocal.com')).toBeNull()
  })

  it('does not gate on a guess', () => {
    expect(captureEnvironmentMismatch(preview, undefined)).toBeNull()
    expect(captureEnvironmentMismatch(preview, 'https://example.com')).toBeNull()
  })

  it('names BOTH environments when a production-sourced set meets a preview', () => {
    const message = captureEnvironmentMismatch(production, 'https://b.vercel.app')
    expect(message).toContain('PRODUCTION')
    expect(message).toContain('PREVIEW')
    expect(message).toContain('SUPPORT_CHAT')
    // The whole point: the reader must not go looking in their own diff for it.
    expect(message).toContain("Nothing here is this change's fault")
  })

  it('fires the other way too, and a capture run is told nothing was captured', () => {
    const comparing = captureEnvironmentMismatch(preview, 'https://frequencylocal.com')
    expect(comparing).toContain('recapture the whole set')
    const capturing = captureEnvironmentMismatch(preview, 'https://frequencylocal.com', {
      capturing: true,
    })
    expect(capturing).toContain('Nothing was captured')
    expect(capturing).toContain(CAPTURE_STAMP_PATH)
  })

  it('catches a local dev server pointed at a deployment-sourced set', () => {
    expect(captureEnvironmentMismatch(preview, 'http://localhost:3000')).toContain('LOCAL')
  })
})

describe('the committed baseline folder', () => {
  it('carries a stamp, so the gate has something to compare against', () => {
    const stamp = readCaptureStamp(process.cwd())
    expect(stamp, `${CAPTURE_STAMP_PATH} is missing or unreadable`).not.toBeNull()
    expect(stamp?.environment).toBe('preview')
  })

  it('agrees with what pr-compare photographs, which is always a preview', () => {
    // e2e.yml gives pr-compare `PW_BASE_URL: ${{ steps.preview.outputs.url }}`, read from the
    // Vercel deployment's environment_url. If the committed set ever stops being preview-sourced
    // while that stays true, every pull request goes red for a reason no author can fix.
    const stamp = readCaptureStamp(process.cwd())
    expect(captureEnvironmentMismatch(stamp, 'https://frequency-web-git-any.vercel.app')).toBeNull()
  })
})
