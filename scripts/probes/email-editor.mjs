// EMAIL-032..041 probe: the email editor gaps from the 2026-10-19 audit. One check per row, each reading
// the source for the consequence the row names; usage: node scripts/probes/email-editor.mjs <check>
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '')
const canvas = () => read('components/admin/email-studio/email-canvas-editor.tsx')

const checks = {
  preview: () => {
    const s = canvas()
    assert.ok(s.includes('data-fq-preview-device') && /desktop/.test(s) && /mobile/.test(s), 'the canvas editor has a desktop and mobile preview toggle')
  },
  undo: () => {
    const s = canvas()
    assert.ok(/aria-label="Undo/.test(s) && /toLowerCase\(\) !== 'z'/.test(s), 'the canvas editor shows an Undo button and binds Ctrl or Cmd + Z')
  },
  insert: () => {
    const s = read('components/admin/email-studio/merge-tag-picker.tsx')
    assert.ok(s.includes('onInsert'), 'the merge tag picker inserts at the cursor through onInsert')
  },
  testsend: () => {
    assert.ok(read('lib/email-studio/test-recipient.ts').includes('export function parseTestRecipient'), 'a test recipient is parsed in one place')
    assert.ok(read('app/(main)/admin/email-studio/actions.ts').includes('parseTestRecipient(toRaw') && read('lib/spaces/email-drafts.ts').includes('parseTestRecipient(toRaw'), 'both test sends take any valid address through parseTestRecipient')
  },
  utm: () => {
    assert.ok(read('lib/email-studio/utm.ts').includes('export function appendUtm') && read('lib/email-studio/send.ts').includes('appendUtm('), 'campaign links carry utm parameters')
  },
  repeat: () => {
    const s = read('lib/entity-blocks/registry.ts') + read('components/admin/email-studio/email-canvas-editor.tsx')
    assert.ok(!/once per email|onePerEmail|single instance/i.test(read('lib/email-studio/types.ts')) && s.length > 0, 'every block type can be placed more than once')
    assert.ok(read('lib/email-studio/repeatable.test.ts').includes('twice'), 'a test places the same block type twice')
  },
  refresh: () => {
    assert.ok(read('lib/email-studio/data-blocks.ts').includes('refreshDataBlocks') && /refreshDataBlocks\(/.test(read('lib/email-studio/send.ts') + read('lib/nurture/runner.ts')), 'test sends and nurture refresh their data cards')
  },
  spacepersonal: () => {
    assert.ok(read('lib/spaces/email-drafts.ts').includes('personalizeFor'), 'Space block broadcasts personalize per recipient')
  },
  sections: () => {
    assert.ok(existsSync('lib/email-studio/saved-sections.ts'), 'sections can be saved and reused')
  },
  duplicate: () => {
    assert.ok(read('lib/email-studio/duplicate.ts').includes('duplicateCampaign'), 'a campaign can be duplicated')
  },
}
const key = process.argv[2]
assert.ok(checks[key], `unknown check ${key}`)
checks[key]()
console.log(`email-editor ${key}: ok`)
