import { redirect } from 'next/navigation'

// The connections list moved into the Network hub (ADR-172) as its My Contacts tab.
// Redirect, forwarding the status/search filters. The /connections/[id], /new, and
// /shared sub-routes stay in place — the hub's contact cards still link to them.
export default async function ConnectionsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x))
    else if (v != null) qs.set(k, v)
  }
  const s = qs.toString()
  redirect(s ? `/network/contacts?${s}` : '/network/contacts')
}
