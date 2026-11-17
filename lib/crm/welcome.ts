// THE PERSONAL WELCOME (LIVE-2340), the pure half. A staff member welcomes each new member by hand from the
// Resonance CRM roster: a member with no welcome on record glows, and the
// glow opens a pre-filled, editable email. Nothing here sends anything; the send is always a person pressing Send
// (components/admin/crm/welcome-actions.ts). The IO half (who has been welcomed) is lib/crm/welcome-io.ts.
//
// Copy is in Daniel's voice (docs/CONTENT-VOICE.md): bold, warm, casual, a welcome and an invite to look around,
// no ask, no hard claims, no em dashes.

import type { EntityLayout } from '@/lib/entity-blocks/layout'

/** Does this member still need their personal welcome? Every member with nothing on record glows, however long
 *  ago they joined (owner ruling 2026-11-17: "Everyone not yet welcomed"). */
export function isWelcomePending(welcomed: boolean): boolean {
  return !welcomed
}

/** The first word of a display name, or null when there is nothing name-like to use (an empty name, an
 *  email address, or a handle). */
export function firstNameOf(displayName: string | null | undefined, handle?: string | null): string | null {
  const name = (displayName ?? '').trim()
  if (!name || name.includes('@')) return null
  if (handle && name.toLowerCase() === handle.trim().toLowerCase()) return null
  const first = name.split(/\s+/)[0]
  return first ? first.slice(0, 40) : null
}

/** The welcome email's subject line. */
export function welcomeSubject(memberFirst: string | null): string {
  return memberFirst ? `Welcome to Frequency, ${memberFirst}` : 'Welcome to Frequency'
}

/** Escape the few characters that matter in the rich text field, so a name can never inject markup. */
function esc(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The welcome body as a legacy email layout (a heading + one paragraph), ready for the email layout write.
 *  Every word is editable in the pop-up before it goes. */
export function welcomeDraftLayout(memberFirst: string | null, senderFirst: string | null): EntityLayout {
  const hi = memberFirst ? `Hey ${memberFirst}, welcome in` : 'Hey, welcome in'
  const me = senderFirst ? `I'm ${esc(senderFirst)}, and` : 'I'
  const paragraphs = [
    `${me} I wanted to say hi myself, person to person. I'm really glad you're here.`,
    "Frequency is where local people find each other off the screen: gatherings, Circles, and the folks behind the spaces you love. Take a look around whenever it suits you. Peek at what's coming up this week, find a Circle that fits, or just see who's around.",
    "No homework, nothing to fill out. I just wanted you to know there's a real person on this side.",
    senderFirst ? `Welcome to the crew,<br>${esc(senderFirst)}` : 'Welcome to the crew.',
  ]
  return {
    rows: [
      { id: 'r0', columns: 1, cells: [['heading']] },
      { id: 'r1', columns: 1, cells: [['text']] },
    ],
    content: {
      heading: { text: hi },
      text: { text: paragraphs.join('<br><br>') },
    },
  }
}
