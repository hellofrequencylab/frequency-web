import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { config } from '@/lib/page-editor/config'
import { BlockRender } from '@/lib/page-editor/block-render'
import type { Data } from '@/lib/page-editor/types'
import { applyKit } from './apply'
import { KIT_INDEX, loadKit } from './registry'

// Every Default and Bold kit page draws without throwing and shows its heading, with the registered block defaults filled in.
describe('kit pages render', () => {
  for (const s of KIT_INDEX.filter((k) => k.theme === 'DAWN' || k.theme === 'Menswork')) {
    it(s.id, async () => {
      const kit = (await loadKit(s.id))!
      const r = applyKit({ theme: kit.theme, pages: [{ slug: 'home', label: 'Home', doc: { root: {}, content: [] }, seo: { title: '', description: '' }, comments: [] }] }, kit, 'replace', (t) => config.components[t]?.defaultProps)
      if (!r.ok) throw new Error(r.error)
      for (const p of r.snapshot.pages) {
        const html = renderToStaticMarkup(<BlockRender config={config} data={p.doc as unknown as Data} />)
        expect(html.length, `${s.id}/${p.slug}`).toBeGreaterThan(200)
        expect(html).toMatch(/<h[12]/)
      }
    })
  }
})
