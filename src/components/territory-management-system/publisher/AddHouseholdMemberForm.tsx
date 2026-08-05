'use client'

import { useState } from 'react'
import { getSelectableResults, VISIT_RESULT_CONDUCTOR_PROMPT, VISIT_RESULT_LABELS } from '@/lib/territory-management-system/modules/records/schema'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export interface NewHouseholdMemberPayload {
  residentName: string
  notes: string
  initialResult: string
  initialConductorName: string
  initialNotes: string
}

// The lightweight sibling of PublisherRecordForm — used only from "Add Another Person Here" on
// an existing record's detail view, where territory/section/block/address/unit/Plus Code are all
// already known (same household, carried over silently by the caller) and showing them as
// editable fields here would just be clutter — worse, an accidentally-edited Plus Code would
// silently break this person's grouping with the rest of their household (matched by exact Plus
// Code string, see PublisherWorkspaceApp's householdRecords). Name and Status are both required
// here (unlike the general add-record form) since the publisher is standing at the door talking
// to this person right now, not logging a placeholder to visit later.
export default function AddHouseholdMemberForm({
  address,
  onSubmit,
  onCancel,
}: {
  address: string
  onSubmit: (payload: NewHouseholdMemberPayload) => void
  onCancel: () => void
}) {
  const [residentName, setResidentName] = useState('')
  const [initialResult, setInitialResult] = useState<ReturnType<typeof getSelectableResults>[number] | ''>('')
  const [initialConductorName, setInitialConductorName] = useState('')
  const [notes, setNotes] = useState('')
  const selectableResults = getSelectableResults()
  const notesRequired = initialResult === 'other'
  const conductorPrompt = initialResult ? VISIT_RESULT_CONDUCTOR_PROMPT[initialResult] : undefined

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!residentName.trim() || !initialResult) return
    if (conductorPrompt && !initialConductorName.trim()) return
    if (notesRequired && !notes.trim()) return
    onSubmit({
      residentName: residentName.trim(),
      notes,
      initialResult,
      initialConductorName,
      // Same text satisfies both the general record note and logVisitSchema/createRecordSchema's
      // "notes required when the result is Other" rule — one field on screen, no need to explain
      // to the publisher why there'd otherwise be two.
      initialNotes: notes,
    })
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-[#0B1B33]">Add Another Person</h2>
      <p className="mb-4 text-xs text-slate-500">Same address as before — {address}.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name">
          <input value={residentName} onChange={(e) => setResidentName(e.target.value)} required maxLength={120} className={inputClass} />
        </FormField>
        <FormField label="Status">
          <select
            required
            value={initialResult}
            onChange={(e) => setInitialResult(e.target.value as ReturnType<typeof getSelectableResults>[number] | '')}
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
        {conductorPrompt && (
          <FormField label={conductorPrompt}>
            <input
              value={initialConductorName}
              onChange={(e) => setInitialConductorName(e.target.value)}
              required
              maxLength={80}
              className={inputClass}
            />
          </FormField>
        )}
        <FormField label="Notes" optional={!notesRequired}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            required={notesRequired}
            className={inputClass}
          />
        </FormField>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Submit Record
          </button>
        </div>
      </form>
    </Card>
  )
}
