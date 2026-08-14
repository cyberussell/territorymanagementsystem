// Fixed-order 8-hue categorical palette (light-surface steps), each paired with the
// higher-contrast text color for a number rendered directly on that fill. Shared by every place
// a Ministry Partner gets a color-coded identifier — the Group Leader's Map tab pins/legend
// (TodayAssignmentMap), the Group Leader's Partners tab and public Progress page cards
// (PartnershipList), and the publisher workspace's own "All Partners" tab (PartnerStatusList) —
// so the same partner reads as the same color everywhere a Group Leader or publisher sees them.
//
// Validated with the dataviz skill's scripts/validate_palette.js (lightness band, chroma floor,
// CVD separation, normal-vision floor, contrast vs. surface) rather than picked by eye — an
// earlier ad hoc warm-hue cycle put several reds/oranges/ambers close enough in hue to read as
// "the same partner" on the map. A map (and, to a lesser extent, a grid of cards) is an
// "all-pairs" layout — any two can end up next to each other, not just neighbors in a fixed list
// — and that stricter check only clears reliably for this palette's first 3 of 8 slots; past 3
// (a normal day easily has more Ministry Partners than that), some hue pairs fall below the
// comfortable separation floor. Rather than force a false promise ("color alone is enough"),
// every consumer also renders the partner's own number on top of the fill — see
// PartnerColorBadge and TodayAssignmentMap's dotIcon.
export const PARTNER_COLORS: { fill: string; text: string }[] = [
  { fill: '#2a78d6', text: '#0b0b0b' }, // blue
  { fill: '#eb6834', text: '#0b0b0b' }, // orange
  { fill: '#1baf7a', text: '#0b0b0b' }, // aqua
  { fill: '#eda100', text: '#0b0b0b' }, // yellow
  { fill: '#e87ba4', text: '#0b0b0b' }, // magenta
  { fill: '#008300', text: '#ffffff' }, // green
  { fill: '#4a3aa7', text: '#ffffff' }, // violet
  { fill: '#e34948', text: '#0b0b0b' }, // red
]

// Reserved for "unassigned" on the Map tab — deliberately never part of the cycle above, so a
// partner's own color can never be confused with the unassigned state.
export const PARTNER_UNASSIGNED_COLOR = '#9CA3AF'

// Cycles past 8 Ministry Partners in one batch — rare, but each card/pin's own number (see
// PartnerColorBadge/dotIcon) still uniquely identifies it even once colors repeat.
export function partnerColorFor(index: number): { fill: string; text: string } {
  return PARTNER_COLORS[index % PARTNER_COLORS.length]
}
