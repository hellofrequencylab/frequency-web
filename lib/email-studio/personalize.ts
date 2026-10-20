import { applyMergeTags } from './render'
import { MERGE_TAG_DEFAULT_FALLBACKS } from './types'

// PER-RECIPIENT MERGE TAGS FOR A SPACE SEND (EMAIL-039). The root campaign send fills {{contact.first_name}}
// and the rest per person; a Space block send used to resolve every tag to its fallback once, so "Hi there"
// went to a roster of named members. The seam (lib/spaces/email) now runs this per recipient, after the
// one-click unsubscribe link is set and before open and click tracking are injected. HTML values are escaped
// by applyMergeTags, so a name can never inject markup; the subject stays raw text.

interface PersonalizeRecipient {
  email: string
  firstName?: string
  lastName?: string
}

/** Split a contact's display name the way the root send does: the first word is the first name. */
export function splitDisplayName(displayName: string | null | undefined): { firstName: string; lastName: string } {
  const parts = (displayName ?? '').trim().split(/\s+/).filter(Boolean)
  return { firstName: parts[0] ?? '', lastName: parts.slice(1).join(' ') }
}

export function personalizeFor(
  parts: { subject: string; html: string },
  r: PersonalizeRecipient,
): { subject: string; html: string } {
  const vars = { 'contact.first_name': r.firstName ?? '', 'contact.last_name': r.lastName ?? '', 'contact.email': r.email }
  const fallbacks = MERGE_TAG_DEFAULT_FALLBACKS
  return {
    subject: applyMergeTags(parts.subject, vars, { fallbacks, escape: false }),
    html: applyMergeTags(parts.html, vars, { fallbacks }),
  }
}
