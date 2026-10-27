// THE "WHO'S GOING" LINE under a meetup (Circle page, Meetups panel). Pure, so the grammar is pinned
// by a unit test: name the listed people, add "and N other(s)" only when a remainder is left,
// singular at one, and lead with "You" when the viewer is going.

interface GoingLineInput {
  /** First names (or short names) of up to a few going people, the viewer excluded. */
  names: readonly string[]
  /** Everyone going, the viewer excluded. */
  total: number
  /** The viewer is going. */
  you: boolean
}

const NAMES_SHOWN = 2

export function goingLine({ names, total, you }: GoingLineInput): string {
  const shown = names.slice(0, NAMES_SHOWN)
  const people = [...(you ? ['You'] : []), ...shown]
  const rest = Math.max(0, total - shown.length)
  const all = people.length + rest
  if (all === 0) return ''
  const verb = people.length === 1 && rest === 0 && !you ? 'is going' : 'going'
  const lead = people
  let head: string
  if (rest > 0) {
    head = `${lead.join(', ')}${lead.length ? ' ' : ''}and ${rest} ${rest === 1 ? 'other' : 'others'}`
    if (lead.length === 0) head = `${rest} ${rest === 1 ? 'person' : 'people'}`
  } else if (lead.length > 1) {
    head = `${lead.slice(0, -1).join(', ')} and ${lead[lead.length - 1]}`
  } else {
    head = lead[0]
  }
  return `${head} ${verb}`
}
