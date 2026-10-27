// One theme picture, or its labeled empty slot (ADR-1910). Server component. A picture shows only when
// lib/themes/library-assets.ts lists it; until then the slot names itself, so a missing asset reads as
// "on the way" and never as a broken image.
import Image from 'next/image'
import { THEME_ASSET_SLOTS, themeAssetPath, type ThemeAssetSlot } from '@/lib/themes/library'
import { THEME_ASSETS_READY } from '@/lib/themes/library-assets'

const SIZES = '(max-width: 960px) 100vw, 50vw'

export function ThemePicture({ theme, label, slot, priority = false }: { theme: string; label: string; slot: ThemeAssetSlot; priority?: boolean }) {
  const def = THEME_ASSET_SLOTS.find((s) => s.slot === slot)!
  const [width, height] = def.size.split(' x ').map(Number)
  if (THEME_ASSETS_READY.has(`${theme}/${slot}`)) {
    return <Image src={themeAssetPath(theme, slot)} alt={`${label}: ${def.label.toLowerCase()}`} width={width} height={height} sizes={SIZES} priority={priority} quality={80} />
  }
  return (
    <div className="tg-card" data-slot={`${theme}/${slot}`}>
      <p className="label">
        <b>{def.label}</b>
      </p>
      <p>{label}, picture on the way.</p>
    </div>
  )
}
