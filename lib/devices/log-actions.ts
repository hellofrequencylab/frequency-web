'use server'

// CyberUnicorn console DEVICE LOG report (LIVE-1224). Staff only (consoleStaffGate). When the console
// shows a problem, or staff press Copy log, it sends the last device log lines here and they land in the
// server's runtime log under `[cu5k-log]` (a start line, then one line per device line), so support can
// read them without anyone copying text by hand (owner's choice, 2026-10-21). Nothing is stored. Signed
// check-in links are cut again here.

import { type ActionResult, ok, fail } from '@/lib/action-result'
import { consoleStaffGate } from './store'

const LINES_MAX = 150
const LINE_MAX = 400

export async function reportConsoleLog(rawReason: unknown, rawLines: unknown): Promise<ActionResult> {
  const gate = await consoleStaffGate()
  if (!gate) return fail('Only Frequency staff can send a device log.')
  if (!Array.isArray(rawLines)) return fail('No log to send.')
  const reason = (typeof rawReason === 'string' ? rawReason : '').slice(0, 200)
  const lines = rawLines
    .filter((l): l is string => typeof l === 'string')
    .slice(-LINES_MAX)
    .map((l) => l.slice(0, LINE_MAX).replace(/\/c\/[A-Za-z0-9_-]{16,}/g, '/c/...').replace(/\?s=v1\.[A-Za-z0-9._-]+/g, '?s=...'))
  // One runtime-log line per device line, so a long log is never cut off when it is read back.
  const run = Date.now().toString(36)
  console.info(`[cu5k-log] ${run} start ${JSON.stringify({ by: gate.callerId, reason, count: lines.length })}`)
  lines.forEach((line, i) => console.info(`[cu5k-log] ${run} ${String(i).padStart(2, '0')} ${line}`))
  return ok()
}
