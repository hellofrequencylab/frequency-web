import Image from 'next/image'
import Link from 'next/link'
import {
  CalendarDays,
  Clock,
  BarChart3,
  Gem,
  Layers,
  Video,
  MapPin,
  Link2,
  Users,
  Tag,
  Globe,
  Award,
  CalendarClock,
  ArrowUpRight,
} from 'lucide-react'
import type { JourneyPlan, JourneyMeeting, PlanAuthor } from '@/lib/journey-plans'
import { StatCard } from '@/components/ui/stat-card'
import { SectionHeader } from '@/components/ui/section-header'
import { HelpMarkdown } from '@/components/help/help-markdown'
import { cadenceLabel } from '@/components/journey/discovery-widgets'
import { journeyAttributes, type JourneyAttributes, type PillarBalanceSlice, type LinkedEvent } from '@/lib/journeys/learn'

// Journeys v2 — the learn page's "what this is" overview. A two-column "About this Journey" hero
// (the intro story on the left; the stat band + key details on the right, stacking on mobile), a
// four-Pillar balance row, the category/tags, a "How it meets" block (format · when · timezone ·
// where · join · linked Event), and the guide. Server Components (markdown + no interactivity),
// composed entirely from the kit (StatCard / SectionHeader / HelpMarkdown) with semantic tokens
// only. Voice is v2 — Run / Phase / enroll, no em dashes (docs/CONTENT-VOICE.md).

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s)

const MEETING_FORMAT: Record<NonNullable<JourneyMeeting['format']>, { icon: typeof Video; label: string }> = {
  virtual: { icon: Video, label: 'Virtual' },
  in_person: { icon: MapPin, label: 'In person' },
  hybrid: { icon: Users, label: 'Hybrid' },
}

/** "About this Journey" — the two-column hero. Left: the intro/description (the "why this is"
 *  story). Right: the at-a-glance stat band + the key details (Pillar balance, category, tags).
 *  Stacks on mobile; splits at lg. Always renders (the phases/cadence/reward numbers are never
 *  empty); the intro side falls back to the summary, then a quiet placeholder line. */
