import { splitMessage } from '@/lib/mentions/references'

// A MESSAGE WITH ITS TAGS AS CHIPS (LIVE-2524). Plain text stays plain (no HTML is ever read from a
// message); a tag reads as "@Sam" or "#Spring sound bath". `names` carries the current name for an
// id when the caller has it, so a renamed person reads by their new name; the stored label is the
// fallback.

export function MessageText({ body, names }: { body: string; names?: ReadonlyMap<string, string> }) {
  return (
    <>
      {splitMessage(body).map((part, i) =>
        'text' in part ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span key={i} className="rounded-control bg-primary-bg px-1 font-medium text-text" data-mention={part.ref.kind}>
            {part.ref.kind === 'profile' ? '@' : '#'}
            {names?.get(part.ref.id) ?? part.ref.label}
          </span>
        ),
      )}
    </>
  )
}
