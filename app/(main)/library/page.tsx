import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Dumbbell, Megaphone, Route, TrendingUp, Users2, Flame, ShieldCheck } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { atLeastRole } from '@/lib/core/roles'
import { IndexTemplate } from '@/components/templates'
import { EmptyState } from '@/components/ui/empty-state'
import { getInitials } from '@/lib/utils'
import { getLibrary, getMyRatings, pendingReviewCount, typeLabel, hrefFor, type ContentType, type LibraryItem } from '@/lib/library'
import { resolvePageContent, pageContentMetadata } from '@/lib/page-content'
import { RateButton, AdoptButton, SubmitProgramForm } from './interactive'

export const dynamic = 'force-dynamic'

// Coded defaults for the operator-editable content (ADR-180) — shared by the
// page header and the SEO metadata below.
const CONTENT_FALLBACK = {
  title: 'Library',
  description: "The community's best practices, programs, and journeys. Created by members, approved by leadership, ranked by what's actually working.",
}

// Operator-set title/description also drive <title> + og/twitter cards (PX.2).
export function generateMetadata() {
  return pageContentMetadata('/library', CONTENT_FALLBACK)
}

const TYPES: { key: ContentType | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'practice', label: 'Practices' },
  { key: 'program', label: 'Programs' },
  { key: 'journey', label: 'Journeys' },
]
const TYPE_ICON: Record<ContentType, typeof Dumbbell> = { practice: Dumbbell, program: Megaphone, journey: Route }
const TYPE_TONE: Record<ContentType, string> = {
  practice: 'bg-primary-bg text-primary-strong',
  program: 'bg-signal-bg text-signal-strong',
  journey: 'bg-success-bg text-success',
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; pillar?: string }>
}) {
  const caller = await getCallerProfile()
  if (!caller) redirect('/feed')

  const { type: typeParam, pillar } = await searchParams
  const type = (['practice', 'program', 'journey'].includes(typeParam ?? '') ? typeParam : null) as ContentType | null

  const isApprover = atLeastRole(caller.community_role, 'host')
  const [items, myRatings, pending] = await Promise.all([
    getLibrary({ type, pillar: pillar ?? null }),
    getMyRatings(caller.id),
    isApprover ? pendingReviewCount() : Promise.resolve(0),
  ])

  const q = (t: string) => (t === 'all' ? '/library' : `/library?type=${t}`)

  // Operator-editable page header (ADR-180) — falls back to the coded defaults.
  const { title, description, ctaLabel, ctaHref } = await resolvePageContent('/library', CONTENT_FALLBACK)

  return (
    <IndexTemplate
      title={title}
      description={description}
      action={
        (isApprover || (ctaLabel && ctaHref)) ? (
          <div className="flex items-center gap-2">
            {isApprover && (
              <Link
                href="/library/review"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-text transition-colors hover:bg-surface-elevated"
              >
                <ShieldCheck className="h-4 w-4" /> Review queue
                {pending > 0 && <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-on-primary">{pending}</span>}
              </Link>
            )}
            {/* Operator-set CTA (PX.1) — shows only when both label + link are set. */}
            {ctaLabel && ctaHref && (
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-hover"
              >
                {ctaLabel}
              </a>
            )}
          </div>
        ) : undefined
      }
      toolbar={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            {TYPES.map((t) => {
              const active = (t.key === 'all' && !type) || t.key === type
              return (
                <Link
                  key={t.key}
                  href={q(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${active ? 'bg-surface-elevated text-text' : 'text-muted hover:text-text'}`}
                >
                  {t.label}
                </Link>
              )
            })}
          </div>
          <SubmitProgramForm />
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title="Nothing in the Library yet"
          description="Create a practice, propose a program, or build a journey. Once a leader approves it, it shows up here, ranked."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <LibraryCard key={`${item.contentType}:${item.id}`} item={item} rated={myRatings.has(`${item.contentType}:${item.id}`)} />
          ))}
        </ul>
      )}
    </IndexTemplate>
  )
}

function LibraryCard({ item, rated }: { item: LibraryItem; rated: boolean }) {
  const Icon = TYPE_ICON[item.contentType]
  const href = hrefFor(item)
  return (
    <li className="flex h-full flex-col rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_TONE[item.contentType]}`}>
          <Icon className="h-3 w-3" /> {typeLabel(item.contentType)}
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-subtle" title="Best-of score">
          <TrendingUp className="h-3.5 w-3.5" /> {item.score}
        </span>
      </div>

      <h3 className="text-base font-bold leading-tight text-text">
        {href ? <Link href={href} className="hover:underline">{item.title}</Link> : item.title}
      </h3>
      {item.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{item.summary}</p>}

      {item.author && (
        <div className="mt-3 flex items-center gap-2 text-xs text-subtle">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-bg text-3xs font-semibold text-primary-strong">
            {getInitials(item.author.display_name)}
          </span>
          {item.author.display_name}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-3 text-xs text-subtle">
          <span className="inline-flex items-center gap-1" title="Adoptions"><Users2 className="h-3.5 w-3.5" />{item.adoptions}</span>
          <span className="inline-flex items-center gap-1" title="Completions / real-world use"><Flame className="h-3.5 w-3.5" />{item.completions}</span>
        </div>
        <div className="flex items-center gap-2">
          <RateButton type={item.contentType} id={item.id} count={item.ratings} rated={rated} />
          {item.contentType === 'program' && <AdoptButton id={item.id} />}
        </div>
      </div>
    </li>
  )
}
