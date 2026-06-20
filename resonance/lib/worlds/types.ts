/**
 * Cross-world discovery types (build plan §18). A read-only aggregation surface
 * that spans ALL worlds; per-world surfaces (lobby, events) stay scoped.
 */

export interface World {
  id: string;
  name: string;
  slug: string;
}

/** A world plus its live activity, for the "happening now" feed. */
export interface WorldActivity {
  world: World;
  /** Venues with a playing room or a fresh presence ping. */
  liveVenues: number;
  /** Distinct users seen across the world's venues in the last 45s. */
  hereNow: number;
  /** Up to 3 nearest future events. */
  upcoming: { id: string; title: string; startsAt: string }[];
}

export interface DiscoverFeed {
  worlds: WorldActivity[];
}
