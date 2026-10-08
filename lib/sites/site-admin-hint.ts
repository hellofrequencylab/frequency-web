// The website admin row's HINT (owner ask 2026-10-08: "keep the same header / menu through the site...
// a double menu with admin settings in blue"). The pass itself (site-admin-pass.ts) is an httpOnly cookie
// the page script cannot read, and the public pages are cached and anonymous, so the site's handoff
// (app/hosted/[host]/admin/enter) also sets this readable flag beside it, same host, same lifetime. The
// page script only uses it to show the admin row on the public pages; it opens nothing. The admin pages
// still check the real pass on every view.
export const SITE_ADMIN_HINT_COOKIE = '__Host-site-admin-on'
