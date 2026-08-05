import type { RecordHistoryEntry } from '@/lib/territory-management-system/modules/records/types'
import { RECORD_HISTORY_ACTION_LABELS, RECORD_HISTORY_ACTION_STYLES } from '@/lib/territory-management-system/modules/records/history'
import Card from '@/components/territory-management-system/dashboard/Card'

// Read-only — distinct from VisitHistoryList (field-ministry visit results). Shows every
// mutation to the record itself: created, edited (with a before/after diff), and a publisher's
// correction/move/removal recommendation together with the Admin's later apply/dismiss of it.
// Kept for 1 year (vs. Visit History's 6 months) — see logRecordHistory in records/queries.ts.
export default function RecordHistoryList({ entries }: { entries: RecordHistoryEntry[] }) {
  if (entries.length === 0) {
    return <Card className="p-6 text-center text-sm text-slate-600">No changes logged yet.</Card>
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${RECORD_HISTORY_ACTION_STYLES[entry.action]}`}>
              {RECORD_HISTORY_ACTION_LABELS[entry.action]}
            </span>
            <span className="text-xs text-slate-600">
              {new Date(entry.created_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{entry.summary}</p>
          {entry.actor_name && (
            <p className="mt-2 text-xs text-slate-600">
              {entry.actor_role === 'admin' ? 'By Admin' : 'By'} {entry.actor_name}
            </p>
          )}
        </Card>
      ))}
    </div>
  )
}
