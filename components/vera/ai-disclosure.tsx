// The one "this is AI" line (OWN-061, ADR-1515). EU AI Act Article 50 asks that a person talking to
// an AI, or reading what one wrote, is told so. That duty applied from 2 Aug 2026 and it is met here,
// once, so every member-facing Vera surface says the same plain thing in the same voice.
//
// ── WHY ONE COMPONENT AND NOT A SENTENCE PER SURFACE ───────────────────────────────────────────
// Before this file the product had exactly one such sentence, typed inline in the onboarding
// lightbox, and the persistent companion, the Studio review board, the Dispatch and the events lane
// had none. A disclosure that lives in one surface's JSX is a disclosure the next surface forgets.
// Registered here, a surface that renders Vera output imports it, and OWN-061's probe checks that
// at least one does; the test beside this file lists every surface that must.
//
// ── THE COPY IS A MEMBER-FACING SENTENCE, SO THE VOICE CANON APPLIES ────────────────────────────
// docs/CONTENT-VOICE.md: plain, no em dash, never narrate the reader's feelings. "Vera is AI." is
// the whole legal content, in three words a skeptic can read without flinching. The `copy` kind adds
// the one fact Article 50 wants beside generated text: she wrote it. A surface may append ONE more
// plain sentence through `detail` (what she does here, or what to do with what she wrote); it may
// not replace the disclosure itself.
//
// Server-safe on purpose: no hooks, no client directive, no imports. A Server Component (the events
// lane) and a client island (the chat) both render it, and it adds nothing to the eager shell.

/** The disclosure, by what the reader is looking at. */
export type AiDisclosureKind = 'chat' | 'copy'

/** The sentence per kind. Exported so a test, or a plain-text surface such as email, reads it once. */
export const AI_DISCLOSURE: Record<AiDisclosureKind, string> = {
  /** A conversation with her. */
  chat: 'Vera is AI.',
  /** Text she produced: a draft, a blurb, a Dispatch. */
  copy: 'Vera is AI, and she wrote this.',
}

export interface AiDisclosureProps {
  kind: AiDisclosureKind
  /** One more plain sentence after the disclosure. Optional; never a replacement for it. */
  detail?: string
  className?: string
}

export function AiDisclosure({ kind, detail, className }: AiDisclosureProps) {
  return (
    <p
      role="note"
      data-ai-disclosure={kind}
      className={['text-meta text-subtle', className].filter(Boolean).join(' ')}
    >
      {AI_DISCLOSURE[kind]}
      {detail ? ` ${detail}` : null}
    </p>
  )
}
