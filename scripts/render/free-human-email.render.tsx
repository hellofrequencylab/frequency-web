import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { it } from 'vitest'
import { SAMPLE_SPECS } from '@/lib/email-samples/catalog'

// Writes the four Free Human emails as HTML files for the render pass. RENDER_OUT=<dir>.
it('writes the Free Human emails', async () => {
  const out = process.env.RENDER_OUT ?? '/tmp/fh-email'
  mkdirSync(out, { recursive: true })
  for (const id of ['note', 'welcome', 'dates', 'receipt']) {
    const e = SAMPLE_SPECS.find((s) => s.id === `free-human-${id}`)
    if (!e) throw new Error(`missing free-human-${id}`)
    const r = await e.run()
    if (!r) throw new Error('empty sample')
    writeFileSync(join(out, `${id}.html`), r.html.replace(/https:\/\/frequencylocal\.com\/sites\//g, 'file://' + join(process.cwd(), 'public/sites/')))
  }
})
