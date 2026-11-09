import { describe, expect, it } from 'vitest'
import { config } from '@/lib/page-editor/config'
import { applyKit } from '@/lib/sites/kits/apply'
import { KIT_INDEX, loadKit, NEW_WORLD_KIT_INDEX } from '@/lib/sites/kits/registry'
import { ROLES, ROLE_IDS, roleOfType } from '@/lib/blocks/roles/roles'
import { roleDrawsNothingForVisitor, roleHasSpaceRows } from '@/components/page-editor/blocks/roles'
import type { Data } from '@/lib/page-editor/types'
import { VIEW_AS_IDS, hostOnlySections, viewerDoc, viewerLens } from './view-as'

async function corpus(): Promise<Data[]> {
  const docs: Data[] = []
  for (const { id, theme } of [...KIT_INDEX, ...NEW_WORLD_KIT_INDEX]) {
    const kit = await loadKit(id)
    if (!kit) continue
    const r = applyKit({ theme, pages: [] } as never, kit, 'replace', (type) => config.components[type]?.defaultProps)
    if (r.ok) for (const p of r.snapshot.pages) if (p.doc.content.length > 0) docs.push(p.doc)
  }
  return docs
}

/** A live Space with nothing of its own yet: the shape every live role renderer reads (`metadata.space.spaceId`). */
const emptySpace = { space: { spaceId: 'space-1', name: 'Demo', profile: {}, events: [], faqs: [] } }

describe('view as (BLD-304)', () => {
  it('names the three views, host first', () => expect(VIEW_AS_IDS).toEqual(['host', 'member', 'visitor']))

  it('the host edits with tags and their own metadata; a visitor and a member preview with a viewer line', () => {
    const meta = { space: { spaceId: 's' }, websiteFeatures: {} }
    expect(viewerLens('host', meta)).toEqual({ editing: true, tags: true, metadata: meta })
    expect(viewerLens('visitor', meta)).toMatchObject({ editing: false, tags: false, metadata: { space: { spaceId: 's' }, viewer: { signedIn: false, member: false } } })
    expect(viewerLens('member', meta).metadata).toMatchObject({ viewer: { signedIn: true, member: true } })
    expect(viewerLens('visitor', undefined).metadata).toEqual({ viewer: { signedIn: false, member: false } })
    // Pure: the host's metadata is never written.
    expect(meta).toEqual({ space: { spaceId: 's' }, websiteFeatures: {} })
  })

  it('host-only sections are absent in the visitor and member previews, and present for the host', () => {
    // Every live role as its own sample copy on a live Space with no rows, plus an unknown block and an authored block.
    const liveRoles = ROLE_IDS.filter((r) => ROLES[r].live)
    expect(liveRoles.length).toBeGreaterThan(5)
    const content = [
      { type: 'ServicesStory', props: { id: 'own', title: 'Ours' } },
      ...liveRoles.map((r) => ({ type: ROLES[r].type, props: { id: `${r}-sample`, ...ROLES[r].sample } })),
      { type: 'RetiredBlock', props: { id: 'gone' } },
    ]
    const doc = { root: { props: {} }, content } as Data
    const hostOnly = hostOnlySections(doc, config, emptySpace)
    const expected = content.filter((s) => s.type === 'RetiredBlock' || (roleOfType(s.type) && roleDrawsNothingForVisitor(roleOfType(s.type)!, s.props, emptySpace))).map((s) => s.props.id)
    expect(hostOnly.map((h) => h.id)).toEqual(expected)
    expect(expected).toContain('gone')
    expect(expected.length).toBeGreaterThan(1)
    expect(expected).not.toContain('own')
    for (const h of hostOnly) expect(h.reason.length).toBeGreaterThan(10)
    for (const view of ['visitor', 'member'] as const) {
      const shown = viewerDoc(doc, config, view, emptySpace)
      for (const h of hostOnly) expect(shown.doc.content.some((s) => s.props.id === h.id)).toBe(false)
      expect(shown.doc.content.some((s) => s.props.id === 'own')).toBe(true)
      expect(shown.hostOnly).toEqual(hostOnly)
    }
    const host = viewerDoc(doc, config, 'host', emptySpace)
    expect(host.doc).toBe(doc)
    expect(host.hostOnly).toEqual([])
    // The stored document is untouched.
    expect(doc.content).toHaveLength(content.length)
  })

  it('a live role with real Space rows is not host-only, and a sample role on a page that is not live is not either', () => {
    const faqs = { space: { spaceId: 's', faqs: [{ question: 'When?', answer: 'Now.' }] } }
    expect(roleHasSpaceRows('faq', faqs, new Date())).toBe(true)
    const doc = { root: { props: {} }, content: [{ type: ROLES.faq.type, props: { id: 'q', ...ROLES.faq.sample } }] } as Data
    expect(hostOnlySections(doc, config, faqs)).toEqual([])
    // No `space.spaceId`: a design-time render, where the sample copy is the page.
    expect(hostOnlySections(doc, config, { space: {} })).toEqual([])
    expect(hostOnlySections(doc, config, undefined)).toEqual([])
  })

  it('a kit page on a live Space with no rows keeps every authored section for a visitor, and nothing on it is unknown', async () => {
    const docs = await corpus()
    expect(docs.length).toBeGreaterThan(20)
    for (const doc of docs) {
      const hostOnly = hostOnlySections(doc, config, emptySpace)
      for (const h of hostOnly) expect(roleOfType(h.type)).not.toBeNull()
      const visitor = viewerDoc(doc, config, 'visitor', emptySpace).doc
      expect(visitor.content.length + hostOnly.length).toBe(doc.content.length)
    }
  })
})
