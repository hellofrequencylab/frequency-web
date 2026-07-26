import { redirect } from 'next/navigation'

// Message Circle moved INTO the Manage hub (ADR-828 standardization): the message center now
// leads the hub's Home tab, so the old standalone /crm page just forwards there. The server
// actions the embedded viewer binds stay in ./actions (they carry their own circle.moderate
// gates). No gate needed here: the destination page gates (manage module or 404) and this
// route reveals nothing.

export default async function MessageCircleRedirect({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  redirect(`/circles/${slug}/manage`)
}
