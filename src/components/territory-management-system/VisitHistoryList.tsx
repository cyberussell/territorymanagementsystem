'use client'

import { useState, useTransition } from 'react'
import { Pencil, ShieldAlert } from 'lucide-react'
import type { RecordVisitWithAuthor } from '@/lib/territory-management-system/modules/records/types'
import { getSelectableResults, VISIT_RESULT_LABELS } from '@/lib/territory-management-system/modules/records/schema'
import Card from '@/components/territory-management-system/dashboard/Card'
import VisitResultBadge from '@/components/territory-management-system/VisitResultBadge'
import ConfirmDeleteButton from '@/components/territory-management-system/dashboard/ConfirmDeleteButton'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'

// onUndoLast/onOverride are only ever passed from the admin record detail page — the
// publisher-facing usage of this same list passes neither, so these controls never render
// there. Both only offered on the single most recent entry: deleteLatestVisit/
// overrideLatestVisit can only ever act on that one row.
export default function VisitHistoryList({
  visits,
  onUndoLast,
  onOverride,
}: {
  visits: RecordVisitWithAuthor[]
  onUndoLast?: () => Promise<void>
  onOverride?: (result: string, notes: string) => Promise<{ error: string } | { error: 'SAVED' }>
}) {
  const [editing, setEditing] = useState(false)
  const [result, setResult] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const selectableResults = getSelectableResults()

  if (visits.length === 0) {
    return <Card className="p-6 text-center text-sm text-slate-600">No visits logged yet.</Card>
  }

  function startEditing(visit: RecordVisitWithAuthor) {
    setResult(visit.result)
    setNotes(visit.notes)
    setError(null)
    setEditing(true)
  }

  function handleSave() {
    if (!onOverride) return
    startTransition(async () => {
      const res = await onOverride(result, notes)
      if (res.error !== 'SAVED') {
        setError(res.error)
        return
      }
      setEditing(false)
    })
  }

  return (
    <div className="space-y-3">
      {visits.map((visit, index) => (
        <Card key={visit.id} className="p-4">
          {editing && index === 0 ? (
            <div className="space-y-3">
              <FormField label="Status">
                <select value={result} onChange={(e) => setResult(e.target.value)} disabled={pending} className={inputClass}>
                  {selectableResults.map((r) => (
                    <option key={r} value={r}>
                      {VISIT_RESULT_LABELS[r]}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Notes" optional>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} disabled={pending} className={inputClass} />
              </FormField>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={pending}
                  className="flex-1 rounded-lg border border-blue-100 bg-white py-2 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  {pending ? 'Saving…' : 'Save Override'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <VisitResultBadge result={visit.result} />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-600">
                    {new Date(visit.visited_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  {index === 0 && onOverride && (
                    <button
                      type="button"
                      onClick={() => startEditing(visit)}
                      className="inline-flex items-center gap-1 text-xs text-[#2563EB] hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      Override
                    </button>
                  )}
                  {index === 0 && onUndoLast && (
                    <ConfirmDeleteButton
                      action={onUndoLast}
                      confirmMessage="Undo this visit? The record will revert to its previous status."
                      label="Undo"
                      ariaLabel="Undo last visit"
                      className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700"
                    />
                  )}
                </div>
              </div>
              {visit.notes && <p className="mt-2 text-sm text-slate-600">{visit.notes}</p>}
              {(visit.partner_name || visit.created_by_name) && (
                <p className="mt-2 text-xs text-slate-600">Visited by {visit.partner_name ?? visit.created_by_name}</p>
              )}
              {visit.overridden_by_admin_at && (
                <p className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-600">
                  <ShieldAlert className="h-3 w-3" />
                  Overridden by admin on{' '}
                  {new Date(visit.overridden_by_admin_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </>
          )}
        </Card>
      ))}
    </div>
  )
}
