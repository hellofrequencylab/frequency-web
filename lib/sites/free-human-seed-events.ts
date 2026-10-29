// THE FREE HUMAN MOVEMENT SPACE'S YEAR OF GATHERINGS: the design's own sample events (handoff events.free-human.json), in the shape the events
// table takes. starts_at and ends_at hold the host's wall clock as UTC parts in America/Los_Angeles, as every Space event does. Dates are
// sample content and the moon dates are approximate. Prices in the design are left out: a Space sets its own.

interface FreeHumanSeedEvent {
  id: string
  title: string
  startsAt: string
  endsAt: string
  mode: 'online' | 'in_person'
  recurrence: 'none' | 'weekly'
  rule: string | null
  until: string | null
  summary: string
}

export const FREE_HUMAN_SEED_EVENTS: readonly FreeHumanSeedEvent[] = [
  { id: 'autumn-circle', title: 'Thursday circle', startsAt: '2026-11-05T19:00:00+00', endsAt: '2026-11-05T20:15:00+00', mode: 'online', recurrence: 'weekly', rule: 'FREQ=WEEKLY;BYDAY=TH', until: '2027-10-28T23:59:00+00', summary: 'Live movement and conversation with women in the same season. Cameras optional, nursing welcome.' },
  { id: 'breath-for-birth-nov', title: 'Breath for birth', startsAt: '2026-11-15T10:00:00+00', endsAt: '2026-11-15T13:00:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'Breath and sound for the last trimester. Partners welcome.' },
  { id: 'full-moon-nov', title: 'Full moon gathering', startsAt: '2026-11-24T18:00:00+00', endsAt: '2026-11-24T21:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Song, fire and a shared meal under the full moon.' },
  { id: 'mother-anger-held', title: 'Mother anger, held', startsAt: '2026-11-22T14:00:00+00', endsAt: '2026-11-22T17:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'What rage is asking for, and how to move it through the body with care.' },
  { id: 'floor-play-dec', title: 'Floor play with littles', startsAt: '2026-12-05T10:00:00+00', endsAt: '2026-12-05T11:30:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Bring your children. We move, build and rest together on the floor.' },
  { id: 'solstice-retreat', title: 'Winter solstice retreat', startsAt: '2026-12-19T15:00:00+00', endsAt: '2026-12-21T12:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Three days of rest, fire and the longest night. Childcare held.' },
  { id: 'full-moon-dec', title: 'Cold moon gathering', startsAt: '2026-12-23T18:00:00+00', endsAt: '2026-12-23T20:30:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'A quiet hour of song and intention before the turn of the year.' },
  { id: 'winter-rest', title: 'Winter season opens: Rest', startsAt: '2027-01-10T09:00:00+00', endsAt: '2027-01-10T10:00:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'The winter module begins: yoga nidra, slow mornings, the art of doing less.' },
  { id: 'full-moon-jan', title: 'Wolf moon gathering', startsAt: '2027-01-22T18:00:00+00', endsAt: '2027-01-22T20:30:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Song, fire and a shared meal.' },
  { id: 'imbolc', title: 'Imbolc candle evening', startsAt: '2027-02-01T18:30:00+00', endsAt: '2027-02-01T20:30:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Candles, honey cake and the first stirrings of spring.' },
  { id: 'postpartum-restoration', title: 'Postpartum restoration', startsAt: '2027-02-13T10:00:00+00', endsAt: '2027-02-13T13:00:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'Gentle floor work for the first year after birth. Bring the baby.' },
  { id: 'full-moon-feb', title: 'Snow moon gathering', startsAt: '2027-02-20T18:00:00+00', endsAt: '2027-02-20T20:30:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'An online circle under the snow moon.' },
  { id: 'spring-equinox', title: 'Spring equinox: Embody opens', startsAt: '2027-03-20T10:00:00+00', endsAt: '2027-03-20T12:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'The spring module begins with a morning of movement in the garden.' },
  { id: 'full-moon-mar', title: 'Worm moon gathering', startsAt: '2027-03-22T18:30:00+00', endsAt: '2027-03-22T21:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Song, fire and a shared meal.' },
  { id: 'defying-men-launch', title: 'Defying Men: book launch', startsAt: '2027-04-08T19:00:00+00', endsAt: '2027-04-08T21:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Audrey reads from Defying Men, with conversation and signing.' },
  { id: 'spring-retreat', title: 'Spring retreat by the sea', startsAt: '2027-04-23T15:00:00+00', endsAt: '2027-04-25T12:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Three days of movement, ocean and rest. Childcare held.' },
  { id: 'beltane', title: 'Beltane family day', startsAt: '2027-05-01T11:00:00+00', endsAt: '2027-05-01T15:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Ribbons, flowers and a long lunch. Children lead the dance.' },
  { id: 'full-moon-may', title: 'Flower moon gathering', startsAt: '2027-05-20T19:00:00+00', endsAt: '2027-05-20T21:30:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Song, fire and a shared meal.' },
  { id: 'summer-solstice', title: 'Summer solstice: Create opens', startsAt: '2027-06-21T05:45:00+00', endsAt: '2027-06-21T08:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Sunrise movement on the longest day. The summer module begins.' },
  { id: 'beyond-the-wild-reading', title: 'Beyond The Wild: a reading for parents', startsAt: '2027-06-12T10:30:00+00', endsAt: '2027-06-12T12:00:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'Audrey reads from Beyond The Wild and answers questions from parents.' },
  { id: 'family-camp', title: 'Summer family camp', startsAt: '2027-07-16T14:00:00+00', endsAt: '2027-07-19T11:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Four days of play, river and fire for mothers and their children.' },
  { id: 'lammas', title: 'Lammas bread and honey supper', startsAt: '2027-08-01T18:00:00+00', endsAt: '2027-08-01T21:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'The first harvest, shared at a long table.' },
  { id: 'full-moon-aug', title: 'Sturgeon moon gathering', startsAt: '2027-08-17T19:00:00+00', endsAt: '2027-08-17T21:30:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'Song, fire and a shared meal.' },
  { id: 'autumn-equinox', title: 'Autumn equinox: Raise opens', startsAt: '2027-09-23T10:00:00+00', endsAt: '2027-09-23T12:00:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'The autumn module begins with a harvest circle.' },
  { id: 'breath-for-birth-oct', title: 'Breath for birth', startsAt: '2027-10-09T10:00:00+00', endsAt: '2027-10-09T13:00:00+00', mode: 'online', recurrence: 'none', rule: null, until: null, summary: 'Breath and sound for the last trimester. Partners welcome.' },
  { id: 'samhain', title: 'Samhain: the women before us', startsAt: '2027-10-31T18:00:00+00', endsAt: '2027-10-31T20:30:00+00', mode: 'in_person', recurrence: 'none', rule: null, until: null, summary: 'An evening for our mothers and grandmothers. Bring a photograph.' },
]
