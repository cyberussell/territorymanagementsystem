// Panels stay light (the page background is what got darkened — see the bg-[#F3F8FF]→
// bg-[#C9D8EE] change across every TMS page wrapper), identified instead by a soft gray
// ring + a subtle glow. Every content panel across TMS renders through this one component
// (or, for the handful of one-off screens that can't use it directly, an inline copy of this
// exact class string), so this is the single place to change the look.
export const panelClass =
  'rounded-2xl border border-gray-300 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]'

export default function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`${panelClass} ${className}`}>{children}</div>
}
