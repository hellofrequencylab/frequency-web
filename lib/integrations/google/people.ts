// Google People API reader for the contacts import (ADR-374). Pages through `people/me/connections`
// and normalizes each person down to the handful of fields the Network Profile capture uses. The
// `normalizePerson` mapping is PURE (no fetch), so field selection (primary-first, trimming, email
// lowercasing, dropping empty people) is unit-testable without the network. Server-only by use.

const PEOPLE_ENDPOINT = 'https://people.googleapis.com/v1/people/me/connections'
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,urls,addresses'

/** The subset of a People API person we read. All fields optional — Google omits empty ones. */
export interface RawPerson {
  names?: { displayName?: string; metadata?: { primary?: boolean } }[]
  emailAddresses?: { value?: string; metadata?: { primary?: boolean } }[]
  phoneNumbers?: { value?: string; metadata?: { primary?: boolean } }[]
  organizations?: { name?: string; title?: string; metadata?: { primary?: boolean } }[]
  urls?: { value?: string; metadata?: { primary?: boolean } }[]
  addresses?: { city?: string; metadata?: { primary?: boolean } }[]
}

/** A person flattened to the CreateContactInput-shaped fields the import writes. */
export interface NormalizedContact {
  displayName: string | null
  email: string | null
  phone: string | null
  title: string | null
  company: string | null
  city: string | null
  website: string | null
}

/** The primary entry (Google flags one), else the first. PURE. */
function primaryOf<T extends { metadata?: { primary?: boolean } }>(arr: T[] | undefined): T | undefined {
  if (!arr || arr.length === 0) return undefined
  return arr.find((x) => x.metadata?.primary) ?? arr[0]
}

function clean(v: string | undefined | null): string | null {
  const s = (v ?? '').trim()
  return s.length ? s : null
}

/** Flatten one People API person, or null when there's nothing usable (no name, email, or phone). PURE. */
export function normalizePerson(person: RawPerson): NormalizedContact | null {
  const name = clean(primaryOf(person.names)?.displayName)
  const email = clean(primaryOf(person.emailAddresses)?.value)?.toLowerCase() ?? null
  const phone = clean(primaryOf(person.phoneNumbers)?.value)
  if (!name && !email && !phone) return null
  const org = primaryOf(person.organizations)
  return {
    displayName: name,
    email,
    phone,
    title: clean(org?.title),
    company: clean(org?.name),
    city: clean(primaryOf(person.addresses)?.city),
    website: clean(primaryOf(person.urls)?.value),
  }
}

/** Page through the member's Google connections and return the normalized, usable rows. FAIL-SAFE:
 *  any non-OK response or network error stops paging and returns whatever was gathered so far. The
 *  page count is capped so a huge address book can never run unbounded. */
export async function fetchConnections(
  accessToken: string,
  opts?: { maxPages?: number; pageSize?: number },
): Promise<NormalizedContact[]> {
  const out: NormalizedContact[] = []
  const maxPages = opts?.maxPages ?? 10
  const pageSize = opts?.pageSize ?? 500
  let pageToken: string | undefined

  for (let i = 0; i < maxPages; i++) {
    const params = new URLSearchParams({ personFields: PERSON_FIELDS, pageSize: String(pageSize) })
    if (pageToken) params.set('pageToken', pageToken)
    let res: Response
    try {
      res = await fetch(`${PEOPLE_ENDPOINT}?${params.toString()}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      })
    } catch {
      break
    }
    if (!res.ok) break
    const json = (await res.json()) as { connections?: RawPerson[]; nextPageToken?: string }
    for (const c of json.connections ?? []) {
      const n = normalizePerson(c)
      if (n) out.push(n)
    }
    if (!json.nextPageToken) break
    pageToken = json.nextPageToken
  }
  return out
}
