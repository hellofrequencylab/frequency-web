import { createAdminClient } from '@/lib/supabase/admin'
import { FacetDropdown, type FacetOption } from '@/components/ui/facet-dropdown'
import { ROLE_LABEL, type CommunityRole } from '@/lib/community-roles'

// Faceted filters for the Community directory (BUILD-LIST P5) — the same
// URL-driven FacetDropdown pattern as /events. Three facets, every option
// derived from real data present in the directory (never a hardcoded value
// that nothing matches):
//   • Topic — distinct profiles.entity_types tags carried by listed members
//   • City  — distinct cities of circles that listed members actively belong to
//             (drives the existing `city` param, resolved via memberships)
//   • Role  — the community-role ladder, only the rungs actually present
// A facet with nothing to filter by is hidden; with no facets at all the row
// renders nothing. Server component — the page stays shareable and RSC-rendered.

// Ladder order (lib/community-roles) so the dropdown reads as the progression.
const ROLE_ORDER: CommunityRole[] = ['member', 'crew', 'host', 'guide', 'mentor', 'admin', 'janitor']

// 'somatic_healer' → 'Somatic healer' — display label for a raw directory tag.
function humanizeTag(tag: string): string {
  const words = tag.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export async function DirectoryFacets({
  profiles,
  circles,
  className,
}: {
  /** The unfiltered directory (so options stay stable while a filter is active). */
  profiles: { id: string; community_role: string | null; entity_types?: string[] | null }[]
  /** Forming/active circles (id + city) — the city vocabulary. */
  circles: { id: string; city: string | null }[]
  className?: string
}) {
  // Topic — distinct entity_types tags present on listed profiles.
  const topicSet = new Set<string>()
  for (const p of profiles) {
    for (const t of p.entity_types ?? []) {
      if (t && t.trim()) topicSet.add(t)
    }
  }
  const topicOptions: FacetOption[] = [...topicSet]
    .sort((a, b) => a.localeCompare(b))
    .map((t) => ({ value: t, label: humanizeTag(t) }))

  // Role — only the rungs of the ladder that real listed members hold. With a
  // single rung everyone matches it, so there's nothing to filter by → hidden.
  const rolesPresent = new Set(profiles.map((p) => p.community_role ?? 'member'))
  const roleOptions: FacetOption[] = ROLE_ORDER.filter((r) => rolesPresent.has(r)).map((r) => ({
    value: r,
    label: ROLE_LABEL[r],
  }))
  const showRole = roleOptions.length >= 2

  // City — a city qualifies only when at least one LISTED member is an active
  // member of a circle in that city (the same memberships join the existing
  // `city` filter resolves through). Values stay the RAW stored string so the
  // page's exact `circle.city === cityFilter` match holds; labels are trimmed
  // for display. Never coordinates — city label only (ADR-186).
  let cityOptions: FacetOption[] = []
  const withCity = circles.filter((c) => c.city && c.city.trim())
  if (withCity.length > 0 && profiles.length > 0) {
    const admin = createAdminClient()
    const { data: members } = await admin
      .from('memberships')
      .select('circle_id, profile_id')
      .in('circle_id', withCity.map((c) => c.id))
      .eq('status', 'active')
    const listedIds = new Set(profiles.map((p) => p.id))
    const cityByCircle = new Map(withCity.map((c) => [c.id, c.city!]))
    const populated = new Set<string>()
    for (const m of members ?? []) {
      if (!listedIds.has(m.profile_id)) continue
      const city = cityByCircle.get(m.circle_id)
      if (city) populated.add(city)
    }
    cityOptions = [...populated]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ value: c, label: c.trim() }))
  }

  if (topicOptions.length === 0 && cityOptions.length === 0 && !showRole) return null

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      {topicOptions.length > 0 && <FacetDropdown label="Topic" paramKey="topic" options={topicOptions} />}
      {cityOptions.length > 0 && <FacetDropdown label="City" paramKey="city" options={cityOptions} />}
      {showRole && <FacetDropdown label="Role" paramKey="role" options={roleOptions} />}
    </div>
  )
}
