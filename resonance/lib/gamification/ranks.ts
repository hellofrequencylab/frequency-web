/**
 * The Field ranks (spec §9). Pure thresholds: dj_points -> rank. Tunable; the
 * progression is Crew -> Deshi -> Sempai -> Sensei -> Sifu -> Bodhisattva.
 */
export const RANKS = [
  { name: "Crew", min: 0 },
  { name: "Deshi", min: 10 },
  { name: "Sempai", min: 25 },
  { name: "Sensei", min: 50 },
  { name: "Sifu", min: 100 },
  { name: "Bodhisattva", min: 200 },
] as const;

export type RankName = (typeof RANKS)[number]["name"];

/** Highest rank whose threshold the points have reached. */
export function rankForPoints(points: number): RankName {
  let current: RankName = RANKS[0].name;
  for (const r of RANKS) {
    if (points >= r.min) current = r.name;
  }
  return current;
}

/** The next rank and how many points remain, or null at the top. */
export function nextRank(
  points: number,
): { name: RankName; remaining: number } | null {
  for (const r of RANKS) {
    if (points < r.min) return { name: r.name, remaining: r.min - points };
  }
  return null;
}
