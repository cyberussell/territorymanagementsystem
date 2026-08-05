import type { Viewport } from 'next'

// maximumScale: 1 stops iOS Safari's auto-zoom-on-input-focus for the whole product — every
// TMS input is already sized at 16px+ (the other half of this fix), but that alone wasn't
// reliably enough on a real device; this is the standard belt-and-suspenders pairing for an
// app-like tool where pinch-zoom isn't expected to matter (bottom tab bars, offline workspace).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function TerritoryManagementSystemLayout({ children }: { children: React.ReactNode }) {
  return children
}
