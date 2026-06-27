import { AlertTriangle } from 'lucide-react'
import { readImpersonation } from '@/lib/impersonation'
import { getMyProfileId } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { stopActingAsMember } from '@/app/(main)/impersonate-actions'

// The unmissable bar shown while a janitor is acting as a member. It is the only way
// to know the session is borrowed — and the only Exit. Rendered at the very top of the
// app shell so it sits above everything.
export async function ImpersonationBanner() {
  const stash = await readImpersonation()
  if (!stash) return null

  const targetId = await getMyProfileId()
  let targetHandle = 'this member'
  if (targetId) {
    const { data } = await createAdminClient()
      .from('profiles')
      .select('handle')
      .eq('id', targetId)
      .maybeSingle()
    targetHandle = (data as { handle?: string } | null)?.handle ?? targetHandle
  }

  return (
    <div className="sticky top-0 z-[200] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-danger px-4 py-2 text-center text-sm font-semibold text-white shadow">
      <span className="inline-flex items-center gap-1.5">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        Acting as @{targetHandle}
        <span className="font-normal text-white/80">(you are {stash.actorHandle})</span>
      </span>
      <form action={stopActingAsMember}>
        <button
          type="submit"
          className="rounded-md bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white transition-colors hover:bg-white/30"
        >
          Exit
        </button>
      </form>
    </div>
  )
}
