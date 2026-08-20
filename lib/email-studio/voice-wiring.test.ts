import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { campaignAuthoredCopy, VOICE_EM_DASH_ERROR } from './send'
import { lintVoice } from './voice-lint'
import type { EmailDoc } from './types'

// LIVE-066 — the email voice lint's CONSUMPTION chain, in the house source-shape archetype
// (components/events/series-wiring.test.ts). lintVoice was pure, unit-tested, and enforced only in
// tests: the preset suite held shipped TEMPLATES to it while every real operator send skipped it.
//
// The wiring honors the module's own severity contract to the letter: the em / en dash is "the HARD
// rule (`hasEmDash`) ... the one a caller may refuse on" and such copy "is not shippable as
// written", so the real send and the schedule REFUSE on it; banned phrases and exclamations are
// "Warnings: a human decides", so they surface through the send panel's voice preflight and never
// block. The lint's own behaviour is proven in voice-lint.test.ts; this file pins that the send
// path actually CALLS it, on the right copy, with the right severities.

const send = readFileSync('lib/email-studio/send.ts', 'utf8')
const actions = readFileSync('app/(main)/admin/email-studio/send-actions.ts', 'utf8')
const panel = readFileSync('components/admin/email-studio/send-panel.tsx', 'utf8')

// Count-based assertions run against comment-stripped copies so a deleted call cannot pass on the
// strength of the comment that explained it.
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1

describe('campaignAuthoredCopy lints the AUTHORED copy (the preset-suite assembly)', () => {
  const doc = (subject: string, preheader = '', content?: Record<string, Record<string, unknown>>): EmailDoc => ({
    subject,
    preheader,
    layout: { rows: [], content },
  })

  it('catches an em dash in the subject, the preheader, and the block content', () => {
    expect(lintVoice(campaignAuthoredCopy(doc('Hello — friends'))).hasEmDash).toBe(true)
    expect(lintVoice(campaignAuthoredCopy(doc('Hello', 'the preview — line'))).hasEmDash).toBe(true)
    expect(
      lintVoice(campaignAuthoredCopy(doc('Hello', '', { b1: { text: 'body — copy' } }))).hasEmDash,
    ).toBe(true)
  })

  it('passes clean copy, including a layout with no content map (fail-safe total)', () => {
    expect(lintVoice(campaignAuthoredCopy(doc('Hello friends', 'A plain preview line'))).hasEmDash).toBe(false)
    expect(lintVoice(campaignAuthoredCopy({ subject: 'Hi', preheader: '', layout: {} })).hasEmDash).toBe(false)
  })

  it('the refusal copy itself passes the whole lint (we practice the rule we enforce)', () => {
    expect(lintVoice(VOICE_EM_DASH_ERROR).violations).toEqual([])
  })
})

describe('the send engine refuses the hard rule on BOTH arming paths', () => {
  const code = strip(send)

  it('lints the authored copy in scheduleCampaign AND sendCampaignNow', () => {
    // Two enforcement gates + the panel-preflight read (lintCampaignVoice). Fewer = a path stopped
    // linting; more = a new call this test should learn about.
    expect(occurrences(code, 'lintVoice(campaignAuthoredCopy(')).toBe(3)
    expect(occurrences(code, '.hasEmDash) return fail(VOICE_EM_DASH_ERROR)')).toBe(2)
  })

  it('the real send refuses BEFORE the row is claimed (nothing half-sends over a refusal)', () => {
    const sendNowAt = code.indexOf('export async function sendCampaignNow')
    const gateAt = code.indexOf('return fail(VOICE_EM_DASH_ERROR)', sendNowAt)
    const claimAt = code.indexOf("update({ status: 'sending' })", sendNowAt)
    expect(sendNowAt).toBeGreaterThan(-1)
    expect(gateAt).toBeGreaterThan(sendNowAt)
    expect(claimAt).toBeGreaterThan(gateAt)
  })

  it('exposes the soft findings WITHOUT the hard line (warnings are not the refusal)', () => {
    expect(code).toContain('export async function lintCampaignVoice')
    expect(code).toContain("v.rule !== 'em-dash'")
  })
})

describe('the operator sees the findings (send panel preflight, existing Banner pattern)', () => {
  it('send-actions exposes the writer-gated preflight over lintCampaignVoice', () => {
    const code = strip(actions)
    expect(code).toContain('export async function voicePreflightAction')
    const at = code.indexOf('export async function voicePreflightAction')
    const body = code.slice(at, code.indexOf('export async function', at + 1))
    expect(body).toContain('writerGate()')
    expect(body).toContain('lintCampaignVoice(campaignId)')
  })

  it('the panel preflights both send and schedule, blocks the hard rule, and only WARNS the rest', () => {
    const code = strip(panel)
    // Both commit paths run the preflight before their action.
    expect(occurrences(code, 'await voicePreflight()')).toBe(2)
    expect(occurrences(code, 'if (voice.blocked) return')).toBe(2)
    // The hard rule blocks…
    expect(code).toContain('if (lint.data.hasEmDash) {')
    // …while warnings surface in the standard Banner and explicitly do not block.
    expect(code).toContain('voiceWarnings.length > 0')
    expect(code).toContain('<Banner tone="warning" title="Voice check">')
    expect(code).toContain('You can still send.')
  })
})
