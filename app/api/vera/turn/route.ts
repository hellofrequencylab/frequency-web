import { NextResponse } from 'next/server'
import { z, parseInput } from '@/lib/validation'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'
import { runConciergeTurn, type ConciergeTurnResult } from '@/lib/ai/vera/turn'

// The STREAMING door for a Vera turn (ADR-1287, PROG-E8). The same turn as the `conciergeTurn`
// server action (both run lib/ai/vera/turn), answered as newline-delimited JSON so the member
// watches the reply arrive instead of staring at "Vera is thinking" for the whole generation:
//
//   {"t":"delta","text":"...","round":0}   prose as it is generated (the CHIPS line never appears)
//   {"t":"final", ...ConciergeTurnResult}   the whole reply, proposals and chips, once per turn
//   {"t":"error"}                            the turn failed before a final; the client falls back
//
// A round change means the tool loop started a fresh reply (a read tool ran and Vera is answering
// again), so the client resets its draft when `round` moves. Every turn ends with exactly one
// `final` or one `error`, and the client treats a stream that ends with neither as an error too.
//
// Public by design, like the action it mirrors: the concierge serves signed-out visitors, and the
// identity lookup inside the turn is personalization, not a gate. Per-IP throttled here because
// an anonymous caller has no profile for the per-actor AI window to key on; the signed-in window
// (lib/ai/rate-limit.ts) still applies inside the turn.

const BODY = z.object({
  stage: z.string().max(40).default('chat'),
  text: z.string().max(4000).default(''),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) }))
    .max(60)
    .default([]),
})

export type VeraTurnEvent =
  | { t: 'delta'; text: string; round: number }
  | ({ t: 'final' } & ConciergeTurnResult)
  | { t: 'error' }

const encoder = new TextEncoder()
const line = (e: VeraTurnEvent) => encoder.encode(JSON.stringify(e) + '\n')

export async function POST(request: Request) {
  if (!(await rateLimitOk('vera-turn', clientIp(request), 30, '60 s'))) return tooMany()

  let body: z.infer<typeof BODY>
  try {
    body = parseInput(BODY, await request.json())
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await runConciergeTurn(body.stage, body.text, body.history, {
          onText: (text, round) => controller.enqueue(line({ t: 'delta', text, round })),
        })
        controller.enqueue(line({ t: 'final', ...result }))
      } catch {
        controller.enqueue(line({ t: 'error' }))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Proxies must not hold the body until it completes; the whole point is the trickle.
      'X-Accel-Buffering': 'no',
    },
  })
}
