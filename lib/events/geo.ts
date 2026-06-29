// Read a {lat,lng} point out of whatever PostgREST hands back for a PostGIS `geography`
// column. Depending on the PostGIS / PostgREST setup that is EITHER:
//   • a GeoJSON object  →  { type: 'Point', coordinates: [lng, lat] }
//   • an EWKB hex string →  "0101000020E6100000…"  (the default for a geography column here)
//
// The event detail page + the events index both store the venue as `events.geog`; the index map
// pins and the detail venue map read the point through THIS helper so a real geocoded event always
// plots, no matter the serialization. Returns null for anything it can't parse (no map, no crash).

export function pointFromGeog(geog: unknown): { lat: number; lng: number } | null {
  if (geog == null) return null

  // GeoJSON object form: { coordinates: [lng, lat] }.
  if (typeof geog === 'object') {
    const coords = (geog as { coordinates?: unknown }).coordinates
    if (Array.isArray(coords) && coords.length >= 2) {
      const lng = Number(coords[0])
      const lat = Number(coords[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }
    }
    return null
  }

  // EWKB / WKB hex string form.
  if (typeof geog === 'string') return pointFromEwkbHex(geog)

  return null
}

/**
 * Decode a 2D point from a (E)WKB hex string. Handles byte order (NDR/XDR) and an optional
 * embedded SRID (the 0x20000000 type flag PostGIS sets on a geography). Layout:
 *   [1 byte order][4 byte type][4 byte SRID?][8 byte X][8 byte Y]
 * X is longitude, Y is latitude. Returns null on any shape it doesn't recognise.
 */
function pointFromEwkbHex(hex: string): { lat: number; lng: number } | null {
  const clean = hex.trim()
  // Minimum non-SRID point: 1 + 4 + 8 + 8 = 21 bytes = 42 hex chars.
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0 || clean.length < 42) return null

  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  const dv = new DataView(bytes.buffer)

  // 0x01 = little-endian (NDR); 0x00 = big-endian (XDR).
  const little = dv.getUint8(0) === 1
  const type = dv.getUint32(1, little)
  const hasSrid = (type & 0x20000000) !== 0
  const offset = 5 + (hasSrid ? 4 : 0)
  if (bytes.length < offset + 16) return null

  const lng = dv.getFloat64(offset, little)
  const lat = dv.getFloat64(offset + 8, little)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  // Sanity: a real lat/lng. Guards against mis-parsing a non-point geometry.
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null

  return { lat, lng }
}
