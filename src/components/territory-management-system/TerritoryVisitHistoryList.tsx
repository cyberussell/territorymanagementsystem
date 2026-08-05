import type { TerritoryVisitHistoryEntry } from '@/lib/territory-management-system/modules/reports/queries'
import Card from '@/components/territory-management-system/dashboard/Card'

// Group Leader-facing "territories worked in the last month" list — every territory with at
// least one logged visit in the window, most recently visited first (see
// getTerritoryVisitHistory, reports/queries.ts). Rendered both on the pre-assignment "no
// assignment generated yet" screen and on the Dashboard tab once a batch exists, since
// territory coverage is useful information regardless of whether today's assignment exists yet.
export default function TerritoryVisitHistoryList({ entries }: { entries: TerritoryVisitHistoryEntry[] }) {
  return (
    <div>
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Territories Worked (Last 30 Days)</h2>
      {entries.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-600">No territories visited in the last 30 days.</Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.territoryId} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium text-[#0B1B33]">
                  {entry.territoryName} — {entry.barangayName}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Section{entry.sectionLabels.length === 1 ? '' : 's'} worked: {entry.sectionLabels.join(', ')}
                </p>
              </div>
              <p className="shrink-0 text-xs text-slate-500">
                Last visit{' '}
                {new Date(entry.lastVisitedAt).toLocaleDateString('en-US', { dateStyle: 'medium' })}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
