import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FrequencyDesigner } from '@/components/frequency/site/pages/themes/frequency-designer'
import { FrequencyMidnight } from '@/components/frequency/site/pages/themes/frequency-midnight'
import { FrequencyNetwork } from '@/components/frequency/site/pages/themes/frequency-network'
import { FrequencyTemple } from '@/components/frequency/site/pages/themes/frequency-temple'

// Every Theme Kit page is the Nocturne page's layout (the reference: /themes/nocturne) with its own name, content, colours and pictures.
// Network, Designer and Temple must open the same way (the theme's name large, the buttons left, the preview right, the four surfaces
// joined by a dotted line) and follow its sections in its order.
// The skeleton is the sequence of section ids and screen labels plus every structural class, theme prefix removed.
// What may differ is the picture inside a frame (a Space or Email that has a picture, or is on the way).
const FRAME_ONLY = new Set(['dv', 'bar', 'scr', 'mail', 'soon', 'soon-tx'])

function skeleton(html: string, prefix: string) {
  const sections = [...html.matchAll(/<section[^>]*?(?:id="([^"]*)")?[^>]*?data-screen-label="([^"]*)"/g)].map((m) => `${m[1] ?? ''}|${m[2]}`)
  const classes = [...html.matchAll(/class="([^"]*)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .map((c) => (c === prefix ? 'root' : c.replace(new RegExp(`^${prefix}-`), '')))
    .filter((c) => c && !FRAME_ONLY.has(c))
  const counts: Record<string, number> = {}
  for (const c of classes) counts[c] = (counts[c] ?? 0) + 1
  return { sections, counts }
}

describe('theme pages share one layout', () => {
  const net = skeleton(renderToStaticMarkup(<FrequencyNetwork />), 'nf')
  const des = skeleton(renderToStaticMarkup(<FrequencyDesigner />), 'df')
  const tem = skeleton(renderToStaticMarkup(<FrequencyTemple />), 'tf')

  const noc = skeleton(renderToStaticMarkup(<FrequencyMidnight />), 'nf')

  it("follows Nocturne's sections in Nocturne's order", () => {
    const labels = (x: { sections: string[] }) => x.sections.map((m) => m.split('|')[1]).filter((l) => !l.startsWith('12 '))
    expect(labels(net)).toEqual(labels(noc))
    expect(labels(des)).toEqual(labels(noc))
    expect(labels(tem)).toEqual(labels(noc))
  })

  it('opens like Nocturne: the name large, then the four surfaces joined by a line', () => {
    for (const x of [net, des, tem, noc]) {
      expect(x.counts['name']).toBe(1)
      expect(x.counts['aft']).toBe(1)
      expect(x.counts['tagline']).toBe(1)
      expect(x.counts['cascade']).toBe(1)
      expect(x.counts['thread']).toBe(3)
    }
  })

  it('has the same sections in the same order', () => {
    expect(des.sections).toEqual(net.sections)
    expect(tem.sections).toEqual(net.sections)
    expect(net.sections.length).toBeGreaterThanOrEqual(9)
  })

  it('has the same structural parts, class for class', () => {
    const drop = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([k]) => !['y', 'p', 'ready', 'soon', 'st', 'dk'].includes(k)))
    expect(drop(des.counts)).toEqual(drop(net.counts))
    expect(drop(tem.counts)).toEqual(drop(net.counts))
  })

  it('lets you switch the hero preview between Website, Spotlight, Space and Email', () => {
    for (const el of [<FrequencyNetwork key="n" />, <FrequencyDesigner key="d" />, <FrequencyMidnight key="m" />, <FrequencyTemple key="t" />]) {
      const html = renderToStaticMarkup(el)
      const hero = html.slice(html.indexOf('data-screen-label="01 Hero"'), html.indexOf('data-screen-label="02'))
      const group = hero.match(/aria-label="Surface"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? ''
      const names = [...group.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => [...`>${m[1]}<`.matchAll(/>([^<]*)</g)].map((t) => t[1]).join('').trim())
      expect(names.length).toBe(4)
      for (const w of ['Website', 'Spotlight', 'Space', 'Email']) expect(names.some((n) => n.startsWith(w))).toBe(true)
    }
  })
})
