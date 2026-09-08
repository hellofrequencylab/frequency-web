import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { MemberBlockProps } from '@/lib/entity-blocks/member-adapter'
import type { GuestbookEntry } from '@/lib/spotlight/guestbook.shared'
import { getHiddenGuestbookForOwner } from '@/lib/spotlight/guestbook'
import { getInitials } from '@/lib/utils'
import { avatarSrc, avatarFocusStyle } from '@/lib/images/avatar-focus'
import { GuestbookEntryControls, GuestbookSignForm } from '@/components/spotlight/guestbook-form'
import { MemberSection } from './section'

// GUESTBOOK — notes visitors leave on this member's Spotlight (PROG-SPOT, ADR-1132).
// DATA block: the entries are resolved SERVER-SIDE from the spotlight_guestbook table
// (lib/spotlight/guestbook.ts) with each signer's identity read from their own public
// profile, so nothing rendered here is spoofable except the note text itself, which is
// normalized + length-bounded and rendered through React's auto-escaping only.
//
// VIEWER-AWARE (an async RSC): one session read decides which tail the block shows —
// the sign form (a signed-in member who has not signed), "you signed" (they have),
// per-entry moderation controls plus the hidden-notes list with unhide (the owner,
// ADR-1279), a report control on other people's notes (any other member), or a sign-in
// line (signed out). Both pages
// that mount this block render dynamically, so the session read adds no static/dynamic
// tension. FAIL-SAFE: with no entries and no session the block still renders the empty
// line (an invitation is the point of a guestbook), and any auth error degrades to the
// signed-out view.

function whenLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function EntryRow({
  entry,
  ownerHandle,
  canModerate,
  isMine,
  signedIn,
  hidden = false,
}: {
  entry: GuestbookEntry
  ownerHandle: string
  canModerate: boolean
  isMine: boolean
  signedIn: boolean
  hidden?: boolean
}) {
  const name = entry.signerDisplayName || `@${entry.signerHandle}`
  return (
    <li className="rounded-control border border-border bg-surface p-4">
      <div className="flex items-center gap-3">
        <Link href={`/people/${entry.signerHandle}`} className="shrink-0">
          {entry.signerAvatarUrl ? (
            <Image
              src={avatarSrc(entry.signerAvatarUrl)}
              alt={name}
              width={40}
              height={40}
              className="h-10 w-10 rounded-pill object-cover"
              style={avatarFocusStyle(entry.signerAvatarUrl)}
            />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-pill bg-primary-bg text-body-sm font-bold text-primary-strong">
              {getInitials(name)}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={`/people/${entry.signerHandle}`}
            className="block truncate text-body-sm font-semibold text-text transition-colors hover:text-primary-strong"
          >
            {name}
          </Link>
          <span className="text-meta text-subtle">{whenLabel(entry.createdAt)}</span>
        </div>
        {signedIn && (
          <GuestbookEntryControls
            entryId={entry.id}
            ownerHandle={ownerHandle}
            canModerate={canModerate}
            isMine={isMine}
            hidden={hidden}
          />
        )}
      </div>
      <p className="mt-3 whitespace-pre-line text-pretty text-body-sm leading-relaxed text-text">
        {entry.message}
      </p>
    </li>
  )
}

export async function GuestbookBlock({ member, data }: MemberBlockProps) {
  const entries = data.guestbook
  const ownerHandle = member.slug
  const ownerName = member.displayName

  // One session read: who is looking? Fail-safe to the signed-out view.
  let viewerProfileId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: me } = await supabase
        .from('profiles')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      viewerProfileId = me?.id ?? null
    }
  } catch {
    viewerProfileId = null
  }

  const isOwner = viewerProfileId !== null && viewerProfileId === member.id
  const hasSigned =
    viewerProfileId !== null && entries.some((e) => e.signerProfileId === viewerProfileId)

  // The owner's hidden notes (ADR-1279): read only once the session says this IS the owner, so
  // the list never reaches a visitor. Best-effort, like the visible read.
  const hiddenEntries = isOwner ? await getHiddenGuestbookForOwner(member.id).catch(() => []) : []

  return (
    <MemberSection anchor="guestbook">
      <section>
        <h2 className="eyebrow mb-3 text-subtle">Guestbook</h2>

        {entries.length === 0 ? (
          <p className="text-body-sm text-muted">
            {isOwner
              ? 'No notes yet. Share your page and see who stops by.'
              : 'No notes yet. Be the first to sign.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                ownerHandle={ownerHandle}
                canModerate={isOwner}
                isMine={viewerProfileId !== null && entry.signerProfileId === viewerProfileId}
                signedIn={viewerProfileId !== null}
              />
            ))}
          </ul>
        )}

        {isOwner && hiddenEntries.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-body-sm font-semibold text-muted">
              Hidden notes ({hiddenEntries.length})
            </summary>
            <p className="mt-1 text-meta text-subtle">
              Only you can see these. A hidden note keeps its place, so the same person cannot sign again until you remove it.
            </p>
            <ul className="mt-3 space-y-3 opacity-80">
              {hiddenEntries.map((entry) => (
                <EntryRow
                  key={entry.id}
                  entry={entry}
                  ownerHandle={ownerHandle}
                  canModerate
                  isMine={false}
                  signedIn
                  hidden
                />
              ))}
            </ul>
          </details>
        )}

        {viewerProfileId === null ? (
          <p className="mt-4 text-body-sm text-muted">
            <Link href="/" className="font-semibold text-primary-strong transition-colors hover:underline">
              Sign in on Frequency
            </Link>{' '}
            to leave a note.
          </p>
        ) : isOwner ? null : hasSigned ? (
          <p className="mt-4 text-meta text-subtle">You signed this guestbook.</p>
        ) : (
          <GuestbookSignForm ownerHandle={ownerHandle} ownerName={ownerName} />
        )}
      </section>
    </MemberSection>
  )
}
