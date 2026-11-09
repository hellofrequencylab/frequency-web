import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { applyKit } from '@/lib/sites/kits/apply'
import { KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/registry'
import { setSectionVisibility } from '@/lib/sites/editor/state'
import type { Data } from '@/lib/page-editor/types'
import { builderView, classicView, shadowDeltas, shadowLogLines, shadowReport } from './shadow'

// The frozen corpus: every page of every kit an owner can start from, as the kit applies it (the same corpus the
// reorder proof uses, lib/builder/spine.test.ts).
async function corpus(): Promise<{ slug: string; doc: Data }[]> {
  const pages: { slug: string; doc: Data }[] = []
  for (const { id, theme } of [...KIT_INDEX, ...NEW_WORLD_KIT_INDEX]) {
    const kit = await loadKit(id)
    if (!kit) continue
    const r = applyKit({ theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (r.ok) for (const p of r.snapshot.pages) if (p.doc.content.length > 0) pages.push({ slug: `${id}/${p.slug}`, doc: p.doc })
  }
  return pages
}

describe('shadow render (BLD-108)', () => {
  it('shows zero or explained delta between the two editors over the frozen corpus', async () => {
    const pages = await corpus()
    expect(pages.length).toBeGreaterThan(20)
    const report = shadowReport(pages, config)
    expect(report.sections).toBeGreaterThan(300)
    // Every section is listed by both editors, under the same name, hidden on the same devices.
    expect(report.deltas.filter((d) => d.kind !== 'field')).toEqual([])
    // Every field one editor offers and the other does not has the pass that owns the difference.
    expect(report.unexplained).toEqual([])
    // The explanations are a short, known set: anything new here is a new difference to own.
    expect([...new Set(report.deltas.map((d) => d.explained))].sort()).toMatchInlineSnapshot(`
      [
        "BLD-104: the per-device layout controls own \`layout\`, not a field",
        "BLD-105: the Tune rail has no object kind; the current inspector draws it as a nested form",
      ]
    `)
  })

  it('agrees on a section hidden per device, both ways round', () => {
    const doc = setSectionVisibility({ root: { props: {} }, content: [
      { type: 'ServicesStory', props: { id: 's', title: 'Hello' } },
      { type: 'ServicesTrust', props: { id: 't', items: [] } },
    ] } as Data, 't', 'phone', false)
    for (const device of ['desktop', 'tablet', 'phone'] as const) {
      expect(classicView(doc, config, device).sections.map((s) => s.hidden)).toEqual(builderView(doc, config, device).sections.map((s) => s.hidden))
    }
    expect(classicView(doc, config, 'phone').sections[1].hidden).toBe(true)
  })

  it('hides an external field on both sides, explains an object field, and prints an unexplained one', () => {
    const doc = { root: { props: {} }, content: [{ type: 'ServicesStory', props: { id: 's' } }] } as Data
    const twisted = { ...config, components: { ...config.components, ServicesStory: { ...config.components.ServicesStory, fields: { ...config.components.ServicesStory.fields, mystery: { type: 'external' as const, label: 'Mystery' } } } } }
    // An external field is hidden by both editors; the one delta left is the layout object both passes own.
    expect(shadowDeltas(doc, twisted as never, 'desktop').map((d) => d.detail)).toEqual(['layout'])
    const odd = { ...config, components: { ...config.components, ServicesStory: { ...config.components.ServicesStory, fields: { ...config.components.ServicesStory.fields, layoutish: { type: 'object' as const, label: 'Odd', objectFields: {} } } } } }
    const delta = shadowDeltas(doc, odd as never, 'desktop').find((d) => d.detail === 'layoutish')!
    expect(delta).toMatchObject({ id: 's', kind: 'field', detail: 'layoutish' })
    expect(delta.explained).toMatch(/^BLD-105/)
    const report = shadowReport([{ slug: 'home', doc }], odd as never)
    expect(report.unexplained).toEqual([])
    // Today both editors read the same resolvers, so an unexplained delta can only be built by hand; the log line is
    // what the server prints when a real draft produces one.
    const bare = { sections: 1, deltas: [], unexplained: [{ id: 'home:desktop:s', type: 'ServicesStory', kind: 'field' as const, detail: 'variant' }] }
    expect(shadowLogLines('demo.frequencylocal.com', bare)[0]).toBe('[builder shadow] demo.frequencylocal.com home:desktop:s ServicesStory field: variant')
    expect(shadowLogLines('x', report)).toEqual([])
  })
})
