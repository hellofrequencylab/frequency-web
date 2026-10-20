import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// LIVE-1102 (LIVE-938 area 4, admin widgets). The shared Switch draws `.sw` under Frequency, and only the members
// kit styled it, so every Switch inside the admin kit drew as an empty button. The admin kit now styles `.sw`,
// and the admin forms that hand-built their own switch use the shared one.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')

const FILES = [
  './menu/on-off-toggle.tsx',
  './connection-settings-admin.tsx',
  '../../app/(main)/admin/crm/contacts/scan-invite-toggle.tsx',
  '../../app/(main)/admin/crew-tasks/crew-tasks-client.tsx',
  '../../app/(main)/admin/walkthroughs/row-actions.tsx',
  '../../app/(main)/admin/walkthroughs/[id]/editor.tsx',
  '../../app/(main)/admin/elements/elements-editor.tsx',
]

describe('admin switches (LIVE-1102)', () => {
  it('styles the kit switch inside the admin kit', () => {
    const css = read('../../app/themes/frequency/admin-pages.css')
    expect(css).toContain('[data-design="frequency"] [data-kit="admin"] .sw{')
    expect(css).toContain('[data-design="frequency"] [data-kit="admin"] .sw.on{background:var(--fq-pa)}')
  })

  it.each(FILES)('%s uses the shared Switch', (f) => {
    const src = read(f)
    expect(src).toContain('<Switch ')
    expect(src).not.toContain('role="switch"')
  })
})
