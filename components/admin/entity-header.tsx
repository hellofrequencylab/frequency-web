import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

// Entity-detail context band (ADR-233 §3 Entity Detail, SLDS page-header + Geist).
// Identity + status + the key facts an operator needs at a glance + the primary
// actions, all above the fold. Facts render as a description (key/value) list, not a
// two-column table. Pair with <UnderlineTabs> for sibling views. Presentational.
//
//   <EntityHeader back={{href:'/admin/members', label:'Members'}} eyebrow="Member"
//     avatar={<Avatar .../>} title="Charlotte Proud"
//     badges={<StatusChip tone="success">Active</StatusChip>}
//     facts={[{label:'Circle', value:'MoFlow Encinitas'}, {label:'Joined', value:'Jun 7'}]}
//     actions={<Button>Message</Button>} />

export function EntityHeader({
  title,
  eyebrow,
  avatar,
  badges,
  facts,
  actions,
  back,
}: {
  title: React.ReactNode
  eyebrow?: React.ReactNode
  avatar?: React.ReactNode
  badges?: React.ReactNode
  facts?: { label: string; value: React.ReactNode }[]
  actions?: React.ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {avatar && <div className="shrink-0">{avatar}</div>}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-strong">{eyebrow}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-balance text-xl font-bold text-text sm:text-2xl">{title}</h1>
              {badges}
            </div>
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {facts && facts.length > 0 && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
          {facts.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{f.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-text">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
