import { describe, expect, it } from 'vitest'
import { CREATE_SPACE_SIGNALS, isVisitorKey, parseSignalBody, signalKey, signalProps, visitorKeyFrom } from './signal'
import { ANALYTICS_EVENTS } from '@/lib/analytics/events'

// LIVE-1970: the nine signals carry closed props and never text.

const V = 'abcdefghijklmnop'

describe('the nine signals', () => {
  it('are all registered in the taxonomy, server-side only', () => {
    for (const s of CREATE_SPACE_SIGNALS) {
      const def = ANALYTICS_EVENTS.find((e) => e.name === s)
      expect(def, s).toBeDefined()
      expect(def?.clientEmittable, s).toBe(false)
    }
  })

  it('keep only their own props, each of a closed kind', () => {
    expect(signalProps('createspace.view', { kit: 'designer', chosen: true, name: 'Limewell' })).toEqual({ kit: 'designer', chosen: true })
    expect(signalProps('createspace.view', { kit: 'nope', chosen: true })).toBeNull()
    expect(signalProps('createspace.accent_picked', { accent: 3 })).toEqual({ accent: 3 })
    expect(signalProps('createspace.accent_picked', { accent: 12 })).toBeNull()
    expect(signalProps('createspace.step_done', { step: 'offer', seconds: 42 })).toEqual({ step: 'offer', seconds: 42 })
    expect(signalProps('createspace.step_done', { step: 'save', seconds: 1 })).toBeNull()
    expect(signalProps('createspace.step_done', { step: 'name', seconds: 1.5 })).toBeNull()
    expect(signalProps('createspace.offer', { example_used: false, intents: 'events,nope,community' })).toEqual({ example_used: false, intents: 'events,community' })
    expect(signalProps('createspace.offer', { example_used: 'yes' })).toBeNull()
    expect(signalProps('createspace.lead', { has_phone: true, has_where: false, email: 'x@y.z' })).toEqual({ has_phone: true, has_where: false })
    expect(signalProps('createspace.photos', { uploaded: true, kept_theme: false })).toEqual({ uploaded: true, kept_theme: false })
    expect(signalProps('createspace.resume', { source: 'email' })).toEqual({ source: 'email' })
    expect(signalProps('createspace.resume', { source: 'sms' })).toBeNull()
    expect(signalProps('createspace.name_started', { name: 'typed' })).toEqual({})
    expect(signalProps('createspace.dock_click', undefined)).toEqual({})
  })

  it('never let a string through except the closed ones', () => {
    for (const s of CREATE_SPACE_SIGNALS) {
      const p = signalProps(s, { kit: 'designer', chosen: true, accent: 0, step: 'name', seconds: 0, example_used: true, intents: 'events', has_phone: true, has_where: true, uploaded: true, kept_theme: true, source: 'local', text: 'typed words', email: 'a@b.c' })
      expect(p, s).not.toBeNull()
      for (const v of Object.values(p ?? {})) if (typeof v === 'string') expect(['designer', 'name', 'events', 'local']).toContain(v)
    }
  })
})

describe('the body and the key', () => {
  it('reads a whole body and refuses a part that is off', () => {
    expect(parseSignalBody({ v: V, event: 'createspace.view', props: { kit: 'designer', chosen: false } })).toEqual({ v: V, event: 'createspace.view', props: { kit: 'designer', chosen: false } })
    expect(parseSignalBody({ v: 'short', event: 'createspace.view', props: { kit: 'designer', chosen: false } })).toBeNull()
    expect(parseSignalBody({ v: V, event: 'nav.page_view', props: {} })).toBeNull()
    expect(parseSignalBody({ v: V, event: 'createspace.view', props: { kit: 'x', chosen: false } })).toBeNull()
    expect(parseSignalBody('x')).toBeNull()
  })
  it('is once per visitor and event, and per step for a step', () => {
    expect(signalKey(V, 'createspace.view', { kit: 'designer', chosen: true })).toBe(`create_space:${V}:createspace.view:`)
    expect(signalKey(V, 'createspace.step_done', { step: 'offer', seconds: 9 })).toBe(`create_space:${V}:createspace.step_done:offer`)
  })
  it('the visitor key is minted once per tab and survives a blocked store', () => {
    const mem = new Map<string, string>()
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }
    const a = visitorKeyFrom(store, () => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    expect(isVisitorKey(a)).toBe(true)
    expect(visitorKeyFrom(store, () => 'other-key-other-key')).toBe(a)
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(isVisitorKey(visitorKeyFrom(blocked, () => 'short'))).toBe(true)
    expect(isVisitorKey(visitorKeyFrom(null, () => 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'))).toBe(true)
  })
})
