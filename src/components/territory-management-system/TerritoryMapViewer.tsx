'use client'

import { useEffect, useState } from 'react'
import { Map, X, ZoomIn } from 'lucide-react'

// Reference image only — no section/block boundaries are drawn on it (count-based
// generation, not spatial). Click-to-zoom lightbox with native scroll/pinch, no new
// canvas/drawing dependency.
//
// 'thumbnail' (default) renders the full-width image preview used on the workspace's list
// view. 'button' renders a small labeled button instead. 'icon' renders a larger, label-less
// circular button — used in the record detail card's bottom-right action corner, deliberately
// bigger than a normal icon button so it's an easy tap target for less phone-dexterous users.
// All three variants open the exact same lightbox.
export default function TerritoryMapViewer({
  mapImageUrl,
  territoryName,
  variant = 'thumbnail',
}: {
  mapImageUrl: string
  territoryName: string
  variant?: 'thumbnail' | 'button' | 'icon'
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open])

  return (
    <>
      {variant === 'button' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View ${territoryName} map`}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-semibold text-[#2563EB] hover:border-[#38BDF8]/40 hover:bg-blue-50"
        >
          <Map className="h-4 w-4" />
          View Territory Map
        </button>
      ) : variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View ${territoryName} map`}
          title="View Territory Map"
          className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-100 bg-white text-[#2563EB] shadow-sm transition hover:border-[#38BDF8]/40 hover:bg-blue-50"
        >
          <Map className="h-6 w-6" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`View ${territoryName} map full size`}
          className="group relative block w-full overflow-hidden rounded-xl border border-blue-100"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mapImageUrl} alt={`${territoryName} map`} className="w-full object-contain" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100">
            <ZoomIn className="h-8 w-8 text-white" />
          </span>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          {/* Image is scaled to fit the viewport (object-contain within a full-size box) instead
              of rendering at native resolution — a large map image used to render bigger than
              the screen with only a scrollable overflow, which also visually covered the close
              button (same stacking context, later in paint order) since it could stretch right
              over the top-right corner. The close button now renders after the image in the DOM
              with an explicit z-index, so it always paints on top and stays clickable. */}
          <div className="relative flex h-full w-full items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapImageUrl} alt={`${territoryName} map`} className="max-h-full max-w-full object-contain" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
