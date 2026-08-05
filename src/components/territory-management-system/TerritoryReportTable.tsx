import type { TerritoryReportRow } from '@/lib/territory-management-system/modules/reports/queries'
import Card from '@/components/territory-management-system/dashboard/Card'

const thClass = 'whitespace-nowrap border-r border-gray-200 px-4 py-3 text-left font-medium text-slate-500 last:border-r-0'
const tdClass = 'whitespace-nowrap border-r border-gray-200 px-4 py-3 text-[#0B1B33] last:border-r-0'

// Plain sorted table, not DataTable — this list is small (one row per territory), always shown
// in full (no pagination needed), and its order is meaningful (highest Total Households first,
// per Russell's request), not something a viewer should be able to re-sort away from.
export default function TerritoryReportTable({ rows }: { rows: TerritoryReportRow[] }) {
  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <p className="text-sm text-slate-600">No territories yet.</p>
      </Card>
    )
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-gray-50">
          <tr className="border-b border-gray-200">
            <th className={thClass}>Barangay Name</th>
            <th className={thClass}>Started Bible Study</th>
            <th className={thClass}>Progressive BS</th>
            <th className={thClass}>Total Households</th>
            <th className={thClass}>Total Records</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-gray-200 last:border-0">
              <td className={`${tdClass} font-medium`}>{r.barangayName}</td>
              <td className={tdClass}>{r.startedBibleStudy}</td>
              <td className={tdClass}>{r.progressiveBibleStudy}</td>
              <td className={tdClass}>{r.totalHouseholds}</td>
              <td className={tdClass}>{r.totalRecords}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