export function AboutThisJourneyHero({
  plan,
  phaseCount,
  pillarBalance,
}: {
  plan: JourneyPlan
  /** Weeks of the course (the phase count). */
  phaseCount: number
  pillarBalance: PillarBalanceSlice[]
}) {
  const attrs: JourneyAttributes = journeyAttributes(plan)
  const covered = pillarBalance.filter((s) => s.count > 0).length
  const body = plan.intro?.trim() || null

  return (
    <section>
      <SectionHeader title="About this Journey" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* LEFT — the intro story / description (the "why this is"). */}
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          {body ? (
            <HelpMarkdown>{body}</HelpMarkdown>
          ) : plan.summary?.trim() ? (
            <p className="text-sm leading-relaxed text-text">{plan.summary}</p>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              Follow this Journey one Phase at a time, at your own pace. Each step is below.
            </p>
          )}
        </div>

        {/* RIGHT — the at-a-glance stat band + key details. */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              bordered
              size="sm"
              icon={Layers}
              label={phaseCount === 1 ? 'Week' : 'Weeks'}
              value={String(phaseCount)}
            />
            <StatCard
              bordered
              size="sm"
              icon={Clock}
              label="Daily time"
              value={attrs.dailyMinutes ? `${attrs.dailyMinutes} min` : 'Flexible'}
            />
            <StatCard
              bordered
              size="sm"
              icon={BarChart3}
              label="Difficulty"
              value={attrs.difficulty ? cap(attrs.difficulty) : 'Open to all'}
            />
            <StatCard bordered size="sm" icon={CalendarDays} label="Cadence" value={cadenceLabel(plan.drip_interval_days)} />
            <StatCard
              bordered
              size="sm"
              icon={Gem}
              label="On completion"
              value={`${plan.completion_gems} gems`}
              detail={plan.certificate_enabled ? 'Certificate too' : undefined}
            />
            <StatCard
              bordered
              size="sm"
              icon={Award}
              label="Certificate"
              value={plan.certificate_enabled ? 'Included' : 'Not offered'}
            />
          </div>

          {/* Four-Pillar balance — how the practices spread across Mind / Body / Spirit / Expression. */}
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-subtle">
              <Layers className="h-3 w-3 shrink-0" aria-hidden /> Pillar balance
              <span className="font-medium normal-case tracking-normal text-subtle">{covered} of 4 Pillars</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pillarBalance.map(({ pillar, count }) => (
                <span
                  key={pillar.slug}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                    count > 0 ? 'bg-primary-bg text-primary-strong' : 'bg-surface-elevated text-subtle'
                  }`}
                >
                  {pillar.name}
                  {count > 0 && <span className="tabular-nums opacity-80">{count}</span>}
                </span>
              ))}
            </div>
          </div>

          {/* Category + tags — the topical context, when the author set them. */}
          {(attrs.category || attrs.tags.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {attrs.category && (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated px-2.5 py-1 text-xs font-medium text-muted">
                  <Tag className="h-3 w-3 shrink-0 text-subtle" aria-hidden /> {attrs.category}
                </span>
              )}
              {attrs.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface-elevated px-2 py-0.5 text-xs text-subtle">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** "How it meets" — the meeting / format details, when the author set any. Now also surfaces the
 *  timezone (next to the schedule) and the linked Event (a cross-link to its page). Renders nothing
 *  when the whole meeting is empty (the common solo-Journey case). */
export function MeetingBlock({ meeting, linkedEvent }: { meeting: JourneyMeeting; linkedEvent?: LinkedEvent | null }) {
  const hasAny =
    meeting.format || meeting.schedule || meeting.location || meeting.link || meeting.notes || meeting.eventId
  if (!hasAny) return null
  const fmt = meeting.format ? MEETING_FORMAT[meeting.format] : null

  const rows: { icon: typeof CalendarDays; label: string; node: React.ReactNode }[] = []
  if (meeting.schedule)
    rows.push({
      icon: CalendarDays,
      label: 'When',
      // Timezone rides alongside the schedule so "Sundays 7pm" reads with its zone.
      node: meeting.timezone ? `${meeting.schedule} (${meeting.timezone})` : meeting.schedule,
    })
  else if (meeting.timezone) rows.push({ icon: Globe, label: 'Timezone', node: meeting.timezone })
  if (meeting.location) rows.push({ icon: MapPin, label: 'Where', node: meeting.location })
  if (meeting.link)
    rows.push({
      icon: Link2,
      label: 'Join',
      node: (
        <a
          href={meeting.link}
          target="_blank"
          rel="noreferrer"
          className="break-all text-primary-strong underline underline-offset-2"
        >
          {meeting.link}
        </a>
      ),
    })

  return (
    <section>
      <SectionHeader title="How it meets" />
      <div className="rounded-2xl border border-border bg-surface p-5">
        {fmt && (
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary-bg px-2.5 py-1 text-xs font-semibold text-primary-strong">
            <fmt.icon className="h-3.5 w-3.5 shrink-0" aria-hidden /> {fmt.label}
          </span>
        )}
        {rows.length > 0 && (
          <dl className="space-y-2.5">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start gap-2.5 text-sm">
                <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden />
                <dt className="w-16 shrink-0 text-muted">{r.label}</dt>
                <dd className="min-w-0 text-text">{r.node}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* The linked Event — gathers the Circle around a real meetup. Cross-links to its page when
            resolved; falls back to a plain line when the event is gone or date-less. */}
        {meeting.eventId &&
          (linkedEvent ? (
            <Link
              href={`/events/${linkedEvent.slug}`}
              className={`flex items-center gap-2 rounded-xl border border-border bg-surface-elevated/40 px-3 py-2.5 text-sm transition-colors hover:border-primary ${
                rows.length > 0 ? 'mt-3' : ''
              }`}
            >
              <CalendarClock className="h-4 w-4 shrink-0 text-primary-strong" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text">{linkedEvent.title}</span>
                {linkedEvent.startsAt && (
                  <span className="block text-2xs text-muted">
                    {new Date(linkedEvent.startsAt).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </span>
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />
            </Link>
          ) : (
            <p
              className={`flex items-center gap-2 text-sm text-muted ${rows.length > 0 ? 'mt-3' : ''}`}
            >
              <CalendarClock className="h-4 w-4 shrink-0 text-subtle" aria-hidden /> Linked event
            </p>
          ))}

        {meeting.notes && (
          <p className="mt-3 border-t border-border pt-3 text-sm leading-relaxed text-muted">{meeting.notes}</p>
        )}
      </div>
    </section>
  )
}

/** The author of the Journey — a calm authority line that cross-links to their profile. */
export function AuthorBlock({ author }: { author: PlanAuthor | null }) {
  if (!author) return null
  return (
    <section>
      <SectionHeader title="Your guide" />
      <Link
        href={`/people/${author.handle}`}
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-strong"
      >
        {author.avatarUrl ? (
          <Image
            src={author.avatarUrl}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-sm font-bold text-muted">
            {author.displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-text">{author.displayName}</span>
          <span className="block text-xs text-muted">Built this Journey. See their profile.</span>
        </span>
      </Link>
    </section>
  )
}
