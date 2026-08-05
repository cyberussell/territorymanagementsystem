import { VISIT_RESULT_LABELS, VISIT_RESULTS } from '@/lib/territory-management-system/modules/records/schema'
import type { VisitResult } from '@/lib/territory-management-system/modules/records/types'

// Plain hex equivalents of VISIT_RESULT_STYLES' tailwind classes — SVG fill/stroke can't consume
// tailwind utility classes directly, so this is a deliberate, separate small mapping rather than
// trying to parse one out of the other. Kept in sync with VisitResultBarChart's own copy of this
// same mapping.
const RESULT_COLORS: Record<VisitResult, string> = {
  initial_visit: '#3B82F6',
  return_visit: '#0EA5E9',
  potential_bible_study: '#06B6D4',
  started_bible_study: '#6366F1',
  bible_study: '#8B5CF6',
  progressing: '#10B981',
  discontinued: '#9CA3AF',
  study_discontinued: '#78716C',
  not_home: '#64748B',
  do_not_call: '#EF4444',
  moved: '#F59E0B',
  other: '#F97316',
  undone: '#D1D5DB',
}

// No chart library in this codebase (matches the Appointment System's Reports, also plain
// SVG/CSS) — a donut built from stacked <circle> strokes, each dash-offset to the end of the
// previous slice, is simpler and more reliable here than hand-computing arc paths.
export default function VisitResultPieChart({ resultCounts }: { resultCounts: Record<VisitResult, number> }) {
  const entries = VISIT_RESULTS.filter((r) => r !== 'undone')
    .map((r) => ({ result: r, count: resultCounts[r] ?? 0 }))
    .filter((e) => e.count > 0)
  const total = entries.reduce((sum, e) => sum + e.count, 0)

  if (total === 0) {
    return <p className="text-center text-sm text-slate-400">No visits were logged today.</p>
  }

  const radius = 70
  const strokeWidth = 28
  const circumference = 2 * Math.PI * radius
  let cumulative = 0

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
      <svg viewBox="0 0 180 180" className="h-48 w-48 shrink-0 -rotate-90">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} />
        {entries.map((e) => {
          const fraction = e.count / total
          const dashArray = `${fraction * circumference} ${circumference - fraction * circumference}`
          const dashOffset = -cumulative * circumference
          cumulative += fraction
          return (
            <circle
              key={e.result}
              cx="90"
              cy="90"
              r={radius}
              fill="none"
              stroke={RESULT_COLORS[e.result]}
              strokeWidth={strokeWidth}
              strokeDasharray={dashArray}
              strokeDashoffset={dashOffset}
            />
          )
        })}
      </svg>
      <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {entries.map((e) => (
          <li key={e.result} className="flex items-center gap-2 text-sm text-slate-600">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: RESULT_COLORS[e.result] }} />
            {VISIT_RESULT_LABELS[e.result]}
            <span className="text-slate-400">({e.count})</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
