import { redirect } from 'next/navigation'

// /people moved into the Network hub (ADR-172) as its Community tab. Redirect,
// forwarding any directory filters so shared/bookmarked filtered links survive.
export default async function PeopleRedirect({
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
  redirect(s ? `/network?${s}` : '/network')
}
