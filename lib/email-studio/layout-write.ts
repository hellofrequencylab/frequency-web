import { sanitizeEntityLayout, type EntityLayout } from '@/lib/entity-blocks/layout'
import { hasNativeNodeStorage, legacySpaceLayoutWriteError, NODE_LAYOUT_WRITE_ERROR } from '@/lib/entity-blocks/legacy-write-guard'
import { sanitizeNodeLayout } from '@/lib/entity-blocks/node-ops'
import { renderPathEnabled } from '@/lib/platform-flags'
import { sanitizeEmailRichContent, sanitizeEmailRichNodes } from '@/lib/email-studio/render'
import type { EmailRenderLayout } from '@/lib/email-studio/render-layout'

// THE EMAIL LAYOUT WRITE (E0 task 14, ADR-1858). One decision for every email body save (the admin campaign and
// the Space draft): what to store, or why not. A NODE document is stored only while `render_path_email` is on,
// as the sanitised node tree; with the switch off (the default, and fail-closed) a node document is refused
// exactly as before. A legacy document still refuses to land over a stored node document (LIVE-877), so a
// stale tab can never erase authored node identities. Everything stored is sanitised server-side, never
// trusted from the wire.

/** The only refusal is NODE_LAYOUT_WRITE_ERROR (callers return that constant, which a source probe pins). */
type EmailLayoutWrite = { error: typeof NODE_LAYOUT_WRITE_ERROR } | { layout: EmailRenderLayout }

/** `starter` is the caller's blank email body, used when a legacy layout sanitises to nothing. */
export async function prepareEmailLayoutWrite(incoming: unknown, stored: unknown, starter: () => EntityLayout): Promise<EmailLayoutWrite> {
  if (hasNativeNodeStorage(incoming) && (await renderPathEnabled('email'))) {
    const nodes = sanitizeNodeLayout(incoming, 'email')
    return nodes ? { layout: sanitizeEmailRichNodes(nodes) } : { error: NODE_LAYOUT_WRITE_ERROR }
  }
  if (legacySpaceLayoutWriteError(incoming, null) || legacySpaceLayoutWriteError(stored, null)) return { error: NODE_LAYOUT_WRITE_ERROR }
  const clean = sanitizeEntityLayout(incoming as EntityLayout, 'email')
  return { layout: clean ? sanitizeEmailRichContent(clean) : starter() }
}
