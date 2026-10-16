/** Null widths use the shell's asymmetric CSS defaults, including the server's first paint. */
export function decodeRailPreferences(raw: string | null) {
  const auto = { l: null, r: null, lc: null, rc: null }
  try {
    const saved: unknown = JSON.parse(raw || 'null')
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return auto
    const s = saved as Record<string, unknown>
    const width = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? Math.max(220, Math.min(320, v)) : null
    const collapsed = (v: unknown) => typeof v === 'boolean' ? v : null
    // A legacy shared width seeds the left; only an explicit right resize overrides its wider default.
    return { l: width(s.l ?? s.w), r: width(s.r), lc: collapsed(s.lc), rc: collapsed(s.rc) }
  } catch {
    return auto
  }
}
