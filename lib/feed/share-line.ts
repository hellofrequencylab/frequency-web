// The Share kind's link line (LIVE-682). PURE and client-safe: the composer imports it, while the
// read that lists what a member can share (lib/feed/shareables.ts) stays on the server.

export interface Shareable {
  label: string
  href: string
  kind: 'practice' | 'journey'
}

/** The line a share adds to a post body: a markdown link the post body renders as an in-app
 *  link (components/feed/post-body.tsx). Brackets in a title are dropped so the link holds. PURE. */
export function shareLine(s: Pick<Shareable, 'kind' | 'label' | 'href'>): string {
  const label = s.label.replace(/[[\]()]/g, '').trim()
  return s.kind === 'practice' ? `I’m practicing [${label}](${s.href})` : `I’m on the [${label}](${s.href}) Journey`
}
