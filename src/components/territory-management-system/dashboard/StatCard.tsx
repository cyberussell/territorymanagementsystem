import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react'
import Card from './Card'

export default function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
}: {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  // Signed change since this page (or the selected batch) was first opened — e.g. +3 renders a
  // green up arrow, -2 a red down arrow. A result's count can go down, not just up: only the
  // most recent visit per record counts (see getBatchVisitResultCounts), so a revisit that
  // changes a record's result moves it out of its old bucket into a new one. Omitted or exactly
  // 0 renders nothing.
  delta?: number
}) {
  const deltaBadge =
    delta ? (
      <span className={`inline-flex shrink-0 items-center gap-0.5 text-xs font-bold ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
        {delta > 0 ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />}
        {Math.abs(delta)}
      </span>
    ) : null

  return (
    <Card className="p-4">
      {/* One layout at every screen size (no divergent mobile/desktop variants) — the simplest
          way to guarantee the label never overflows its card no matter how narrow it gets. */}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-[#2563EB]" aria-hidden />
        <p className="min-w-0 flex-1 break-words text-xs font-medium leading-snug text-slate-500">{label}</p>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-2 text-center">
        <p className="text-2xl font-bold text-[#0B1B33]">{value}</p>
        {deltaBadge}
      </div>
      {hint && <p className="mt-2 text-xs text-slate-600">{hint}</p>}
    </Card>
  )
}
