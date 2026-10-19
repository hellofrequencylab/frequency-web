import Link from 'next/link'
import { FqIcon, type FqIconName } from '@/components/frequency/icon'

// THE EMPTY-SECTION NOTICE (LIVE-1023). A section with nothing to show says so in one short line and
// points at the next thing to do: make something, or go and look. It replaces the thin italic lines
// the Feed used to fall back to. Server-safe: links only, no state.

interface NoticeAction {
  href: string
  label: string
  /** The pastel pill. One per notice. */
  primary?: boolean
}

export function SystemNotice({
  icon,
  title,
  body,
  actions,
  className,
}: {
  icon: FqIconName
  title: string
  body?: string
  actions?: NoticeAction[]
  className?: string
}) {
  return (
    <div className={['fa-notice', className].filter(Boolean).join(' ')} role="status">
      <span className="fa-icav" aria-hidden>
        <FqIcon name={icon} />
      </span>
      <span className="fa-notice-txt">
        <b>{title}</b>
        {body && <span>{body}</span>}
      </span>
      {actions && actions.length > 0 && (
        <span className="fa-btns">
          {actions.map((a) => (
            <Link key={a.href + a.label} href={a.href} className={a.primary ? 'btn pa sm' : 'btn sm'}>
              {a.label}
            </Link>
          ))}
        </span>
      )}
    </div>
  )
}
