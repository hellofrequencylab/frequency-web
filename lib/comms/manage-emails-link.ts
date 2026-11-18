import 'server-only'
import { buildManageEmailsUrl } from '@/lib/unsubscribe-tokens'

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'https://frequencylocal.com'

/** The signed "Manage emails" link for a conversation email whose recipient is a member (EMAIL-079).
 *  The reply footer used to link everyone to a bare /manage-emails, which a member read as "This link
 *  is invalid or expired". Pass the result to renderReplyEmail / renderCoalescedEmail.
 *
 *  Category 'lifecycle', the same one lib/email-studio/send.ts signs its footer with: the token only
 *  proves we issued the link for this person, the page then shows every email type, and 'lifecycle'
 *  is the broad member email category, so one category serves every sender.
 *
 *  Undefined when the counterparty is a contact with no profile (there is no preference page to sign
 *  for) or when signing fails (no secret set), and the template then links the public page. Building
 *  a footer link must never block or fail a send. */
export function conversationManageUrl(memberProfileId: string | null | undefined): string | undefined {
  if (!memberProfileId) return undefined
  try {
    return buildManageEmailsUrl({ baseUrl: APP, profileId: memberProfileId, category: 'lifecycle' })
  } catch {
    return undefined
  }
}
