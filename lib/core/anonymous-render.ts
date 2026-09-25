// THE ANONYMOUS RENDER FLAG — a render that has declared it has no viewer, and must not go
// looking for one.
//
// WHY THIS EXISTS, and it is not a convenience. A page under `app/(public)/` is ISR
// (`revalidate = 3600`, `generateStaticParams`): its HTML is built once and served to everyone.
// A viewer-dependent read inside such a page is wrong twice over — it voids ISR (a dynamic API
// makes Next render the route per-request, which is the whole cost SCAN-643 / SCAN-644 /
// ADR-1452 / ADR-1465 were opened to remove), and if it somehow did not, it would bake ONE
// visitor's identity into a document every other visitor is then served.
//
// So on those pages "there is no viewer" is not a fallback. It is the contract, and this flag is
// how a page states it.
//
// 🔴 WHY A FLAG AND NOT AN AUDIT. The previous shape of this rule was a file-local grep
// (lib/nav/public-detail-isr.test.ts): it reads the PAGE's own source for `getMyProfileId`,
// `cookies()` and friends. That gate cannot see one level down, and the render it guards reaches
// about 256 server modules. Measured on the Space profile body at the time of writing, THREE
// call sites executed a viewer read the probe could not see — `getSpaceCommunity`
// (lib/spaces/content-data.ts), the Circles block's own member check
// (components/widgets/space-profile/circles.tsx) and `getSpaceProgram` (lib/spaces/enroll.ts,
// reached only when a Features block picks the `program` source). Threading a null viewer through
// those three would have fixed those three, and the fourth — whichever block is added next —
// would have voided ISR silently, because nothing would have been watching. A per-call fix does
// not survive the next block. A seam does.
//
// EVERY server-side identity read in this app funnels through `getCachedUser()` (ADR-1244,
// LIVE-178: one viewer read per request). `getCallerProfile`, `getMyProfileId`, `isPlatformStaff`,
// `isPaidViewer` and `getCachedViewerProfile` all sit on top of it. So honouring this flag in that
// ONE function makes the whole tree anonymous, including code that does not know this file exists
// — which is the point, because the code that will break this rule next has not been written yet.
//
// READ-ONLY FALLS OUT OF IT. With no viewer, every "am I a member / may I manage this" check
// resolves false, so join, follow, RSVP, owner tools and the member-only branches render as their
// signed-out selves. A public page does not have to remember to hide its controls; it cannot show
// them.
//
// WHERE THE SEAM DOES NOT REACH, because a boundary you have not named is one you will trip over.
// `getCachedUser` catches everything that RESOLVES A VIEWER. It does not catch code that reads a
// cookie DIRECTLY without asking who the viewer is — that code has to answer for itself. There is
// one such reader on the public Space render today, `viewerHidesDemo` (lib/demo-preference.ts), and
// it checks this flag for that reason. A per-viewer cookie added anywhere on a public render is the
// one shape to look for; it will not be caught here.
//
// SCOPE: this is for a route that is ALREADY anonymous by construction. It is never a way to drop
// privileges inside a member render — a signed-in surface that wants a public view of something
// passes a null viewer id to the reader it is calling, as every reader here already accepts.

import { cache } from 'react'

interface AnonymousRenderHolder {
  anonymous: boolean
}

// One holder per request (React.cache memoizes by args — no args = one cell per request), the same
// request-scoped idiom lib/spaces/active-space.ts and lib/circles/active-circle.ts use. A render
// that never marks itself reads `false` and behaves exactly as it did before, so this is inert
// everywhere it is not deliberately switched on.
const holder = cache((): AnonymousRenderHolder => ({ anonymous: false }))

/**
 * Declare that THIS render has no viewer: identity reads resolve to anonymous without touching
 * `cookies()`, so an ISR page stays statically renderable.
 *
 * Call it BEFORE the first identity read — in practice the first statement of a `app/(public)/`
 * page body. It cannot be undone within a request, on purpose: a page that has promised to be
 * cacheable does not get to change its mind half way down and bake a viewer into the document.
 */
export function markAnonymousRender(): void {
  holder().anonymous = true
}

/** Whether this render has declared itself viewer-free. Read by `getCachedUser` (lib/auth.ts). */
export function isAnonymousRender(): boolean {
  return holder().anonymous
}
