'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { renderStockSpaceQr } from '@/lib/qr/stock-space'

export function SpaceStockQr({ url, slug, name }: { url: string; slug: string; name: string }) {
  const [image, setImage] = useState<{ url: string; png: string; svg: string } | null>(null)
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    renderStockSpaceQr(url).then(
      (rendered) => { if (active) setImage({ url, ...rendered }) },
      () => { if (active) setFailedUrl(url) },
    )
    return () => { active = false }
  }, [url])
  const current = image?.url === url ? image : null

  function download(format: 'png' | 'svg') {
    if (!current) return
    const href = format === 'png' ? current.png : URL.createObjectURL(new Blob([current.svg], { type: 'image/svg+xml' }))
    const link = document.createElement('a')
    link.href = href
    link.download = `${slug}-qr.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    if (format === 'svg') setTimeout(() => URL.revokeObjectURL(href), 1000)
  }

  return (
    <div className="flex flex-wrap items-center gap-6 rounded-card border border-border p-4">
      {current ? (
        // A locally generated data image; Next's image optimizer cannot improve a QR code.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={current.png} alt={`QR code for ${name}`} width={160} height={160} className="shrink-0" />
      ) : <p role="status">{failedUrl === url ? 'Could not load your QR code. Reload to try again.' : 'Loading your QR code.'}</p>}
      <div className="min-w-0 space-y-3">
        <p className="text-body-sm text-muted">Your stock code opens your public Space page. Download it for a poster or flyer.</p>
        <a href={url} className="break-all text-body-sm text-primary-strong">{url}</a>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!current} onClick={() => download('png')}>Download PNG</Button>
          <Button variant="secondary" disabled={!current} onClick={() => download('svg')}>Download SVG</Button>
        </div>
      </div>
    </div>
  )
}
