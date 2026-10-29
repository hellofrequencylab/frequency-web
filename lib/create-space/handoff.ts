// THE HAND-OVER FROM /create-a-space TO THE LAUNCH, the pure half. The builder's answers (name, handle, kit, accent,
// goals, host) leave the visitor's browser exactly once, at the last move, and ride into the launch hold
// (lib/launch/pending.ts) that the launch page already prefills from. PURE and client-safe: it only maps shapes and
// names the one address. The cookie write and the sign-in are in app/(marketing)/create-a-space/actions.ts.
//
// Mapping, builder to hold:
//   name   -> answers.spotlight.name   (the Spotlight form opens with it)
//   goals  -> intents                  (WIZARD_INTENTS ids are the launch's starting intents)
//   handle, kit, accent, host -> answers.spotlight.{handle, theme, accent, host} (lib/launch/carry.ts)
// Nothing is made up: the Spotlight's one line and link stay empty for the visitor to write on the launch page.

import { carryFields } from '@/lib/launch/carry'
import type { PendingLaunch } from '@/lib/launch/pending'
import { launchHomeHref } from '@/lib/launch/destination'
import { claimedHandle, isValidHandle, parseDraft, type BuilderDraft } from '@/lib/create-space/builder'

/** The draft as the server action receives it: the browser's own JSON, re-parsed by the builder's reader (so it is
 *  cut to the closed shape), then required to hold a name and a valid handle. Null when it is not enough to hand over. */
export function parseHandoff(raw: unknown): BuilderDraft | null {
  const draft = typeof raw === 'string' && raw.length <= 8000 ? parseDraft(raw, null) : null
  if (!draft || !draft.name.trim() || !isValidHandle(claimedHandle(draft))) return null
  return draft
}

/** The launch hold for a draft. */
export function holdFor(draft: BuilderDraft): Omit<PendingLaunch, 'savedAt'> {
  return {
    niche: null,
    intents: [...draft.goals],
    answers: {
      spotlight: {
        name: draft.name.trim(),
        ...carryFields({ handle: claimedHandle(draft), theme: draft.kit, accent: String(draft.accentAt), host: draft.hostName.trim() }),
      },
    },
  }
}

interface Destination {
  /** Where sign-in sends the visitor (a same-origin path): the claim route, which starts the account's one launch from
   *  the hold and lands on /launch. */
  next: string
  /** A page a signed-out visitor can keep going on while the email travels: the Spotlight form, which reads the hold.
   *  Null when the launch is off, because that page does not open then. */
  keepBuildingHref: string | null
}

/** Where a draft goes. One destination, the launch. The launch's own routes (/launch/claim and the Spotlight form) 404
 *  while LAUNCH_SYSTEM_ENABLED is off, so then, and only then, sign-in returns to the signed-in Create a Space form
 *  instead (no hints) and there is no keep-building link: nobody is sent to a 404. */
export function destinationFor(launchOpen: boolean): Destination {
  return launchOpen ? { next: '/launch/claim', keepBuildingHref: launchHomeHref({ signedIn: false }) } : { next: '/spaces/new', keepBuildingHref: null }
}
