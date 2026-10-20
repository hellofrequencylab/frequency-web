// DUPLICATE A CAMPAIGN (EMAIL-041). A copy carries the content (subject, preheader, blocks, From name, reply
// mode) and starts over as a DRAFT owned by whoever copied it: nothing of the original's send history comes
// along (status, schedule, approval, audience, test-sent stamp), so a copy of a sent email can never go out as
// though it were the original. Pure, so the one rule lives in one place.

interface DuplicableCampaign {
  subject: string | null
  preheader: string | null
  block_json: unknown
  fromName: string | null
  replyMode: 'broadcast' | 'conversation'
}

const SUBJECT_MAX = 200

function copySubject(subject: string | null): string {
  const s = (subject ?? '').trim()
  if (!s) return ''
  return s.startsWith('Copy of ') ? s : `Copy of ${s}`.slice(0, SUBJECT_MAX)
}

export function duplicateCampaign(src: DuplicableCampaign, createdBy: string) {
  return {
    // block_json is the source of truth for the body; `body` is a NOT NULL legacy column, seeded empty.
    block_json: src.block_json,
    body: '',
    subject: copySubject(src.subject),
    preheader: src.preheader ?? '',
    status: 'draft' as const,
    created_by: createdBy,
    reply_mode: src.replyMode,
    ...(src.fromName?.trim() ? { from_name: src.fromName.trim() } : {}),
  }
}
