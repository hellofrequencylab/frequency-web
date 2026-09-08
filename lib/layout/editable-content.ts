// Routes whose page content is operator-editable from the page Settings panel
// (ADR-180): the header title + description — which also drive the route's SEO
// metadata via `pageContentMetadata` in its `generateMetadata` — plus an optional
// hero image and call-to-action (PX.1). Putting a route here makes its PageHeading
// editable by an admin+ from the Settings dropdown; the page itself must read
// `resolvePageContent(route, fallback)` (lib/page-content) for the edits to take
// effect — editing is purely additive, with the coded copy as the fallback. The
// hero/CTA render only where the page's template has a natural slot for them.
//
// This is the single registry for the site-wide content sweep: add a route here AND
// wire its page to resolvePageContent (+ pageContentMetadata), and the page becomes
// editable in place.
/** The reserved SITE rung of the copy cascade (PROG-P6, ADR-1122 / ADR-1284): the `page_content`
 *  row every page inherits from when neither it nor its section says anything. It is not a route
 *  (`page_content.route` is free text and no router path can be `'*'`), so it is NOT in
 *  `CONTENT_EDIT_ROUTES` below; the save action admits it beside the registry, and the operator
 *  sets it from `/admin/page-layout/copy`. Declared here rather than in `content-cascade.ts`
 *  (which re-exports it) because that module is `server-only` and the client editor needs the key.
 *
 *  🔴 IT IS DELIBERATELY NOT `'/'`. The home page owns the `'/'` row (it is in the registry for
 *  its SEO title + meta description alone), so making `'/'` the site rung would quietly promote
 *  the home page's `<title>` to the default title of every page in the app. */
export const SITE_SCOPE = '*'

export const CONTENT_EDIT_ROUTES = [
  // Home: SEO title + meta description ONLY (edited from /pages/home). The page
  // itself is a coded experience (live counts, parallax) and stays in code — it
  // reads resolvePageContent('/') in generateMetadata, nothing else.
  '/',
  '/network',
  '/circles',
  '/channels',
  '/events',
  '/classifieds',
  '/messages',
  '/journeys',
  '/practices',
  '/library',
  // Renamed from '/broadcast' with the route (ADR-1020). `page_content` is keyed by the
  // ROUTE STRING, so this registry line, the page's resolvePageContent call, and its
  // pageContentMetadata call all had to move together or the operator's edits would write
  // to one key and the page would read another.
  //
  // 🔴 THE ROW HAD TO BE RE-KEYED, AND I FIRST SAID IT DIDN'T. This comment used to claim no
  // data migration was needed because the production `/broadcast` row was "measured empty".
  // It was measured on `title` and `description` ONLY. `hero_image` was set, and
  // `pageContentMetadata` (lib/page-content.ts) falls back to it for the route's OG image —
  // so from the rename until 2026-08-13 Around You shared with no social image. The row was
  // re-keyed to '/nearby' in production on 2026-08-13; no '/nearby' row existed, so it was a
  // rename, not a merge.
  //
  // THE LESSON FOR THE NEXT ROUTE RENAME, which is the only reason this is written down:
  // a route string is a FOREIGN KEY held in text, and it is held in more than one table.
  // Renaming a route means sweeping production for the old string, not spot-checking the two
  // columns you happen to be thinking about. The full sweep found three rows: this one, the
  // `menu_items` row for the "Around You" nav link (repointed the same day — it had been
  // riding the 308 in next.config.ts, which works but costs every member a redirect hop),
  // and one in `help_chunks` that was a false positive (`/help/sharing/broadcasts`, an
  // article path that has nothing to do with the retired route).
  '/nearby',
  // Admin Menu Manager: the page Settings is trimmed to Subtitle + Layout (ADR-359). The
  // Subtitle editor edits only this route's description (the header subtitle); the page reads
  // it via resolvePageContent('/admin/menu', fallback), with the coded line as the fallback.
  '/admin/menu',
] as const
