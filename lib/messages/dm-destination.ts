import 'server-only'
import { chatDmRoutesRetiredFlag } from '@/lib/platform-flags'
import { DOCK_DEFAULT_PATH, dockThreadPath } from '@/lib/messages/dock-open'

// ── Where a server-side "go to this conversation" lands (ADR-896, chat consolidation) ──────
// Five CRM actions and startConversation itself end in `redirect(<a DM thread>)`. Those are
// OPERATOR flows, not the member Reconnect button, so they legitimately still navigate — but
// they must not navigate to a page that is being retired.
//
// The naive version of Phase 2 leaves them pointing at /messages/<id> and lets the route's own
// gate bounce them onward to the dock. That works, and it is what the spec proposed, but it is
// a DOUBLE redirect: the member watches the chat page paint and then jump. Reading the flag
// here instead means one hop either way, and because chatDmRoutesRetiredFlag is React-cached
// the whole request shares a single round trip no matter how many call sites ask.
//
// With the flag OFF (the default) this returns exactly the string these call sites already
// hardcoded, so today's operator behaviour is byte-identical. That is deliberate: Phase 2 must
// be inert until someone flips the row.

/**
 * The path a server action should `redirect()` to in order to put the member in a DM thread.
 *
 * @param conversationId the direct-conversation id
 * @param basePath which page the dock should open OVER once the route is retired. Defaults to
 *   the feed. Only meaningful when the flag is on; ignored while the DM page still renders.
 */
export async function dmThreadHref(conversationId: string, basePath = DOCK_DEFAULT_PATH): Promise<string> {
  if (await chatDmRoutesRetiredFlag()) {
    return dockThreadPath(basePath, { kind: 'dm', id: conversationId })
  }
  return `/messages/${conversationId}`
}
