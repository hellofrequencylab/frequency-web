/**
 * Per-venue theming (docs/DESIGN.md §3.4). Maps a venue's `theme` string to a hue
 * so a room can re-color its whole Pulse accent (stage glow, primary, now-playing
 * ring) by setting one `--venue-h` on its container. Named themes get hand-picked
 * hues; anything else hashes deterministically so the same theme always looks the
 * same. No theme falls back to the brand violet.
 */
export const DEFAULT_VENUE_HUE = 300;

const NAMED_HUES: Record<string, number> = {
  synthwave: 320,
  vaporwave: 305,
  neon: 320,
  disco: 330,
  rave: 290,
  lofi: 250,
  "lo-fi": 250,
  chill: 210,
  ocean: 220,
  forest: 150,
  jungle: 145,
  sunset: 40,
  fire: 25,
  ember: 30,
  gold: 85,
  jazz: 55,
  retro: 35,
  "hip-hop": 30,
  hiphop: 30,
  classical: 270,
  midnight: 265,
};

export function venueHue(theme: string | null | undefined): number {
  if (!theme) return DEFAULT_VENUE_HUE;
  const key = theme.trim().toLowerCase();
  if (!key) return DEFAULT_VENUE_HUE;
  if (key in NAMED_HUES) return NAMED_HUES[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) % 360;
  }
  return h;
}
