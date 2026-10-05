import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { sourceWithoutComments } from '@/test/source-shape'

// SCAN-724 — startJourneyRunAction enrolled a whole Circle in ANY Journey.
//
// THE DEFECT. The action checked WHO may start a Run (resolveRunGate) and, for a Space Circle,
// that the Space offers the plan. For a member's own Circle any plan id went straight to startRun,
// which enrols every active member and marks their adoption active, which the learn page reads as
// enrolled. The price, tier and seat gate (checkFreeEnrol) only guarded adoptPlanAction, so a
// member could create a Circle, add friends, start a Run on a priced public Journey (or a private
// draft) and hand everyone the full lesson player for nothing.
//
// SOURCE-SHAPE: the failure is a missing gate between the WHO check and startRun. A runtime
// happy path of a free Journey still starting would not notice the hole.

const FILE = path.join(import.meta.dirname, 'run-actions.ts')
const src = sourceWithoutComments(FILE)

function actionBody(): string {
  const a = src.indexOf('export async function startJourneyRunAction(')
  expect(a).toBeGreaterThan(0)
  const b = src.indexOf('\nexport ', a + 10)
  return src.slice(a, b < 0 ? src.length : b)
}

describe('startJourneyRunAction meets the Journey door before starting a Run (SCAN-724)', () => {
  it('is non-trivial (guards a vacuous pass)', () => {
    expect(src.length).toBeGreaterThan(500)
    expect(src).toContain('export async function startJourneyRunAction')
  })

  it('runs the price, tier and seat gate after the WHO gate and before startRun', () => {
    const body = actionBody()
    const who = body.indexOf('resolveRunGate(')
    const door = body.indexOf('checkFreeEnrol(')
    const start = body.indexOf('await startRun(')
    expect(who).toBeGreaterThan(0)
    expect(
      door,
      'a Run enrols a whole Circle in any Journey without consulting the price, tier or seat gate (SCAN-724)',
    ).toBeGreaterThan(who)
    expect(start).toBeGreaterThan(door)
  })

  it('refuses a private Journey to anyone but its author or a manager, without admitting it exists', () => {
    const body = actionBody()
    const priv = body.indexOf("meta.visibility === 'private' && !isOwner")
    expect(priv).toBeGreaterThan(0)
    expect(body.slice(priv, priv + 120)).toContain("fail('Journey not found.')")
    expect(body).toContain("caps.has('journey.editSettings')")
  })

  it('measures the seat cap against the whole roster, not one seat', () => {
    const body = actionBody()
    const roster = body.indexOf('rosterFitsJourney(')
    const start = body.indexOf('await startRun(')
    expect(roster).toBeGreaterThan(0)
    expect(start).toBeGreaterThan(roster)
    expect(body.slice(roster, roster + 160)).toContain('fail(JOURNEY_FULL_MESSAGE)')
    const helper = src.slice(src.indexOf('async function rosterFitsJourney'), src.indexOf('export async function startJourneyRunAction'))
    expect(helper).toContain('runRosterHasRoom(')
    expect(helper).toContain("from('memberships')")
  })

  it('passes the gate result through as the refusal, so the caller learns why', () => {
    expect(actionBody()).toContain('return fail(enrol.error)')
  })
})
