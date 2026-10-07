// /sitemap.xml on a Space website's domain. proxy.ts rewrites it here rather than to the sibling
// sitemap.xml folder: Next reads any `/sitemap.xml` segment as a metadata route, so a rewrite to
// /hosted/<host>/sitemap.xml fell through to the [page] route and 404'd on every site domain.
// lib/sites/host.ts holds the mapping; the handler is the one sitemap.xml/route.ts defines.
export { GET } from '../sitemap.xml/route'
