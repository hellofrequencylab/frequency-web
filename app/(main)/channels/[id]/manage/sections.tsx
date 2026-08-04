import Link from 'next/link'
import {
  Users,
  Circle as CircleIcon,
  MessageSquare,
  Hash,
  Radio,
  Check,
  Clock,
  Pencil,
} from 'lucide-react'
import { SectionHeader } from '@/components/ui/section-header'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { Button } from '@/components/ui/button'
import { fieldClasses, labelClasses } from '@/components/ui/field'
import {
  loadChannelHomeStats,
  loadTunedInMembers,
  loadChannelCircles,
  loadAssignableCircles,
  loadProgramSection,
} from './load'
import {
  attachChannelProgramAction,
  updateChannelProgramAction,
  setChannelProgramPausedAction,
  refreshChannelProgramBlueprintAction,
  detachChannelProgramAction,
  addChannelCircleAction,
  removeChannelCircleAction,
  setChannelOwnerSpaceAction,
  clearChannelOwnerSpaceAction,
} from './actions'
import { RemoveCircleButton } from './remove-circle-button'

// The Channel Manage hub's body sections (ADR-870). Each is an async Server
// Component that fetches its own slice, so the page can stream them behind
// their own <Suspense> (PAGE-FRAMEWORK §5). The page already authorized the
// caller as staff (channel.manage); these only read, and every form posts to
// an action that re-checks the same capability.

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Home: the at-a-glance strip ───────────────────────────────────────────────

