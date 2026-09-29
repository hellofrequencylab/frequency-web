// THE WORDS A SHARED PLAN SENDS (PROG-CAL7 Together, LIVE-545), the pure half. Three moments
// reach the other team through their own preferences: a share offered or answered, a comment on
// the Plan or a to-do, a to-do handed over. Nothing here does IO; lib/calendar/plan-notify.ts
// resolves who and routes. Camp counselor: plain, who and what, no exclamation, no long dash.

export type PlanShareMoment = 'requested' | 'accepted' | 'declined'

interface PlanMomentCopy {
  title: string
  body: string
}

/** A share offered or answered, as the other Space's approvers read it. */
export function planShareCopy(moment: PlanShareMoment, otherSpaceName: string, planTitle: string): PlanMomentCopy {
  switch (moment) {
    case 'requested':
      return { title: `${otherSpaceName} wants to work a Plan with you`, body: `"${planTitle}". Say yes or no from your calendar settings.` }
    case 'accepted':
      return { title: `${otherSpaceName} said yes`, body: `You are working "${planTitle}" together now.` }
    case 'declined':
      return { title: `${otherSpaceName} passed`, body: `Not "${planTitle}", not this time. You can offer it again later.` }
  }
}

/** A comment on the Plan or under one of its to-dos, as the other team reads it. */
export function planCommentCopy(authorName: string, planTitle: string, onTodo: string | null, body: string): PlanMomentCopy {
  const where = onTodo ? `on "${onTodo}" in "${planTitle}"` : `on "${planTitle}"`
  return { title: `${authorName} ${where}`, body: excerpt(body) }
}

/** A to-do handed to the recipient. */
export function planAssignCopy(actorName: string, todoTitle: string, planTitle: string): PlanMomentCopy {
  return { title: `${actorName} handed you a to-do`, body: `"${todoTitle}" on "${planTitle}".` }
}

/** The first line of a comment, short enough for a lock screen. */
export function excerpt(body: string, max = 120): string {
  const line = body.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** Everyone but the person who did the thing, once each. The actor never hears about their own act. */
export function recipientsWithoutActor(profileIds: readonly string[], actorProfileId: string): string[] {
  return [...new Set(profileIds.filter((id) => id && id !== actorProfileId))]
}

/** The site-relative path a recipient opens: their own Space's calendar settings. */
export function calendarSettingsPath(slug: string): string {
  return `/spaces/${slug}/settings/calendar`
}
