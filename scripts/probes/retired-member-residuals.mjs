import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { invokedDirectly } from '../lib/invoked-directly.mjs'
import { RETIRED_MEMBER_RESIDUALS } from '../lib/retired-member-residuals.mjs'
import { retiredModuleEdges } from '../lib/retired-member-shell.mjs'
if (invokedDirectly(import.meta.url)) {
  for (const file of RETIRED_MEMBER_RESIDUALS) assert.equal(existsSync(file), false, `${file} remains retired`)
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(file => /\.[cm]?[jt]sx?$/.test(file) && existsSync(file))
  for (const file of files) assert.deepEqual(retiredModuleEdges(file, readFileSync(file, 'utf8'), RETIRED_MEMBER_RESIDUALS), [], `Retired member import in ${file}`)
  console.log('Six replaced internal member wrappers absent; no dangling static/reexport/literal dynamic imports.')
}
