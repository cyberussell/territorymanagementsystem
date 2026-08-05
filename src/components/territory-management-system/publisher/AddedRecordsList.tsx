import { Hourglass } from 'lucide-react'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import Card from '@/components/territory-management-system/dashboard/Card'

// Records this partnership added via "Add a New Contact Record" — deliberately its own list,
// never mixed with AssignedRecordsList (today's assigned records). Every entry here is still
// pending Admin review by definition (see createRecord's status: 'pending'), so the badge is
// unconditional rather than derived per-record.
export default function AddedRecordsList({
  records,
  onSelect,
}: {
  records: TerritoryRecordWithLocation[]
  onSelect: (recordId: string) => void
}) {
  if (records.length === 0) {
    return <Card className="p-6 text-center text-sm text-slate-600">You haven&apos;t added any contact records yet.</Card>
  }

  return (
    <div className="space-y-2">
      {records.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onSelect(r.id)}
          className="flex w-full items-center justify-between gap-3 rounded-xl border border-blue-100/60 bg-white p-3 text-left shadow-sm transition hover:border-[#38BDF8]/40"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-[#0B1B33]">
              {r.address || r.plus_code || 'Unlabeled record'}
              {r.unit ? `, ${r.unit}` : ''}
            </p>
            {r.resident_name && <p className="truncate text-xs text-slate-600">{r.resident_name}</p>}
            <p className="truncate text-xs text-slate-400">
              Sec {r.section?.label ?? '—'} / Blk {r.block?.label ?? '—'}
            </p>
            {r.household_members != null && (
              <p className="truncate text-xs text-slate-400">
                {r.household_members} household{r.household_members === 1 ? '' : 's'}
              </p>
            )}
          </div>
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600"
            title="Pending Admin review"
          >
            <Hourglass className="h-3.5 w-3.5" />
          </span>
        </button>
      ))}
    </div>
  )
}
