import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import Card from '@/components/territory-management-system/dashboard/Card'

// Shown on Home > Summary instead of VisitResultPieChart once a search-only partnership
// (workspace.searchScope set — see PublisherWorkspaceApp's isSearchOnlyPartnership) has ended
// their ministry — that chart is keyed off visit results, which this kind of partnership never
// logs any of (they have no assigned records), so it would always render all-zero. This surfaces
// what actually happened during a search session instead: how many contact records were found
// and where.
export default function SearchScopeSummaryCard({
  addedRecords,
  territoryName,
  territoryDescription,
  sectionLabel,
  blockLabels,
}: {
  addedRecords: TerritoryRecordWithLocation[]
  territoryName?: string
  territoryDescription?: string
  sectionLabel: string
  blockLabels: string[]
}) {
  // Same "one card per Plus Code, blank ones never merge" grouping rule as
  // AssignedRecordsList — a household with more than one contact record shouldn't inflate the
  // household count.
  const householdCount = (() => {
    const seenPlusCodes = new Set<string>()
    let count = 0
    for (const r of addedRecords) {
      if (r.plus_code) {
        if (seenPlusCodes.has(r.plus_code)) continue
        seenPlusCodes.add(r.plus_code)
      }
      count += 1
    }
    return count
  })()

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-center font-semibold text-[#0B1B33]">Search Summary</h2>
      <div className="grid grid-cols-2 gap-3 text-center">
        <div>
          <p className="text-2xl font-bold text-[#0B1B33]">{addedRecords.length}</p>
          <p className="text-xs text-slate-500">Records Added</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-[#0B1B33]">{householdCount}</p>
          <p className="text-xs text-slate-500">Households</p>
        </div>
      </div>
      <div className="mt-4 space-y-1 text-center text-xs text-slate-500">
        {territoryName && (
          <p>
            {territoryName}
            {territoryDescription ? ` — ${territoryDescription}` : ''}
          </p>
        )}
        <p>
          Section {sectionLabel} — Block{blockLabels.length === 1 ? '' : 's'} {blockLabels.join(', ')}
        </p>
      </div>
    </Card>
  )
}
