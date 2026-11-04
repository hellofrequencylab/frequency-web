import { describe, expect, it, vi } from 'vitest'

// LIVE-2162: the screenshot reaches the model as a picture in front of the ask, never inside the JSON, and the model
// is offered the Design tab settings and the sections' own design options.
const calls = vi.hoisted(() => [] as { messages: { content: unknown }[]; tools: { input_schema: { properties: { changes: { items: { properties: Record<string, { enum?: string[] }> } } } } }[] }[])
vi.mock('./complete', () => ({ completeRaw: async (p: (typeof calls)[number]) => { calls.push(p); return { content: [] } } }))

import { proposeWebsiteLayoutWithModel } from './website-layout'

const base = { request: 'this card is hard to read', outline: [], profileId: 'p', spaceId: 's' }
const facts = { theme: 'New World', pageInView: 'Home', pages: [], checks: [], unpublished: [], published: true, scheduledFor: null }

describe('Vera reads a screenshot and the design choices (LIVE-2162)', () => {
  it('puts the screenshot in front as an image block and keeps it out of the JSON', async () => {
    await proposeWebsiteLayoutWithModel({ ...base, facts: { ...facts, screenshot: 'data:image/jpeg;base64,QUJD' } })
    const content = calls.at(-1)!.messages[0].content as { type: string; source?: { media_type: string; data: string }; text?: string }[]
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } })
    expect(content[1].type).toBe('text')
    expect(content[1].text).not.toContain('QUJD')
    expect(content[1].text).toContain('"design":{"align"')
  })

  it('sends plain JSON when there is no screenshot, and offers the design and option kinds', async () => {
    await proposeWebsiteLayoutWithModel({ ...base, facts })
    const call = calls.at(-1)!
    expect(typeof call.messages[0].content).toBe('string')
    const kinds = call.tools[0].input_schema.properties.changes.items.properties.kind.enum
    expect(kinds).toEqual(expect.arrayContaining(['design', 'option']))
  })
})
