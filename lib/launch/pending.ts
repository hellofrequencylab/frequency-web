// THE LAUNCH HOLD (VLS-06). A visitor who starts a launch signed out has no space_launch row yet (the table's owner
// policy needs an owner). What they have answered so far is held in one httpOnly cookie for 30 days and claimed
// into a single space_launch row the moment they sign in. Same shape as the induction's pending cookie
// (app/join/(induction)/pending-induction.ts).
//
// The cookie holds step ANSWERS only: short text the person typed. Never a source file, never an upload, never
// anything from their wellness or Journey data. Every read is defensive: a cookie that is not ours, is
// hand-edited, is the wrong shape or is past 30 days reads as nothing, so a bad cookie costs a restart at worst.
//
// A PLAIN MODULE, NOT AN ACTION FILE, for the reason the induction's reader is one: the cookie is httpOnly, and a
// reader in a 'use server' file would be a callable endpoint that hands the answers back to any script.

import { isLaunchStepId, type LaunchStepId } from './steps.ts'

export const PENDING_LAUNCH_COOKIE = 'fq_pending_launch'
export const PENDING_LAUNCH_MAX_AGE = 60 * 60 * 24 * 30 // 30 days, the same as the funnel's other parked answers

const MAX_INTENTS = 8
const MAX_KEYS_PER_STEP = 12
const MAX_TOKEN = 40
const MAX_ANSWER = 500

export interface PendingLaunch {
  niche: string | null
  intents: string[]
  /** Per step, field name to what the person typed. */
  answers: Partial<Record<LaunchStepId, Record<string, string>>>
  /** ISO time of the last write, which the 30 days count from. */
  savedAt: string
}

const token = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 && v.length <= MAX_TOKEN && /^[a-z0-9_-]+$/i.test(v) ? v : null)

/** Raw cookie text to a clean hold, or null. Total: never throws, drops anything off the closed shapes. */
export function parsePendingLaunch(raw: string | undefined | null, now: Date): PendingLaunch | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  const savedMs = typeof d.savedAt === 'string' ? Date.parse(d.savedAt) : NaN
  if (!Number.isFinite(savedMs)) return null
  if (now.getTime() - savedMs > PENDING_LAUNCH_MAX_AGE * 1000 || savedMs > now.getTime() + 60_000) return null

  const intents = Array.isArray(d.intents) ? d.intents.map(token).filter((t): t is string => t !== null).slice(0, MAX_INTENTS) : []
  const answers: PendingLaunch['answers'] = {}
  if (d.answers && typeof d.answers === 'object' && !Array.isArray(d.answers)) {
    for (const [step, fields] of Object.entries(d.answers as Record<string, unknown>)) {
      if (!isLaunchStepId(step) || !fields || typeof fields !== 'object' || Array.isArray(fields)) continue
      const clean: Record<string, string> = {}
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        if (Object.keys(clean).length >= MAX_KEYS_PER_STEP) break
        if (token(k) && typeof v === 'string') clean[k] = v.slice(0, MAX_ANSWER)
      }
      if (Object.keys(clean).length > 0) answers[step] = clean
    }
  }
  return { niche: token(d.niche), intents, answers, savedAt: new Date(savedMs).toISOString() }
}

/** A hold as the cookie text. Goes through the parser's rules, so what is written is what a read would keep. */
export function serializePendingLaunch(input: Omit<PendingLaunch, 'savedAt'>, now: Date): string {
  return JSON.stringify({ ...input, savedAt: now.toISOString() })
}
