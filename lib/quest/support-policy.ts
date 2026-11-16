// Prospective participation policy. Pure: a support association is not a reward or a wellness score.
export interface CompletionPolicy {
  version: 2
  daysRequired: 14
  expressionRequired: false
  practiceEvidenceVersion: 1
  windowStart: string
  windowEnd: string
  pillarIds: string[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value)
export function isPolicyDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Only the exact currently supported contract is eligible; unknown versions fail closed. */
export function parseCompletionPolicy(raw: unknown): CompletionPolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const value = raw as Record<string, unknown>
  if (value.version !== 2 || value.daysRequired !== 14 || value.expressionRequired !== false || value.practiceEvidenceVersion !== 1) return null
  if (!isPolicyDay(value.windowStart) || !isPolicyDay(value.windowEnd) || value.windowEnd < value.windowStart) return null
  if (!Array.isArray(value.pillarIds) || value.pillarIds.length < 1 || value.pillarIds.length > 4 || !value.pillarIds.every(isId)) return null
  if (new Set(value.pillarIds).size !== value.pillarIds.length) return null
  return { version: 2, daysRequired: 14, expressionRequired: false, practiceEvidenceVersion: 1,
    windowStart: value.windowStart, windowEnd: value.windowEnd, pillarIds: [...value.pillarIds] }
}

export interface SupportLog {
  logged_for?: unknown
  support_pillar_ids?: unknown
  support_evidence_version?: unknown
  pillar_id?: unknown
  secondary_pillar_id?: unknown
  primary_pct?: unknown
}

/** A future full snapshot wins, including its known-empty set. No current-practice fallback. */
export function recordedSupportIds(log: SupportLog): string[] | null {
  if (log.support_evidence_version != null || log.support_pillar_ids != null) {
    if (log.support_evidence_version !== 1 || !Array.isArray(log.support_pillar_ids) || log.support_pillar_ids.length > 4 || !log.support_pillar_ids.every(isId)) return null
    return [...new Set(log.support_pillar_ids)]
  }
  if (!isId(log.pillar_id)) return null
  const ids = [log.pillar_id]
  if (isId(log.secondary_pillar_id) && log.secondary_pillar_id !== log.pillar_id) {
    // Reward accounting has a default, but participation credit cannot infer a missing
    // historical share. Keep the known primary; the secondary remains unknown.
    const pct = log.primary_pct
    if (typeof pct === 'number' && Number.isInteger(pct) && pct >= 50 && pct < 100) ids.push(log.secondary_pillar_id)
  }
  return ids
}

/** Days are nonexclusive support coverage; a date counts once toward this Journey. */
export function countRecordedSupportDays(logs: readonly SupportLog[], policy: CompletionPolicy, today: string): { distinctDays: number; unknownLogs: number } {
  if (!isPolicyDay(today)) return { distinctDays: 0, unknownLogs: logs.length }
  const matching = new Set(policy.pillarIds)
  const days = new Set<string>()
  let unknownLogs = 0
  for (const log of logs) {
    if (!isPolicyDay(log.logged_for) || log.logged_for < policy.windowStart || log.logged_for > policy.windowEnd || log.logged_for > today) continue
    const supports = recordedSupportIds(log)
    if (!supports) { unknownLogs += 1; continue }
    if (log.support_evidence_version == null && log.support_pillar_ids == null && log.secondary_pillar_id != null && log.secondary_pillar_id !== log.pillar_id &&
      (!isId(log.secondary_pillar_id) || typeof log.primary_pct !== 'number' || !Number.isInteger(log.primary_pct) || log.primary_pct < 50 || log.primary_pct > 100)) unknownLogs += 1
    if (supports.some((id) => matching.has(id))) days.add(log.logged_for)
  }
  return { distinctDays: days.size, unknownLogs }
}
