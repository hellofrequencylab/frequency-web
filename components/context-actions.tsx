'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Link from 'next/link'
import {
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
  Pencil,
  XCircle,
  RotateCcw,
  EyeOff,
  Archive,
  Link2,
  CalendarPlus,
  Megaphone,
  Flag,
} from 'lucide-react'
import { ReportDialog } from '@/components/report-dialog'
import { deletePost, pinPost, unpinPost } from '@/app/(main)/feed/actions'
import { toggleCancelEvent } from '@/app/(main)/admin/actions'
import {
  unpublishDispatch,
  deleteDispatch,
  archiveChannel,
  deleteCrewTask,
} from '@/app/(main)/admin/actions'

type CommunityRole = 'member' | 'crew' | 'host' | 'guide' | 'mentor' | 'admin' | 'janitor'

type PostContext = { type: 'post'; id: string; isPinned: boolean; isOwn: boolean; postType: string }
type EventContext = { type: 'event'; id: string; slug: string; isHost: boolean; isCancelled: boolean }
type DispatchContext = { type: 'dispatch'; id: string; isAuthor: boolean }
type CircleContext = { type: 'circle'; id: string; slug: string; isHost: boolean }
type ChannelContext = { type: 'channel'; id: string; isCreator: boolean }
type CrewTaskContext = { type: 'crew_task'; id: string }
type MemberContext = { type: 'member'; id: string; isOwn: boolean }

type ContextActionsProps = {
  role: CommunityRole
  context:
    | PostContext
    | EventContext
    | DispatchContext
    | CircleContext
    | ChannelContext
    | CrewTaskContext
    | MemberContext
}

const HOST_PLUS: CommunityRole[] = ['host', 'guide', 'mentor', 'admin', 'janitor']

function isHostPlus(role: CommunityRole) {
  return HOST_PLUS.includes(role)
}

type ActionItem = {
  key: string
  label: string
  icon: React.ReactNode
  destructive?: boolean
} & (
  | { kind: 'action'; onAction: () => void }
  | { kind: 'link'; href: string }
)

// Determine the reportable target type and whether reporting is available
function getReportTarget(context: ContextActionsProps['context']): { targetType: 'post' | 'dispatch' | 'comment' | 'member' | 'event'; targetId: string } | null {
  switch (context.type) {
    case 'post':
      if (!context.isOwn) return { targetType: 'post', targetId: context.id }
      return null
    case 'dispatch':
      if (!context.isAuthor) return { targetType: 'dispatch', targetId: context.id }
      return null
    case 'member':
      if (!context.isOwn) return { targetType: 'member', targetId: context.id }
      return null
    default:
      return null
  }
}

