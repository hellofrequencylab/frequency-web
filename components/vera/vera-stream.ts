// The client half of a streamed Vera turn (ADR-1287, PROG-E8). Both Vera surfaces (the shared
// chat body and the onboarding lightbox) call `streamConciergeTurn` instead of the server action
// directly: it opens the NDJSON door at /api/vera/turn, hands every prose delta to `onDelta`, and
// resolves with the same `ConciergeTurnResult` the action returns. When the door cannot be opened
// (a 429, a proxy that refuses to stream, an old build) it falls back to the action, so a member
// on any network still gets the whole reply; it just arrives at once.
//
// Client-safe on purpose: TYPE imports only from the server modules, no globals beyond fetch, no
// SDK. Pure parsing lives in `createLineReader` + `parseTurnEvent` so it is unit-tested without a browser.

import { conciergeTurn, type ConciergeTurnResult } from '@/app/onboarding/vera-actions'
import type { VeraMessage } from '@/lib/ai/vera/agent-claude'
import type { VeraTurnEvent } from '@/app/api/vera/turn/route'

export interface StreamHandlers {
  /** Prose as it arrives. `round` moves when Vera starts a fresh reply after a tool ran; the
   *  consumer resets its draft on a round change and appends within one. */
  onDelta: (text: string, round: number) => void
}

/** Pure: split a chunked byte stream into complete NDJSON lines, buffering a partial tail. */
export function createLineReader(): { push: (chunk: string) => string[]; flush: () => string[] } {
  let buffer = ''
  return {
    push(chunk) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      return lines.filter((l) => l.trim().length > 0)
    },
    flush() {
      const rest = buffer.trim()
      buffer = ''
      return rest ? [rest] : []
    },
  }
}

/** Pure: one NDJSON line to an event, or null for a line we do not recognise (ignored, never fatal). */
export function parseTurnEvent(raw: string): VeraTurnEvent | null {
  try {
    const v = JSON.parse(raw) as { t?: unknown }
    if (!v || typeof v !== 'object') return null
    if (v.t === 'delta' || v.t === 'final' || v.t === 'error') return v as VeraTurnEvent
    return null
  } catch {
    return null
  }
}

/**
 * Run one turn, streaming. Resolves with the final result; never rejects. Falls back to the
 * blocking action when the stream cannot be opened at all. A stream that opened and then broke
 * resolves with whatever prose arrived (better than a second, double-billed turn), and with no
 * proposals or chips, so nothing half-heard is offered as an action.
 */
export async function streamConciergeTurn(
  stage: string,
  text: string,
  history: VeraMessage[],
  handlers: StreamHandlers,
): Promise<ConciergeTurnResult> {
  let res: Response
  try {
    res = await fetch('/api/vera/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
      body: JSON.stringify({ stage, text, history }),
    })
  } catch {
    return conciergeTurn(stage, text, history)
  }
  if (!res.ok || !res.body) return conciergeTurn(stage, text, history)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const lines = createLineReader()
  let draft = ''
  let round = -1
  let sawDelta = false

  const handle = (raw: string): ConciergeTurnResult | 'error' | null => {
    const ev = parseTurnEvent(raw)
    if (!ev) return null
    if (ev.t === 'delta') {
      if (ev.round !== round) {
        round = ev.round
        draft = ''
      }
      draft += ev.text
      sawDelta = true
      handlers.onDelta(ev.text, ev.round)
      return null
    }
    if (ev.t === 'final') {
      const { t: _t, ...result } = ev
      return result
    }
    return 'error'
  }

  try {
    let broken = false
    for (;;) {
      const { value, done } = await reader.read()
      const chunkLines = done ? lines.flush() : lines.push(decoder.decode(value, { stream: true }))
      for (const raw of chunkLines) {
        const out = handle(raw)
        if (out === 'error') {
          broken = true
          break
        }
        if (out) return out
      }
      if (done || broken) break
    }
  } catch {
    // fall through to the partial-reply path below
  }

  // No final event. If nothing streamed, the door never really opened: take the blocking path.
  if (!sawDelta) return conciergeTurn(stage, text, history)
  return { message: draft.trim(), stage: 'chat', proposals: [], suggestions: [], done: false }
}
