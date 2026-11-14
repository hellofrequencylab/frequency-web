import React, { cloneElement, isValidElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const io = vi.hoisted(() => ({ profileId: 'member' as string | null, evaluation: {} as Record<string, unknown> }))
vi.mock('@/lib/quest/crew-context', () => ({ getCrewContext: async () => io.profileId ? { profileId: io.profileId, season: { season_number: 7 } } : null }))
vi.mock('@/lib/journeys/progress', () => ({ getMemberJourneyProgress: async () => [{ planId: 'journey', slug: 'quiet-time', title: 'Quiet time', inCohort: false, complete: true }] }))
vi.mock('@/lib/quest/completion', () => ({ evaluateJourneyCompletion: async () => io.evaluation }))
vi.mock('@/app/(main)/crew/challenges/expression-action', () => ({ ExpressionAction: () => <button>Record Expression</button> }))
import { QuestJourneys } from './quest-journeys'

// Resolve actual asynchronous Server Components before rendering their synchronous UI.
async function resolveServerChildren(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) return Promise.all(node.map(resolveServerChildren))
  if (!isValidElement<{ children?: ReactNode }>(node)) return node
  if (typeof node.type === 'function' && node.type.constructor.name === 'AsyncFunction') {
    return resolveServerChildren(await (node.type as (props: unknown) => Promise<ReactNode>)(node.props))
  }
  if (node.props.children === undefined) return node
  return cloneElement(node, undefined, await resolveServerChildren(node.props.children))
}
async function html() { return renderToStaticMarkup(await resolveServerChildren(await QuestJourneys())) }

beforeEach(() => { io.profileId = 'member'; io.evaluation = { policyVersion: 2, evidenceAvailable: true, daysRequired: 14, hasExpression: true, expressionDone: false } })
describe('finished prospective Journey wiring', () => {
  it('never offers a challenge action when this Journey has no challenge', async () => {
    io.evaluation.hasExpression = false
    const result = await html()
    expect(result).not.toContain('Record Expression')
    expect(result).not.toContain('Expression invitation, whenever you choose')
    expect(result).toContain('You finished this Journey')
  })
  it('keeps a real unfinished optional challenge actionable after Journey completion', async () => {
    const result = await html()
    expect(result).toContain('Record Expression')
    expect(result).not.toContain('Expression Challenge done')
  })
  it('does not offer the action again after actual Expression completion', async () => {
    io.evaluation.expressionDone = true
    const result = await html()
    expect(result).not.toContain('Record Expression')
    expect(result).toContain('Expression Challenge done')
  })
  it('preserves the original finished rendering for a legacy enrollment', async () => {
    io.evaluation = { daysRequired: 14 }
    expect(await html()).toContain('Expression Challenge done')
  })
  it('does not expose a member progress widget without a signed-in context', async () => {
    io.profileId = null
    expect(await QuestJourneys()).toBeNull()
  })
})