export function ContextActions({ role, context }: ContextActionsProps) {
  const [open, setOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const reportTarget = getReportTarget(context)
  const actions = buildActions(role, context, startTransition)

  // Add report action for non-owner posts, dispatches, and members
  if (reportTarget) {
    actions.push({
      key: 'report',
      label: 'Report',
      icon: <Flag className="w-3.5 h-3.5" />,
      kind: 'action',
      onAction: () => {
        setOpen(false)
        setReportOpen(true)
      },
    })
  }

  if (actions.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="More actions"
        disabled={isPending}
        className="p-1.5 rounded-md text-subtle hover:text-text hover:bg-surface-elevated transition-colors disabled:opacity-50"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 min-w-[180px] rounded-2xl border border-border bg-surface shadow-lg z-50 overflow-hidden py-1">
          {actions.map((action) =>
            action.kind === 'link' ? (
              <Link
                key={action.key}
                href={action.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-surface-elevated ${
                  action.destructive
                    ? 'text-danger'
                    : 'text-text'
                }`}
              >
                {action.icon}
                {action.label}
              </Link>
            ) : (
              <button
                key={action.key}
                onClick={() => {
                  action.onAction()
                  setOpen(false)
                }}
                disabled={isPending}
                className={`flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors hover:bg-surface-elevated w-full text-left disabled:opacity-50 ${
                  action.destructive
                    ? 'text-danger'
                    : 'text-text'
                }`}
              >
                {action.icon}
                {action.label}
              </button>
            ),
          )}
        </div>
      )}

      {/* Report dialog */}
      {reportTarget && (
        <ReportDialog
          targetType={reportTarget.targetType}
          targetId={reportTarget.targetId}
          open={reportOpen}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  )
}

function buildActions(
  role: CommunityRole,
  context: ContextActionsProps['context'],
  startTransition: (fn: () => void) => void,
): ActionItem[] {
  const items: ActionItem[] = []
  const iconCls = 'w-3.5 h-3.5'

  switch (context.type) {
    case 'post': {
      // Host+: Pin/Unpin toggle
      if (isHostPlus(role)) {
        if (context.isPinned) {
          items.push({
            key: 'unpin',
            label: 'Unpin post',
            icon: <PinOff className={iconCls} />,
            kind: 'action',
            onAction: () => startTransition(() => { unpinPost(context.id) }),
          })
        } else {
          items.push({
            key: 'pin',
            label: 'Pin post',
            icon: <Pin className={iconCls} />,
            kind: 'action',
            onAction: () => startTransition(() => { pinPost(context.id) }),
          })
        }
      }
      // Owner or Host+: Delete post
      if (context.isOwn || isHostPlus(role)) {
        items.push({
          key: 'delete',
          label: 'Delete post',
          icon: <Trash2 className={iconCls} />,
          destructive: true,
          kind: 'action',
          onAction: () => startTransition(() => { deletePost(context.id) }),
        })
      }
      break
    }

    case 'event': {
      if (isHostPlus(role)) {
        items.push({
          key: 'edit',
          label: 'Edit event',
          icon: <Pencil className={iconCls} />,
          kind: 'link',
          href: `/events/${context.slug}?edit=true`,
        })
        if (context.isCancelled) {
          items.push({
            key: 'uncancel',
            label: 'Reinstate event',
            icon: <RotateCcw className={iconCls} />,
            kind: 'action',
            onAction: () => startTransition(() => { toggleCancelEvent(context.id, false) }),
          })
        } else {
          items.push({
            key: 'cancel',
            label: 'Cancel event',
            icon: <XCircle className={iconCls} />,
            destructive: true,
            kind: 'action',
            onAction: () => startTransition(() => { toggleCancelEvent(context.id, true) }),
          })
        }
      }
      break
    }

    case 'dispatch': {
      if (context.isAuthor || isHostPlus(role)) {
        items.push({
          key: 'edit',
          label: 'Edit dispatch',
          icon: <Pencil className={iconCls} />,
          kind: 'link',
          href: `/broadcast/${context.id}?edit=true`,
        })
        items.push({
          key: 'unpublish',
          label: 'Unpublish',
          icon: <EyeOff className={iconCls} />,
          kind: 'action',
          onAction: () => startTransition(() => { unpublishDispatch(context.id) }),
        })
        items.push({
          key: 'delete',
          label: 'Delete dispatch',
          icon: <Trash2 className={iconCls} />,
          destructive: true,
          kind: 'action',
          onAction: () => startTransition(() => { deleteDispatch(context.id) }),
        })
      }
      break
    }

    case 'circle': {
      if (isHostPlus(role)) {
        items.push({
          key: 'edit',
          label: 'Edit circle info',
          icon: <Pencil className={iconCls} />,
          kind: 'link',
          href: `/circles/${context.slug}?edit=true`,
        })
        items.push({
          key: 'invite',
          label: 'Generate invite link',
          icon: <Link2 className={iconCls} />,
          kind: 'link',
          href: `/circles/${context.slug}?invite=true`,
        })
        items.push({
          key: 'create-event',
          label: 'Create event',
          icon: <CalendarPlus className={iconCls} />,
          kind: 'link',
          href: `/events/new?circle=${context.id}`,
        })
        items.push({
          key: 'announce',
          label: 'Create announcement',
          icon: <Megaphone className={iconCls} />,
          kind: 'link',
          href: `/broadcast?compose=true&scope=${context.id}`,
        })
      }
      break
    }

    case 'channel': {
      if (context.isCreator || isHostPlus(role)) {
        items.push({
          key: 'archive',
          label: 'Archive channel',
          icon: <Archive className={iconCls} />,
          destructive: true,
          kind: 'action',
          onAction: () => startTransition(() => { archiveChannel(context.id) }),
        })
      }
      break
    }

    case 'crew_task': {
      if (isHostPlus(role)) {
        items.push({
          key: 'delete',
          label: 'Delete task',
          icon: <Trash2 className={iconCls} />,
          destructive: true,
          kind: 'action',
          onAction: () => startTransition(() => { deleteCrewTask(context.id) }),
        })
      }
      break
    }
  }

  return items
}
