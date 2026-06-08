import { Skeleton } from '@/components/ui/skeleton'

function MessageBubbleSkeleton({ align }: { align: 'left' | 'right' }) {
  const isRight = align === 'right'
  return (
    <div className={`flex items-end gap-2 ${isRight ? 'flex-row-reverse' : ''}`}>
      {!isRight && <Skeleton className="w-7 h-7 rounded-full shrink-0 mb-1" />}
      <div className={`space-y-1 max-w-[70%] ${isRight ? 'items-end' : 'items-start'} flex flex-col`}>
        <Skeleton className={`h-10 rounded-2xl ${isRight ? 'w-48' : 'w-56'}`} />
      </div>
    </div>
  )
}

export default function ConversationLoading() {
  return (
    <div className="-mx-6 -my-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <header className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-surface">
        <Skeleton className="w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </header>

      {/* Message thread area */}
      <div className="flex-1 overflow-hidden px-5 py-4 space-y-3">
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="left" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="right" />
        <MessageBubbleSkeleton align="left" />
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3">
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    </div>
  )
}
