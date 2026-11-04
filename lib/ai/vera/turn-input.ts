// The bounds on one Vera turn, shared by BOTH doors (SCAN-736). The streaming route always parsed
// its body with this shape; the `conciergeTurn` server action took whatever it was handed, so a
// signed-out script could post a forged 150k-token history and spend the daily caps for everyone.
// One schema, two doors, so the bound cannot drift again.

import { z } from '@/lib/validation'

export const VERA_TURN_BODY = z.object({
  stage: z.string().max(40).default('chat'),
  text: z.string().max(4000).default(''),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) }))
    .max(60)
    .default([]),
  /** The Space page they are on (LIVE-2147), read from the address bar, so Vera can explain that Space's
   *  settings to someone who helps run it. A slug only; the turn checks their role itself. */
  space: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).optional(),
})

