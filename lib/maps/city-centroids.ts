// Approximate city centroids [lat, lng] for the founding metro (San Diego / North County).
//
// PRIVACY: a public surface that knows only an event's or a Space's CITY pins it here, never at a
// venue. Cities not listed are still counted, just not plotted. Pure data, so a page can read it
// without pulling a map engine or a database client into its bundle.
const CITY_CENTROIDS: Record<string, [number, number]> = {
  'Encinitas': [33.0370, -117.2920],
  'Carlsbad': [33.1581, -117.3506],
  'Oceanside': [33.1959, -117.3795],
  'Vista': [33.2000, -117.2425],
  'San Marcos': [33.1434, -117.1661],
  'Escondido': [33.1192, -117.0864],
  'Solana Beach': [32.9912, -117.2712],
  'Del Mar': [32.9595, -117.2653],
  'Cardiff': [33.0203, -117.2786],
  'Cardiff-by-the-Sea': [33.0203, -117.2786],
  'Leucadia': [33.0686, -117.2986],
  'Rancho Santa Fe': [33.0214, -117.2025],
  'Carmel Valley': [32.9462, -117.2235],
  'Fallbrook': [33.3764, -117.2511],
  'Poway': [32.9628, -117.0359],
  'La Jolla': [32.8328, -117.2713],
  'San Diego': [32.7157, -117.1611],
}

/** [lat, lng] of a known city (case-insensitive), or null. */
export function cityCentroid(city: string | null | undefined): [number, number] | null {
  const name = city?.trim().toLowerCase()
  if (!name) return null
  const key = Object.keys(CITY_CENTROIDS).find((k) => k.toLowerCase() === name)
  return key ? CITY_CENTROIDS[key] : null
}
