import { NextResponse } from 'next/server'
import { answerHelpQuestion } from '@/lib/ai/help-rag'
import { rateLimitOk, clientIp, tooMany } from '@/lib/rate-limit'

// POST /help/ask — the "Ask Vera" tier of the support menu (docs/SUPPORT-SYSTEM.md).
// Public (help is public); grounded + cited, deflects to a human on low confidence
// or when AI is off/over-budget. Always 200 with a HelpAnswer (deflect is a valid
// answer), except for a malformed request.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let question = ''
  try {
    const body = await request.json()
    if (typeof body?.question === 'string') question = body.question
  } catch {
    /* fall through to the empty-question guard */
  }

  if (!question.trim()) {
    return NextResponse.json({ error: 'A `question` string is required.' }, { status: 400 })
  }

  // Public + AI-backed: every answered question runs a paid embedding + (on a hit) an LLM
  // completion, so rate-limit per IP like the other public endpoints (search, check-handle).
  // The platform daily AI budget is an aggregate ceiling, not a per-caller guard, so without
  // this one source could burn the whole budget (denial-of-wallet + DoS for real help users).
  if (!(await rateLimitOk('help-ask', clientIp(request), 10, '60 s'))) return tooMany()

  // Cap input length (cost + abuse hygiene).
  const result = await answerHelpQuestion(question.slice(0, 500))
  return NextResponse.json(result)
}