export async function ChannelHomeStrip({
  channelId,
  idOrSlug,
  isProgramChannel,
}: {
  channelId: string
  idOrSlug: string
  isProgramChannel: boolean
}) {
  const stats = await loadChannelHomeStats(channelId)
  const manage = `/channels/${idOrSlug}/manage`
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
      <div>
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">People</p>
        <div className="flex flex-wrap gap-1.5">
          <StatCard
            size="xs"
            icon={Users}
            label="Tuned in"
            value={stats.tunedIn.toLocaleString()}
            href={`${manage}?section=members`}
          />
        </div>
      </div>
      <div>
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Practice</p>
        <div className="flex flex-wrap gap-1.5">
          <StatCard
            size="xs"
            icon={CircleIcon}
            label={isProgramChannel ? 'Chapters' : 'Circles'}
            value={stats.circleCount.toLocaleString()}
            href={`${manage}?section=circles`}
          />
        </div>
      </div>
      <div>
        <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted">Conversation</p>
        <div className="flex flex-wrap gap-1.5">
          <StatCard
            size="xs"
            icon={MessageSquare}
            label="Forum posts"
            value={stats.postCount.toLocaleString()}
            href={`/channels/${idOrSlug}`}
          />
          {stats.roomMessages7d != null && (
            <StatCard
              size="xs"
              icon={Hash}
              label="Room messages"
              value={stats.roomMessages7d.toLocaleString()}
              detail="last 7 days"
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Quick links under the Home strip: the public page and the Program tab. */
export function ChannelQuickLinks({
  idOrSlug,
  isProgramChannel,
}: {
  idOrSlug: string
  isProgramChannel: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="secondary" size="sm">
        <Link href={`/channels/${idOrSlug}`}>
          <Radio className="h-3.5 w-3.5" aria-hidden /> View Channel page
        </Link>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <Link href={`/channels/${idOrSlug}/manage?section=program`}>
          <CircleIcon className="h-3.5 w-3.5" aria-hidden />
          {isProgramChannel ? 'Run the Program' : 'Make it a Program'}
        </Link>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <Link href={`/channels/${idOrSlug}/manage?section=settings`}>
          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit settings
        </Link>
      </Button>
    </div>
  )
}

// ── Members: everyone tuned in ────────────────────────────────────────────────

export async function MembersSection({ channelId }: { channelId: string }) {
  const members = await loadTunedInMembers(channelId)

  if (members.length === 0) {
    return (
      <EmptyState
        variant="first-use"
        title="Nobody tuned in yet"
        description="When members tune in to this Channel, they show up here newest first."
      />
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {members.map((m) => (
        <li key={m.profileId} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {m.handle ? (
              <Link
                href={`/people/${m.handle}`}
                className="block truncate font-medium text-text hover:underline"
              >
                {m.displayName}
              </Link>
            ) : (
              <span className="block truncate font-medium text-text">{m.displayName}</span>
            )}
            {m.handle && <span className="text-xs text-subtle">@{m.handle}</span>}
          </div>
          <span className="shrink-0 text-xs text-subtle">tuned in {fmtDate(m.joinedAt)}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Circles (Chapters on a Program) ──────────────────────────────────────────

const CIRCLE_STATUS_CHIP: Record<string, { Icon: typeof Check; cls: string; label: string }> = {
  active: { Icon: Check, cls: 'bg-success-bg text-success', label: 'Active' },
  forming: { Icon: Clock, cls: 'bg-primary-bg text-primary-strong', label: 'Forming' },
  draft: { Icon: Pencil, cls: 'bg-surface-elevated text-subtle', label: 'Draft' },
}

export async function CirclesSection({
  channelId,
  idOrSlug,
  isProgramChannel,
  notice,
}: {
  channelId: string
  idOrSlug: string
  isProgramChannel: boolean
  notice?: { saved?: boolean; error?: string }
}) {
  const [circles, assignable] = await Promise.all([
    loadChannelCircles(channelId),
    loadAssignableCircles(channelId),
  ])
  const noun = isProgramChannel ? 'Chapter' : 'Circle'

  const banner = notice?.error ? (
    <p className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-2.5 text-sm text-danger">
      {notice.error === 'missing'
        ? 'Pick a Circle first.'
        : notice.error === 'denied'
          ? 'You are not allowed to do that.'
          : notice.error === 'paused'
            ? 'This Channel is paused and not taking new Circles right now.'
            : 'That did not save. Try again.'}
    </p>
  ) : notice?.saved ? (
    <p className="rounded-xl border border-success/30 bg-success-bg px-4 py-2.5 text-sm text-success">
      Saved.
    </p>
  ) : null

  // Add an existing circle (ADR-871): the picker only offers real, live circles
  // not already here; the action re-gates channel.manage and the data layer
  // refuses a paused channel either way.
  const addForm = (
    <div className="rounded-2xl border border-border bg-surface p-5 lift-1">
      <SectionHeader title={`Add a ${noun}`} />
      <p className="mb-3 text-sm text-muted">
        Bring an existing Circle into this Channel. It keeps its host, members, and events; it
        starts practicing here.
      </p>
      {assignable.length === 0 ? (
        <p className="text-sm text-subtle">Every live Circle already practices somewhere here.</p>
      ) : (
        <form action={addChannelCircleAction.bind(null, channelId, idOrSlug)} className="space-y-3">
          <label className="block space-y-1">
            <span className={labelClasses}>Circle</span>
            <select name="circleId" required className={fieldClasses} defaultValue="">
              <option value="" disabled>
                Pick a Circle
              </option>
              {assignable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? ` (${c.city})` : ''} · {c.memberCount} members
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" size="sm">
            Add to Channel
          </Button>
        </form>
      )}
    </div>
  )

  if (circles.length === 0) {
    return (
      <div className="space-y-5">
        {banner}
        <EmptyState
          variant="first-use"
          title={`No ${noun}s yet`}
          description={
            isProgramChannel
              ? 'When someone starts a Chapter from the blueprint, it lands here.'
              : 'When a Circle starts practicing in this Channel, it lands here.'
          }
        />
        {addForm}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {banner}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-xs font-semibold text-subtle">{noun}</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-subtle">Status</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-subtle">Where</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-subtle">Members</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {circles.map((c) => {
              const chip = CIRCLE_STATUS_CHIP[c.status] ?? {
                Icon: CircleIcon,
                cls: 'bg-surface-elevated text-subtle',
                label: c.status,
              }
              return (
                <tr key={c.id} className="align-top">
                  <td className="px-4 py-2.5 font-medium text-text">
                    <Link href={`/circles/${c.slug}`} className="hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-2xs font-semibold ${chip.cls}`}
                    >
                      <chip.Icon className="h-3 w-3" aria-hidden />
                      {chip.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {c.type === 'online' ? 'Online' : c.city || 'In person'}
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {c.memberCount}
                    {c.memberCap > 0 && <span className="text-subtle"> / {c.memberCap}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RemoveCircleButton
                      circleName={c.name}
                      action={removeChannelCircleAction.bind(null, channelId, idOrSlug, c.id)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {addForm}
    </div>
  )
}

// ── Program: attach a blueprint, or run the one it has ──────────────────────

function ProgramCard({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-surface p-5 lift-1">{children}</div>
}

export async function ProgramSection({
  channelId,
  idOrSlug,
  notice,
}: {
  channelId: string
  idOrSlug: string
  notice?: { saved?: boolean; error?: string }
}) {
  const data = await loadProgramSection(channelId)
  if (!data) {
    return <EmptyState variant="error" title="Could not load the Program" description="Refresh to try again." />
  }

  const banner = notice?.error ? (
    <p className="rounded-xl border border-danger/30 bg-danger-bg px-4 py-2.5 text-sm text-danger">
      {notice.error === 'missing'
        ? 'Pick a source first.'
        : notice.error === 'denied'
          ? 'You are not allowed to do that.'
          : notice.error === 'owned'
            ? 'That Space already owns a Channel. A Space can own one Channel, so clear that one first.'
            : 'That did not save. Check the source and try again.'}
    </p>
  ) : notice?.saved ? (
    <p className="rounded-xl border border-success/30 bg-success-bg px-4 py-2.5 text-sm text-success">
      Saved.
    </p>
  ) : null

  // Who runs this Channel (ADR-871). Lives on the Program tab, not Settings:
  // owner_space_id is the Program model's "who runs it" column (ADR-864), and
  // Settings mounts the shared catalog module, which must not grow a
  // hub-only staff control (MENU-CONTRACT). Rendered in both blueprint states —
  // a plain focus area can be owned too.
  const ownerCard = (
    <ProgramCard>
      <SectionHeader title="Owner Space" />
      {data.ownerSpace ? (
        <>
          <p className="mb-3 text-sm text-muted">
            <Link href={`/spaces/${data.ownerSpace.slug}`} className="font-medium text-text hover:underline">
              {data.ownerSpace.name}
            </Link>{' '}
            runs this Channel. Clearing it hands the Channel back to Frequency; the Space keeps
            everything else it has.
          </p>
          <form action={clearChannelOwnerSpaceAction.bind(null, channelId, idOrSlug)}>
            <Button type="submit" variant="secondary" size="sm">
              Make it Frequency-run
            </Button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Frequency runs this Channel. Assign an owner Space to hand it to that Space&apos;s
            team. A Space can own one Channel.
          </p>
          <form
            action={setChannelOwnerSpaceAction.bind(null, channelId, idOrSlug)}
            className="space-y-3"
          >
            <label className="block space-y-1">
              <span className={labelClasses}>Space</span>
              <select name="spaceId" required className={fieldClasses} defaultValue="">
                <option value="" disabled>
                  Pick a Space
                </option>
                {data.spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm">
              Assign owner Space
            </Button>
          </form>
        </>
      )}
    </ProgramCard>
  )

  // ── No blueprint yet: the attach forms. ──
  if (!data.blueprint) {
    return (
      <div className="space-y-5">
        {banner}
        {ownerCard}
        <p className="max-w-2xl text-sm text-muted">
          A Program is a Channel with a Chapter blueprint attached. Members anywhere can start a
          Chapter from it: a local Circle running the same model. Pick where the blueprint comes
          from.
        </p>

        <ProgramCard>
          <SectionHeader title="Snapshot a live Circle" />
          <p className="mb-3 text-sm text-muted">
            Copies the Circle&apos;s setup (rhythm, agreements, format) into the blueprint. The
            Circle itself is untouched.
          </p>
          <form action={attachChannelProgramAction.bind(null, channelId, idOrSlug)} className="space-y-3">
            <input type="hidden" name="source" value="circle" />
            <label className="block space-y-1">
              <span className={labelClasses}>Circle</span>
              <select name="circleId" required className={fieldClasses} defaultValue="">
                <option value="" disabled>
                  Pick a Circle
                </option>
                {data.liveCircles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.city ? ` (${c.city})` : ''} · {c.memberCount} members
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm">
              Attach blueprint
            </Button>
          </form>
        </ProgramCard>

        <ProgramCard>
          <SectionHeader title="Clone a Starter Circle" />
          <p className="mb-3 text-sm text-muted">
            Makes this Program its own copy of a Starter from the catalog. The original Starter
            stays in the catalog, untouched.
          </p>
          <form action={attachChannelProgramAction.bind(null, channelId, idOrSlug)} className="space-y-3">
            <input type="hidden" name="source" value="starter" />
            <label className="block space-y-1">
              <span className={labelClasses}>Starter Circle</span>
              <select name="templateId" required className={fieldClasses} defaultValue="">
                <option value="" disabled>
                  Pick a Starter
                </option>
                {data.starters.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.oneLiner ? ` · ${t.oneLiner}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm">
              Attach blueprint
            </Button>
          </form>
        </ProgramCard>
      </div>
    )
  }

  // ── Has a blueprint: the run-the-Program controls (the staff ADR-869 set). ──
  return (
    <div className="space-y-5">
      {banner}
      <p className="max-w-2xl text-sm text-muted">
        This Channel runs a Program. The blueprint below is what every new Chapter starts from.
        {!data.channel.isActive && ' The Program is paused right now: the page is hidden and no new Chapters can start.'}
      </p>

      {ownerCard}

      <ProgramCard>
        <SectionHeader title="Name and one liner" />
        <p className="mb-3 text-sm text-muted">
          Edits the Channel and keeps the blueprint&apos;s card copy in step. The address never
          changes, so shared links keep working.
        </p>
        <form action={updateChannelProgramAction.bind(null, channelId, idOrSlug)} className="space-y-3">
          <label className="block space-y-1">
            <span className={labelClasses}>Name</span>
            <input name="name" defaultValue={data.channel.name} required maxLength={80} className={fieldClasses} />
          </label>
          <label className="block space-y-1">
            <span className={labelClasses}>One liner</span>
            <input
              name="oneLiner"
              defaultValue={data.channel.description ?? ''}
              required
              maxLength={200}
              className={fieldClasses}
            />
          </label>
          <Button type="submit" size="sm">
            Save copy
          </Button>
        </form>
      </ProgramCard>

      <ProgramCard>
        <SectionHeader title="Refresh the blueprint" />
        <p className="mb-3 text-sm text-muted">
          Re-snapshot from any live Circle. Existing Chapters keep the setup they started with;
          only future Chapters see the new one.
        </p>
        <form
          action={refreshChannelProgramBlueprintAction.bind(null, channelId, idOrSlug)}
          className="space-y-3"
        >
          <label className="block space-y-1">
            <span className={labelClasses}>Source Circle</span>
            <select name="sourceCircleId" required className={fieldClasses} defaultValue="">
              <option value="" disabled>
                Pick a Circle
              </option>
              {data.liveCircles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.city ? ` (${c.city})` : ''} · {c.memberCount} members
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Refresh blueprint
          </Button>
        </form>
      </ProgramCard>

      <ProgramCard>
        <SectionHeader title={data.channel.isActive ? 'Pause the Program' : 'Resume the Program'} />
        <p className="mb-3 text-sm text-muted">
          {data.channel.isActive
            ? 'Paused, the Channel page is hidden and no new Chapters can start. Members and Chapters keep everything they have. Resume is one click.'
            : 'Resuming brings the Channel page straight back and reopens Chapter starts.'}
        </p>
        <form
          action={setChannelProgramPausedAction.bind(null, channelId, idOrSlug, data.channel.isActive)}
        >
          <Button type="submit" variant="secondary" size="sm">
            {data.channel.isActive ? 'Pause Program' : 'Resume Program'}
          </Button>
        </form>
      </ProgramCard>

      <ProgramCard>
        <SectionHeader title="Detach the blueprint" />
        <p className="mb-3 text-sm text-muted">
          The Channel goes back to a plain focus area. The blueprint is retired (never listed as a
          Starter), and existing Chapters keep everything they have.
        </p>
        <form action={detachChannelProgramAction.bind(null, channelId, idOrSlug)}>
          <Button type="submit" variant="dangerOutline" size="sm">
            Detach blueprint
          </Button>
        </form>
      </ProgramCard>
    </div>
  )
}
