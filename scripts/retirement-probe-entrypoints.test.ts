import { afterAll, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const staging = realpathSync(mkdtempSync(join(tmpdir(), 'Frequency entrée probes ')))
afterAll(() => rmSync(staging, { recursive: true, force: true }))
for (const [name, output] of [
  ['retired-browse-wrappers', 'retired internal browse'],
  ['retired-pricing-comparison', 'pricing'],
  ['retired-shell-wrappers', 'Four retired wrappers'],
  ['active-member-shell-contracts', 'Active member shell'],
]) {
  it(`${name} remains silent when imported`, () => {
    const script = pathToFileURL(resolve(`scripts/probes/${name}.mjs`)).href
    expect(execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(script)})`], { encoding: 'utf8' })).toBe('')
  })
  it(`${name} actually executes through a renamed Unicode symlink`, () => {
    const link = join(staging, `${name}-renommé.mjs`)
    symlinkSync(resolve(`scripts/probes/${name}.mjs`), link)
    expect(execFileSync(process.execPath, [link, ...(name === 'active-member-shell-contracts' ? ['retirement'] : [])], { encoding: 'utf8' }).toLowerCase()).toContain(output.toLowerCase())
  })
}
