import { partnerColorFor } from '@/lib/territory-management-system/partnerColors'

// The small numbered, colored circle that identifies one Ministry Partner — shared by the Group
// Leader's Map tab legend, Partners tab cards, the public Progress page cards, and the
// publisher workspace's own "All Partners" tab, so the same partner reads as the same
// color+number everywhere. See partnerColors.ts for why the number is load-bearing, not
// decorative — color alone isn't guaranteed distinguishable past 3 partners.
export default function PartnerColorBadge({ index, size = 20 }: { index: number; size?: number }) {
  const { fill, text } = partnerColorFor(index)
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none"
      style={{ background: fill, color: text, width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.42)) }}
    >
      {index + 1}
    </span>
  )
}
