// THE SOURCE SHELF, SOURCES (VLS-12). What a person hands Vera during a launch: a website link, an outline, a pasted
// list, an email list or a flyer. The shelf keeps the kind, a label and the sizes, never the text itself: the text is
// read once, cited into facts (lib/launch/facts.ts) and dropped. PURE, no imports from the app, so a probe can run it
// and the limits live next to the table's own check constraints (supabase/migrations/*_vera_launch.sql).

export const SOURCE_KINDS = ['website', 'outline', 'list', 'email_list', 'flyer'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/** The same ceilings the table enforces, so a bad source is refused here with a reason instead of by the database. */
export const SOURCE_LIMITS = { labelMax: 200, bytesMax: 5_242_880, charsMax: 200_000 } as const

/** A cancelled launch keeps its sources this long, so a person who changes their mind loses nothing. */
export const SOURCE_KEEP_DAYS = 30

export interface SourceInput {
  kind: string
  label: string
  sizeBytes?: number
  charCount?: number
}

export type SourceCheck = { ok: true; source: { kind: SourceKind; label: string; sizeBytes: number; charCount: number } } | { ok: false; reason: 'kind' | 'label' | 'size' | 'chars' }

export function isSourceKind(v: unknown): v is SourceKind {
  return typeof v === 'string' && (SOURCE_KINDS as readonly string[]).includes(v)
}

export function checkSource(input: SourceInput): SourceCheck {
  if (!isSourceKind(input.kind)) return { ok: false, reason: 'kind' }
  const label = input.label.trim()
  if (label.length < 1 || label.length > SOURCE_LIMITS.labelMax) return { ok: false, reason: 'label' }
  const sizeBytes = input.sizeBytes ?? 0
  if (!Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > SOURCE_LIMITS.bytesMax) return { ok: false, reason: 'size' }
  const charCount = input.charCount ?? 0
  if (!Number.isInteger(charCount) || charCount < 0 || charCount > SOURCE_LIMITS.charsMax) return { ok: false, reason: 'chars' }
  return { ok: true, source: { kind: input.kind, label, sizeBytes, charCount } }
}

/** When a source set by a cancel stops being kept: thirty days on. */
export function expiryFor(cancelledAt: Date): Date {
  return new Date(cancelledAt.getTime() + SOURCE_KEEP_DAYS * 24 * 60 * 60 * 1000)
}

export function isExpired(expiresAt: string | Date | null, now: Date): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime()
}
