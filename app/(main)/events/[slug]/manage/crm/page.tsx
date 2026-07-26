import { redirect } from 'next/navigation'

// Message Attendees moved INTO the Manage hub (Events manage overhaul): the message center now
// leads the hub's Home tab, so the old standalone /manage/crm page just forwards there. The
// server actions the embedded viewer binds stay in ./actions (they carry their own gates).
// No gate needed here: the destination page gates (host/cohost or 404) and this route reveals
// nothing.

export default async function MessageAttendeesRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/events/${slug}/manage`)
}
