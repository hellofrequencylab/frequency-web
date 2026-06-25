import Link from 'next/link'
import { ClipboardList, GraduationCap, BookOpen, ArrowUpRight } from 'lucide-react'
import { getCallerProfile } from '@/lib/auth'
import { SectionHeader } from '@/components/ui/section-header'

// Leadership dashboard layout module (/lead, per-route module engine): the "Leadership
// tools" block, lifted verbatim from the page so it can be reordered or hidden on its own
// from Settings → Layout. The three links are the volunteer leader's standing toolbox
// (crew tasks, the leader guide library, role advancement training), so this block ALWAYS
// renders for a signed-in leader — it is never empty. Self-fetching RSC; renders nothing
// only when there is no viewer.
export async function LeadTools(): Promise<React.ReactElement | null> {
  const me = await getCallerProfile()
  if (!me) return null

  return (
    <section>
      <SectionHeader title="Leadership tools" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ToolCard
          href="/lead/crew-tasks"
          Icon={ClipboardList}
          title="Crew tasks"
          desc="Internal volunteer tasks that support your circles. Create them, see who claimed what, and release a stalled claim."
        />
        <ToolCard
          href="/lead/training-library"
          Icon={BookOpen}
          title="Leader Training"
          desc="The guide library for running a Circle and authoring a Journey. Read these before you build."
        />
        <ToolCard
          href="/training"
          Icon={GraduationCap}
          title="Role training"
          desc="The advancement curriculum for your role. Materials to start and run a circle well."
        />
      </div>
    </section>
  )
}

function ToolCard({
  href,
  Icon,
  title,
  desc,
}: {
  href: string
  Icon: typeof ClipboardList
  title: string
  desc: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-elevated motion-reduce:transition-none"
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-bg text-primary-strong">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold text-text">
          {title}
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>
      </span>
    </Link>
  )
}
