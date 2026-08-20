import Link from 'next/link'
import { QrCode, ChartNoAxesColumn } from 'lucide-react'
import { requireAdmin } from '@/lib/admin/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { AdminTemplate } from '@/components/templates'
import { buttonClasses } from '@/components/ui/button'
import { nodeUrl, shortLinkUrl } from '@/lib/qr/links'
import { renderStyledQrSvg } from '@/lib/qr/render-styled'
import { parseStyle, withMemberAvatar } from '@/lib/qr/style'
import { parseVcard } from '@/lib/vcard'
import { scanSummaryFromRpc, type QrStatsRpcPayload } from '@/lib/qr/analytics'
import { resolveQrStudio } from '@/lib/elements/qr-studio'
import { QrStudioDashboard } from './qr-studio-dashboard'
import type { StudioNode } from './qr-studio'
import type { StudioLink, NodeOption, PickOption } from './dynamic-links'
import type { AnalyticsData } from './analytics'
import type { CampaignCard, CampaignCodeOption } from './campaigns'
import type { MemberProfileCode } from './member-profile-codes'
import type { MarketingCodeAdmin } from './marketing-codes-admin'

export const dynamic = 'force-dynamic'

// QR Studio — the home for everything codes. Three tabs:
//   • Check-in codes — physical `nodes` that earn (verify → ledger → zaps)
//   • Dynamic links  — retargetable /q/<slug> codes (redirect to a URL or a node)
//   • Analytics      — scan totals + per-code performance from `qr_scans`
// All QR images are rendered server-side here and handed down as SVG strings.
export default async function QrStudioPage() {
  // GATE (aligned 2026-08-10): the catalog resolved this to 'admin' + qr and the pages never
  // followed, so the two disagreed about a decision `lib/nav/studio.ts` records as already made.
  // 'host' reads the COMMUNITY ladder (ADR-208), so it admitted anyone who cleared the /admin
  // staff floor in some OTHER domain and happened to be a host — a structure-domain staffer with
  // QR Studio. 'admin' reads the STAFF axis. A real qr-domain operator still passes on the
  // `staff` branch; only the cross-domain host loses access, which is the point.
  const caller = await requireAdmin('admin', { staff: 'qr' })
  const db = createAdminClient()

  // The qr-studio ELEMENT config (LIVE-066, mirrors the header pages' resolveHeaderElement call):
  // which design control groups THIS operator may use in every StyleEditor below. Resolved once at
  // the mount and threaded down as props; fail-safe to the full config.
  const qrConfig = await resolveQrStudio({
    viewer: { communityRole: caller.role, webRole: caller.webRole },
  })

  // Three whole-table reads used to live here and none of them needed to (ADR-969):
  //   · `captures` was read in full to count rows per node. It grows with every verified check-in
  //     the community ever makes, and PostgREST caps a response at max_rows (1,000), so past that
  //     the count was silently WRONG as well as slow. Now `node_capture_counts()` groups in the DB.
  //   · `qr_scans` was read in full to build the same aggregates the /admin/qr/stats page already
  //     gets from `qr_stats_summary`. Same RPC, same rehydration, identical numbers: the RPC's
  //     totals / per_code are lifetime (no date filter) and `daily` is the trailing 30 UTC buckets,
  //     which is exactly what summarizeScans(scans, 30) produced.
  //   · `qr_codes` was read TWICE, the second time only for `page_path`. It is one selection.
  const [
    { data: nodes },
    { data: captureRows },
    { data: links },
    { data: statsPayload },
    { data: partners },
  ] = await Promise.all([
    db
      .from('nodes')
      .select('id, type, label, zaps_value, capture_rule, active, city, valid_until, partner_id, style, max_claims, secret, created_at')
      .order('created_at', { ascending: false }),
    db.rpc('node_capture_counts'),
    db
      .from('qr_codes')
      .select('id, slug, title, destination_type, target_url, alt_target_url, switch_at, node_id, circle_id, event_id, partner_id, active, valid_until, scan_count, style, purpose, owner_profile_id, source_tag, created_at, page_path')
      .order('created_at', { ascending: false }),
    db.rpc('qr_stats_summary', { p_days: 30 }),
    db.from('partners').select('id, name').order('name'),
  ])

  // Per-page folder key (ADR-179), now selected with the rest of the row rather than in a second
  // pass. `page_path` is still absent from the generated DB types, so it is read off the row
  // through a narrow cast instead of an untyped second client.
  const pagePathById = new Map<string, string | null>(
    ((links ?? []) as Array<{ id: string; page_path?: string | null }>).map((r) => [
      r.id,
      r.page_path ?? null,
    ]),
  )

  // ── Check-in codes (nodes) ──────────────────────────────────────────────────
  const captureCounts = new Map<string, number>(
    (captureRows ?? []).map((r) => [r.node_id, r.captures]),
  )

  // Geofences (location-aware earning) — coords + radius per node, read via RPC
  // (the geography column can't be selected as lat/lng through PostgREST).
  const { data: geoRows } = await db.rpc('nodes_geo')
  const geoByNode = new Map((geoRows ?? []).map((g) => [g.id, g]))

  const initialNodes: StudioNode[] = await Promise.all(
    (nodes ?? []).map(async (n) => {
      const url = nodeUrl(n.id, n.secret)
      const style = parseStyle(n.style)
      return {
        id: n.id,
        type: n.type,
        label: n.label,
        zaps_value: n.zaps_value,
        capture_rule: n.capture_rule,
        active: n.active,
        city: n.city,
        valid_until: n.valid_until,
        partner_id: n.partner_id,
        lat: geoByNode.get(n.id)?.lat ?? null,
        lng: geoByNode.get(n.id)?.lng ?? null,
        proximityM: geoByNode.get(n.id)?.proximity_m ?? null,
        maxClaims: n.max_claims,
        requireSignature: Boolean(n.secret),
        captures: captureCounts.get(n.id) ?? 0,
        style,
        url,
        svg: renderStyledQrSvg(url, style, 168),
      }
    }),
  )

  // ── Split qr_codes by kind ──────────────────────────────────────────────────
  // Dynamic links = operator codes (no owner, no purpose). Member profile codes =
  // purpose 'connect' (one per member). Marketing funnels (owner + purpose null)
  // are member-managed on /codes, so they're not surfaced here.
  const allCodes = links ?? []
  const adminLinkRows = allCodes.filter((l) => !l.owner_profile_id && !l.purpose)
  const memberConnectRows = allCodes.filter((l) => l.purpose === 'connect')
  // Crew marketing funnels: owner set, no purpose. Member-created on /codes, but
  // surfaced here so operators can oversee, restyle, pause, or retire them.
  const marketingRows = allCodes.filter((l) => l.owner_profile_id && !l.purpose)

  const { summary } = scanSummaryFromRpc(statsPayload as QrStatsRpcPayload | null)
  const nodeLabels = new Map((nodes ?? []).map((n) => [n.id, n.label ?? `${n.type} code`]))

  // Circles + events for the circle-join / event check-in destination pickers.
  const [{ data: circleRows }, { data: eventRows }] = await Promise.all([
    db.from('circles').select('id, name, slug').order('name'),
    db.from('events').select('id, title, slug, starts_at').order('starts_at', { ascending: false }).limit(100),
  ])
  const circleName = new Map((circleRows ?? []).map((c) => [c.id, c.name]))
  const eventName = new Map((eventRows ?? []).map((e) => [e.id, e.title]))
  const circleOptions: PickOption[] = (circleRows ?? []).map((c) => ({ id: c.id, label: c.name }))
  const eventOptions: PickOption[] = (eventRows ?? []).map((e) => ({ id: e.id, label: e.title }))

  const initialLinks: StudioLink[] = await Promise.all(
    adminLinkRows.map(async (l) => {
      const url = shortLinkUrl(l.slug)
      const stat = summary.perCode.get(l.id)
      const style = parseStyle(l.style)
      const dest = l.destination_type as StudioLink['destination_type']
      return {
        id: l.id,
        slug: l.slug,
        title: l.title,
        destination_type: dest,
        target_url: l.target_url,
        node_id: l.node_id,
        node_label: l.node_id ? nodeLabels.get(l.node_id) ?? null : null,
        circle_id: l.circle_id,
        event_id: l.event_id,
        switch_at: l.switch_at,
        alt_target_url: l.alt_target_url,
        dest_label:
          dest === 'circle'
            ? circleName.get(l.circle_id ?? '') ?? null
            : dest === 'event'
              ? eventName.get(l.event_id ?? '') ?? null
              : null,
        partner_id: l.partner_id,
        active: l.active,
        valid_until: l.valid_until,
        source_tag: l.source_tag,
        page_path: pagePathById.get(l.id) ?? null,
        scans: l.scan_count,
        unique: stat?.unique ?? 0,
        style,
        url,
        svg: renderStyledQrSvg(url, style, 168),
      }
    }),
  )

  const nodeOptions: NodeOption[] = (nodes ?? []).map((n) => ({
    id: n.id,
    label: n.label ?? `${n.type} code`,
  }))

  // ── Analytics (serializable) ────────────────────────────────────────────────
  const topCodes = [...summary.perCode.values()]
    .map((s) => {
      const link = (links ?? []).find((l) => l.id === s.codeId)
      return { id: s.codeId, title: link?.title ?? 'Unknown', slug: link?.slug ?? '', total: s.total, unique: s.unique }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)

  const analytics: AnalyticsData = {
    total: summary.total,
    unique: summary.unique,
    nfc: summary.byMedium.nfc,
    daily: summary.daily,
    topCodes,
  }

  // ── Campaigns (qr_scan season_challenges + their code sets / progress) ───────
  const { data: allChallenges } = await db
    .from('season_challenges')
    .select('id, name, description, target, zaps_reward, criteria, valid_from, valid_until, created_at')
    .order('created_at', { ascending: false })
  const campaignRows = (allChallenges ?? []).filter(
    (c) => (c.criteria as Record<string, unknown> | null)?.type === 'qr_scan',
  )
  const campaignIds = campaignRows.map((c) => c.id)
  const [{ data: campCodes }, { data: campProgress }] = await Promise.all([
    campaignIds.length
      ? db.from('challenge_qr_codes').select('challenge_id, qr_code_id').in('challenge_id', campaignIds)
      : Promise.resolve({ data: [] as { challenge_id: string; qr_code_id: string }[] }),
    campaignIds.length
      ? db.from('challenge_progress').select('challenge_id, completed_at').in('challenge_id', campaignIds)
      : Promise.resolve({ data: [] as { challenge_id: string; completed_at: string | null }[] }),
  ])
  const codeCount = new Map<string, number>()
  const codeIdsByChallenge = new Map<string, string[]>()
  for (const r of campCodes ?? []) {
    codeCount.set(r.challenge_id, (codeCount.get(r.challenge_id) ?? 0) + 1)
    const ids = codeIdsByChallenge.get(r.challenge_id) ?? []
    ids.push(r.qr_code_id)
    codeIdsByChallenge.set(r.challenge_id, ids)
  }
  const compCount = new Map<string, number>()
  const progCount = new Map<string, number>()
  for (const p of campProgress ?? []) {
    const m = p.completed_at ? compCount : progCount
    m.set(p.challenge_id, (m.get(p.challenge_id) ?? 0) + 1)
  }
  const campaigns: CampaignCard[] = campaignRows.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description ?? '',
    target: c.target,
    rewardZaps: c.zaps_reward,
    codeCount: codeCount.get(c.id) ?? 0,
    completions: compCount.get(c.id) ?? 0,
    inProgress: progCount.get(c.id) ?? 0,
    validFrom: c.valid_from,
    validUntil: c.valid_until,
    codeIds: codeIdsByChallenge.get(c.id) ?? [],
  }))
  const campaignCodes: CampaignCodeOption[] = initialLinks.map((l) => ({
    id: l.id,
    label: l.title || `/q/${l.slug}`,
  }))

  // ── Member profile codes (one auto-generated code per member) ────────────────
  const ownerIds = [
    ...new Set(
      [...memberConnectRows, ...marketingRows].map((r) => r.owner_profile_id).filter(Boolean),
    ),
  ] as string[]
  const { data: owners } = ownerIds.length
    ? await db.from('profiles').select('id, handle, display_name, avatar_url, vcard').in('id', ownerIds)
    : { data: [] as { id: string; handle: string; display_name: string; avatar_url: string | null; vcard: unknown }[] }
  const ownerMap = new Map((owners ?? []).map((o) => [o.id, o]))
  const memberCodes: MemberProfileCode[] = memberConnectRows
    .filter((r) => r.owner_profile_id)
    .map((r) => {
      const style = parseStyle(r.style)
      const url = shortLinkUrl(r.slug)
      const o = ownerMap.get(r.owner_profile_id!)
      return {
        id: r.id,
        profileId: r.owner_profile_id!,
        handle: o?.handle ?? '–',
        displayName: o?.display_name ?? '',
        url,
        scans: r.scan_count,
        // Preview the member's current profile pic centered (matches /codes); the editor below
        // still tunes the base design, so saving never bakes a soon-stale avatar URL.
        svg: renderStyledQrSvg(url, withMemberAvatar(style, o?.avatar_url ?? null), 140),
        style,
        vcard: parseVcard(o?.vcard),
      }
    })

  // ── Marketing funnel codes (crew-owned, point at a circle/event) ─────────────
  const circleBySlug = new Map((circleRows ?? []).map((c) => [c.slug, c.name]))
  const eventBySlug = new Map((eventRows ?? []).map((e) => [e.slug, e.title]))
  function targetLabel(path: string | null): string {
    if (!path) return '–'
    const circle = path.match(/^\/circles\/([\w-]+)$/)
    if (circle) return circleBySlug.get(circle[1]) ?? path
    const event = path.match(/^\/events\/([\w-]+)$/)
    if (event) return eventBySlug.get(event[1]) ?? path
    return path
  }
  const marketingCodes: MarketingCodeAdmin[] = marketingRows
    .filter((r) => r.owner_profile_id)
    .map((r) => {
      const style = parseStyle(r.style)
      const url = shortLinkUrl(r.slug)
      const o = ownerMap.get(r.owner_profile_id!)
      return {
        id: r.id,
        title: r.title || `/q/${r.slug}`,
        slug: r.slug,
        url,
        handle: o?.handle ?? '–',
        displayName: o?.display_name ?? '',
        targetLabel: targetLabel(r.target_url),
        scans: r.scan_count,
        active: r.active,
        svg: renderStyledQrSvg(url, style, 140),
        style,
      }
    })

  return (
    <AdminTemplate
      title="QR Studio"
      icon={QrCode}
      eyebrow="Platform"
      width="wide"
      description="Generate, design, and track every code. Member profile codes, dynamic links, check-in codes, and campaigns. Codes are dynamic; edit or retire them without reprinting."
      actions={
        <Link href="/admin/qr/stats" className={buttonClasses('secondary', 'sm')}>
          <ChartNoAxesColumn className="h-3.5 w-3.5" /> View stats
        </Link>
      }
    >
      <QrStudioDashboard
        qrConfig={qrConfig}
        nodeProps={{ initialNodes, partners: partners ?? [] }}
        linkProps={{ initialLinks, nodes: nodeOptions, circles: circleOptions, events: eventOptions, partners: partners ?? [] }}
        campaignProps={{ campaigns, codes: campaignCodes }}
        memberCodes={memberCodes}
        marketingCodes={marketingCodes}
        analytics={analytics}
      />
    </AdminTemplate>
  )
}
