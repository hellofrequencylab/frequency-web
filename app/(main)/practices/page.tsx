import Link from 'next/link'
import { getCallerProfile } from '@/lib/auth'
import { type PracticeSort } from '@/lib/practices'
import { getGlobalCapabilities } from '@/lib/core/load-capabilities'
import { canReviewLibrarySubmission } from '@/lib/moderation/scope'
import { NewPracticeButton } from '@/components/studio/practice/new-practice-button'
import { PageModules } from '@/components/widgets/page-modules'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { MembersBody, SerifTail } from '@/components/frequency/members/shared/members-body'
import { MemberHead } from '@/components/frequency/members/shared/member-head'
import { FqFindField } from '@/components/frequency/members/shared/kit-tools'

// Practices (ADR-270/294). The whole interior is module-driven: the personal blocks (stats ·
// activity · Pillar balance · your practices), the ranked best-of catalog of practices AND journeys
// (the Library's, since /library became a 308 here: LIVE-681, ADR-1678) AND the faceted Practice
// Library are layout modules arranged by the operator (Settings ▾ → Page → Layout). Both catalogs
// are URL-driven; they read the page's facets from the `x-search` request header (proxy.ts), since
// searchParams are a page prop a nested module never receives. This page keeps only the header +
// the search/sort toolbar (which WRITE those facets into the URL) and then renders <PageModules>.

// Coded defaults for the operator-editable header content (ADR-180).
const CONTENT_FALLBACK = {
  title: 'Practices',
  description: 'This is where the Zaps come from: a growing community library. Adopt or claim a practice, then log it every day to earn Zaps and keep your streak alive.',
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2);
// the fallback strings are the page's previous static metadata, unchanged.
export function generateMetadata() {
  return pageContentMetadata('/practices', {
    title: 'Practices',
    description: 'Browse the community practice library, adopt one, and log it to build your streak.',
  })
}

const SORTS: { key: PracticeSort; label: string }[] = [
  { key: 'trending', label: 'Trending' },
  { key: 'top', label: 'All-time' },
  { key: 'new', label: 'New' },
  { key: 'az', label: 'A-Z' },
]


export default async function PracticesPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; pillar?: string; sub?: string; tag?: string; sort?: string; page?: string; hidden?: string
  }>
}) {
  const sp = await searchParams
  const sort: PracticeSort =
    sp.sort === 'top' || sp.sort === 'new' || sp.sort === 'az' ? sp.sort : 'trending'
  const qParam = sp.q?.trim() || ''

  const caller = await getCallerProfile()
  const caps = await getGlobalCapabilities()
  const isAdmin = caps.has('admin.access')
  const showHidden = isAdmin && sp.hidden === '1'
  // Authoring a library practice is open to any signed-in member (LIVE-222 / LIVE-409).
  // The quantity cap is `practice_publish` at go-live, never a Crew wall on this button.
  const signedIn = !!caller
  const canCreatePractice = caps.has('practice.create')
  // The review queue's door moved here with the Library (LIVE-681, ADR-1678): /library is a 308 to
  // this page, and /library/review keeps its own route. Same helper as the queue page and the
  // Approve action (staff or a granted Platform moderator), so no one sees a door that refuses.
  const canReview = !!caller && canReviewLibrarySubmission(caller.webRole)

  // The toolbar writes the facets the library module reads back from the URL.
  const base = {
    q: qParam || undefined,
    pillar: sp.pillar || undefined,
    sub: sp.sub || undefined,
    tag: sp.tag || undefined,
    sort: sort !== 'trending' ? sort : undefined,
    hidden: showHidden ? '1' : undefined,
  }
  function href(over: Partial<typeof base>): string {
    const m = { ...base, ...over }
    const u = new URLSearchParams()
    if (m.q) u.set('q', m.q)
    if (m.pillar) u.set('pillar', m.pillar)
    if (m.sub) u.set('sub', m.sub)
    if (m.tag) u.set('tag', m.tag)
    if (m.sort) u.set('sort', m.sort)
    if (m.hidden) u.set('hidden', m.hidden)
    const s = u.toString()
    return s ? `/practices?${s}` : '/practices'
  }

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, body, ctaLabel, ctaHref } =
    await resolvePageContent('/practices', CONTENT_FALLBACK)
  // The uniform overlay Hero Header, resolved by the ONE browse-hero ladder (lib/layout/index-hero,
  // PROG-P4). This page used to re-type the whole stanza — operator image, then page-content hero,
  // then the section cover, with the focal point riding the operator's upload alone, then the
  // operator-tunable header element. All of it now lives in the resolver, and the section cover
  // ('/images/site/meditation-circle.jpg') is the '/practices' row of INDEX_HERO_DEFAULTS. The
  // page-content hero is passed explicitly because this page has already resolved it for its copy.
  return (
    <MembersBody>
      <MemberHead
        kicker="The Quest · Practices"
        title={<SerifTail text={title} />}
        meta={description}
        actions={
          signedIn || (ctaLabel && ctaHref) ? (
            <div className="row wrap">
              {signedIn && <NewPracticeButton canCreate={canCreatePractice} className="btn pa" />}
              {canReview && (
                <Link href="/library/review" className="btn">
                  Review queue
                </Link>
              )}
              {ctaLabel && ctaHref && (
                <a href={ctaHref} className="btn">
                  {ctaLabel}
                </a>
              )}
            </div>
          ) : undefined
        }
      />
      {body && <div className="body mc-bottom-24">{body}</div>}
      <div className="fqm-tools">
        <FqFindField
          action="/practices"
          value={qParam}
          placeholder="Search practices"
          keep={{ pillar: sp.pillar, sub: sp.sub, tag: sp.tag, sort: sort !== 'trending' ? sort : undefined, hidden: showHidden ? '1' : undefined }}
        />
        <nav className="chips" aria-label="Sort practices">
          {SORTS.map((x) => (
            <Link
              key={x.key}
              href={href({ sort: x.key === 'trending' ? undefined : x.key })}
              scroll={false}
              className={sort === x.key ? 'chip on' : 'chip'}
              aria-current={sort === x.key ? 'true' : undefined}
            >
              {x.label}
            </Link>
          ))}
          {isAdmin && (
            <Link href={href({ hidden: showHidden ? undefined : '1' })} className={showHidden ? 'chip on' : 'chip'} title="Admin: include hidden practices">
              {showHidden ? 'Hidden shown' : 'Show hidden'}
            </Link>
          )}
        </nav>
      </div>
      <div className="space-y-8">
        <PageModules route="/practices" />
      </div>
    </MembersBody>
  )
}
