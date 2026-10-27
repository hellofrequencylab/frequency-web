import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { expect, it } from 'vitest'
import { retiredDawnFontStub } from './probes/retired-dawn-font-stub.mjs'
const read = (p: string) => readFileSync(p, 'utf8')
it('holds actual font retirement and the remaining registrations', () => { expect(retiredDawnFontStub()).toBe(true) })
it.each([
  ['lib/theme/design-fonts/dawn.ts', 'restored'],
  ['lib/theme/design-fonts/active.ts', "export { DESIGN_FONT_CLASS, FONTS_DESIGN } from './dawn'"],
  ['app/layout.tsx', read('app/layout.tsx').replaceAll('./fonts/nunito/', './fonts/other/')],
])('rejects retired stub or registration regression in %s', (file, changed) => {
  expect(() => retiredDawnFontStub({
    exists: (p: string) => p === 'lib/theme/design-fonts/dawn.ts' && p === file ? true : existsSync(p),
    read: (p: string) => p === file ? changed : read(p),
  })).toThrow()
})
it.each(['dawn', 'unknown', ''])('actual generator normalizes %s without a DAWN font module and stays idempotent', (raw) => {
  const dir = mkdtempSync(join(tmpdir(), 'frequency font retirement '))
  try {
    for (const file of ['scripts/write-design-assets.mjs', 'scripts/lib/design-styles.mjs', 'lib/theme/design.ts', 'lib/theme/design-fonts/active.ts', 'lib/theme/design-fonts/frequency.ts']) {
      mkdirSync(dirname(join(dir, file)), { recursive: true }); writeFileSync(join(dir, file), read(file))
    }
    mkdirSync(join(dir, 'public')); writeFileSync(join(dir, 'public/manifest.json'), '{"theme_color":"#000000","background_color":"#000000","name":"preserve"}')
    mkdirSync(join(dir, 'app/themes'), { recursive: true }); writeFileSync(join(dir, 'app/themes/frequency.css'), ':root[data-design="frequency"] {}')
    const run = () => execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/write-design-assets.mjs'], { cwd: dir, env: { ...process.env, NEXT_PUBLIC_SITE_DESIGN: raw }, encoding: 'utf8', stdio: 'pipe' })
    expect(run()).toContain('design assets: frequency')
    expect(existsSync(join(dir, 'lib/theme/design-fonts/dawn.ts'))).toBe(false)
    expect(readFileSync(join(dir, 'lib/theme/design-fonts/active.ts'), 'utf8')).toContain("from './frequency'")
    expect(JSON.parse(readFileSync(join(dir, 'public/manifest.json'), 'utf8')).name).toBe('preserve')
    expect(run()).toContain('manifest unchanged, fonts unchanged, styles unchanged')
    // Actual old-selection behavior would request the absent historical module and fail.
    if (raw === 'dawn') {
      const design = read('lib/theme/design.ts').replace("return raw === 'frequency' ? raw : DEFAULT_DESIGN", "return raw === 'dawn' ? raw : DEFAULT_DESIGN")
      writeFileSync(join(dir, 'lib/theme/design.ts'), design)
      expect(run).toThrow()
    }
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
