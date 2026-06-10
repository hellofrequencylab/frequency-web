// The scripted spotlight tour (ADR-047 onboarding). A short, guided walk that dims
// the page and highlights one real surface at a time, narrated in Vera's voice
// (cool register, same as lib/onboarding/tips.ts). Pure data so the stops stay easy
// to tune. The SpotlightTour component renders these; the FeedOnboardingGuide
// launches and resumes it. Each stop points at a `data-tour-anchor` element — when
// that element isn't on screen (e.g. the sidebar nav on a small viewport, where it
// lives in a drawer), the card simply centers and still narrates the step.

export interface SpotlightStop {
  /** `data-tour-anchor` value to spotlight. Absent → a centered, un-anchored card. */
  anchor?: string
  /** Short, bold headline for the step. */
  title: string
  /** One or two inviting lines under it, in Vera's voice. */
  body: string
}

export const SPOTLIGHT_STOPS: SpotlightStop[] = [
  {
    anchor: 'content',
    title: 'This is home.',
    body: "Everything your circles are up to lands here: posts, events, the practices people keep. It stays quiet until you join a few, so let me show you around.",
  },
  {
    anchor: 'composer',
    title: 'Say something.',
    body: 'This is where you post. A first hello is the easiest way in. No one expects anything polished.',
  },
  {
    anchor: 'nav-circles',
    title: 'Find your people.',
    body: "Circles are small groups around one shared thing. Joining one is the move that makes this place come alive.",
  },
  {
    anchor: 'nav-practices',
    title: 'Pick a small thing.',
    body: 'A practice is a recurring ritual you do with your circle (a walk, a sit, a check-in). It becomes your reason to keep coming back.',
  },
  {
    anchor: 'nav-events',
    title: 'Show up in person.',
    body: "Gatherings near you live here. Turning up once is worth a hundred scrolls. It's where the real thing happens.",
  },
  {
    anchor: 'avatar',
    title: 'Make it yours.',
    body: "Add a photo and a line about you so people recognize you. That's it, you're set up. The rest is just showing up.",
  },
]
