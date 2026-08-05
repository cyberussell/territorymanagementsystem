'use client'

import { useState } from 'react'
import { logVisitAction } from '@/app/tms/actions/records'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import {
  getSelectableResults,
  SELECTABLE_VISIT_RESULTS,
  VISIT_RESULT_CONDUCTOR_PROMPT,
  VISIT_RESULT_LABELS,
} from '@/lib/territory-management-system/modules/records/schema'
import { nowLocalDatetime } from '@/lib/territory-management-system/modules/records/localTime'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

// latestResult narrows the Status choices once a record is already an ongoing Bible Study, and
// doNotCall narrows to exactly Do Not Call/Moved/Visited Again — see getSelectableResults in
// records/schema.ts.
export default function VisitLogForm({
  recordId,
  latestResult,
  doNotCall,
}: {
  recordId: string
  latestResult?: string | null
  doNotCall?: boolean
}) {
  const { dispatch, pending, error, successMessage } = useServerAction(logVisitAction, ['SAVED'], 'Visit logged.')
  const [result, setResult] = useState<(typeof SELECTABLE_VISIT_RESULTS)[number] | ''>('')
  const selectableResults = getSelectableResults(latestResult, doNotCall)
  const notesRequired = result === 'other'
  const conductorPrompt = result ? VISIT_RESULT_CONDUCTOR_PROMPT[result] : undefined

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Log a Visit</h2>
      <form action={dispatch} className="space-y-4" key={successMessage ?? 'form'}>
        <input type="hidden" name="recordId" value={recordId} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Visited at">
            <input name="visitedAt" type="datetime-local" required defaultValue={nowLocalDatetime()} className={inputClass} />
          </FormField>
          <FormField label="Status">
            <select
              name="result"
              required
              value={result}
              onChange={(e) => setResult(e.target.value as (typeof SELECTABLE_VISIT_RESULTS)[number])}
              className={inputClass}
            >
              <option value="" disabled>
                Select a status…
              </option>
              {selectableResults.map((r) => (
                <option key={r} value={r}>
                  {VISIT_RESULT_LABELS[r]}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        {conductorPrompt && (
          <FormField label={conductorPrompt}>
            <input name="conductorName" required maxLength={80} className={inputClass} />
          </FormField>
        )}
        <FormField label="Ministry Partner" optional>
          <input name="partnerName" maxLength={80} placeholder="Who actually made this visit?" className={inputClass} />
        </FormField>
        <FormField label="Notes" optional={!notesRequired}>
          <textarea name="notes" maxLength={500} rows={2} required={notesRequired} className={inputClass} />
        </FormField>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Logging…' : 'Log Visit'}
        </button>
      </form>
    </Card>
  )
}
