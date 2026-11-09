import { describe, expect, it } from 'vitest'
import { emailHref, emailLayoutOf, emailLens, emailSections, resolvedAtSend, roleEmailBlocks } from './email-lens'
import { compileEmailDoc } from '@/lib/email-studio/shell'
import { renderEmailLayout } from '@/lib/email-studio/render'
import { EMAIL_PALETTE_BLOCK_IDS } from '@/lib/entity-blocks/registry'
import { starterRows, type EntityLayout } from '@/lib/entity-blocks/layout'
import { ROLES, ROLE_IDS, type RoleId } from '@/lib/blocks/roles/roles'
import { SEND_RESOLVERS } from '../../scripts/check-email-blocks.mjs'
import { config } from '@/lib/page-editor/config'
import { KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/registry'
import { applyKit } from '@/lib/sites/kits/apply'
import type { Data } from '@/lib/page-editor/types'

// BLD-302: the email lens is a reading of the page, never a second renderer. Every block it emits is in the email palette
// (the set check:email-blocks locks to the renderer), the whole thing goes through compileEmailDoc, and the result is
// compileEmailDoc's own, byte for byte. The role mapping is checked over every role with its sample, free and as a
// kit placed it; the hide / freeze split follows role.json.

const ORIGIN = 'https://tide.example'
const roleDoc = (roles: readonly RoleId[], extra: Props = {}): Data => ({
  root: { props: { title: 'Home' } },
  content: roles.map((r) => ({ type: ROLES[r].type, props: { ...ROLES[r].sample, ...extra, id: `s-${r}` } })),
})
type Props = Record<string, unknown>

async function kitPages(): Promise<Data[]> {
  const pages: Data[] = []
  for (const { id, theme } of [...KIT_INDEX, ...NEW_WORLD_KIT_INDEX]) {
    const kit = await loadKit(id)
    if (!kit) continue
    const r = applyKit({ theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (r.ok) for (const p of r.snapshot.pages) pages.push(p.doc)
  }
  return pages
}

describe('email lens (BLD-302)', () => {
  it('turns every role into email palette blocks, or hides it exactly when role.json does', () => {
    const { blocks, sections } = emailSections(roleDoc(ROLE_IDS), config, ORIGIN)
    for (const b of blocks) expect(EMAIL_PALETTE_BLOCK_IDS.has(b.type), b.type).toBe(true)
    for (const id of ROLE_IDS) {
      const how = ROLES[id].surfaces.email
      const section = sections.find((s) => s.id === `s-${id}`)!
      expect(section.status, id).toBe(how === 'hide' ? 'hidden' : how === 'freeze' ? 'frozen' : 'drawn')
      const own = blocks.filter((b) => b.id === `s-${id}`)
      if (how === 'hide') expect(own, id).toEqual([])
      else expect(own.length, id).toBeGreaterThan(0)
    }
    // A frozen section says so; a drawn one has nothing to explain.
    expect(sections.find((s) => s.id === 's-gatherings')!.note).toMatch(/fixed when the email is sent/)
    expect(sections.find((s) => s.id === 's-hero')!.note).toBe('')
  })

  it('renders what it maps: no role block vanishes in the renderer', () => {
    for (const id of ROLE_IDS) {
      if (ROLES[id].surfaces.email === 'hide') continue
      const blocks = roleEmailBlocks(id, ROLES[id].sample as Props, (ROLES[id].sample as { items?: Props[] }).items ?? [], ORIGIN)
      const layout = emailLayoutOf(blocks.map((b) => ({ id: `s-${id}`, ...b })))
      const { html, text } = renderEmailLayout(layout)
      expect(html.length, id).toBeGreaterThan(0)
      expect(text, id).toContain((ROLES[id].sample as unknown as { title: string }).title.replace(/\*/g, ''))
    }
  })

  it('is compileEmailDoc, byte for byte', () => {
    const doc = roleDoc(ROLE_IDS)
    const brand = { wordmark: 'Tide', logoUrl: `${ORIGIN}/logo.png`, baseUrl: ORIGIN }
    const lens = emailLens(doc, config, { subject: 'Home', preheader: 'Hello', brand, origin: ORIGIN })
    const direct = compileEmailDoc({ layout: lens.layout, subject: 'Home', preheader: 'Hello' }, { brand })
    expect(lens.html).toBe(direct.html)
    expect(lens.text).toBe(direct.text)
    expect(lens.subject).toBe('Home')
  })

  it('compiles the three starter templates and the full palette through the one seam the sends use', () => {
    // The email starters (the templates a new draft is born from) and a layout of every palette block compile through
    // compileEmailDoc exactly as a campaign does; the lens has no second path. A brand with a logo keeps the shell's
    // stock hero out of the bytes, so two compiles agree byte for byte.
    const brand = { wordmark: 'Tide', logoUrl: `${ORIGIN}/logo.png`, baseUrl: ORIGIN }
    for (const starter of ['basic', 'showcase', 'minimal'] as const) {
      const layout: EntityLayout = { rows: starterRows('email', starter), content: { heading: { text: 'Hi there' }, text: { text: 'Hello' }, button: { label: 'Go', url: ORIGIN }, photoHero: { title: 'Hi there', image: `${ORIGIN}/a.jpg` } } }
      const a = compileEmailDoc({ layout, subject: 's', preheader: '' }, { brand })
      expect(a.html).toContain('Hi there')
      expect(a).toEqual(compileEmailDoc({ layout, subject: 's', preheader: '' }, { brand }))
    }
    const showcase: EntityLayout = { rows: [...EMAIL_PALETTE_BLOCK_IDS].map((id, i) => ({ id: `r${i}`, columns: 1, cells: [[id]] })) }
    expect(compileEmailDoc({ layout: showcase, subject: 's', preheader: '' }, { brand })).toEqual(compileEmailDoc({ layout: showcase, subject: 's', preheader: '' }, { brand }))
  })

  it('marks a send-resolved block from its contract, the same set check:email-blocks names', () => {
    for (const id of Object.keys(SEND_RESOLVERS)) expect(resolvedAtSend(id), id).toBe(true)
    for (const id of EMAIL_PALETTE_BLOCK_IDS) expect(resolvedAtSend(id), id).toBe(id in SEND_RESOLVERS)
    const doc: Data = { root: {}, content: [{ type: 'eventCard', props: { id: 'e1', title: 'Supper', when: 'Thu', where: 'Here', url: ORIGIN, event: { id: 'x' } } }] }
    const { blocks, sections } = emailSections(doc, config, ORIGIN)
    expect(blocks[0]).toMatchObject({ type: 'eventCard', content: { title: 'Supper', event: { id: 'x' } } })
    expect(sections[0]).toMatchObject({ status: 'frozen', note: expect.stringContaining('refreshes it from the live row') })
  })

  it('freezes the Space\'s own rows when the Space has them, else the owner\'s', () => {
    const metadata = { space: { spaceId: 'sp', stats: [{ label: 'Members', value: 120 }] } }
    const own = emailSections(roleDoc(['stats']), config, ORIGIN).blocks
    const live = emailSections(roleDoc(['stats']), config, ORIGIN, metadata).blocks
    expect(JSON.stringify(live)).toContain('"120"')
    expect(JSON.stringify(own)).not.toContain('"120"')
    expect(JSON.stringify(own)).toContain('000')
  })

  it('makes a page link absolute and keeps a full one', () => {
    expect(emailHref('~/book', ORIGIN)).toBe(`${ORIGIN}/book`)
    expect(emailHref('/events', `${ORIGIN}/`)).toBe(`${ORIGIN}/events`)
    expect(emailHref('https://other.example/x', ORIGIN)).toBe('https://other.example/x')
    expect(emailHref('', ORIGIN)).toBe('')
  })

  it('reads every kit page without a block outside the palette, and lists the rest with a reason', async () => {
    const pages = await kitPages()
    expect(pages.length).toBeGreaterThan(0)
    for (const doc of pages) {
      const { blocks, sections } = emailSections(doc, config, ORIGIN)
      for (const b of blocks) expect(EMAIL_PALETTE_BLOCK_IDS.has(b.type), b.type).toBe(true)
      for (const s of sections) if (s.status === 'hidden') expect(s.note.length).toBeGreaterThan(0)
      expect(sections.length).toBe(doc.content.length)
    }
  })
})
