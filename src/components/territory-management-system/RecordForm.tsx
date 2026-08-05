'use client'

import { useEffect, useState } from 'react'
import { createRecordAction } from '@/app/tms/actions/records'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import {
  getSelectableResults,
  SELECTABLE_VISIT_RESULTS,
  VISIT_RESULT_CONDUCTOR_PROMPT,
  VISIT_RESULT_LABELS,
} from '@/lib/territory-management-system/modules/records/schema'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

interface RecordFields {
  address: string
  unit: string
  residentName: string
  plusCode: string
  householdMembers: string
  notes: string
  doNotCall: boolean
  blockId: string
  initialConductorName: string
  initialNotes: string
  initialPartnerName: string
}

function emptyFields(firstBlockId: string): RecordFields {
  return {
    address: '',
    unit: '',
    residentName: '',
    plusCode: '',
    householdMembers: '',
    notes: '',
    doNotCall: false,
    blockId: firstBlockId,
    initialConductorName: '',
    initialNotes: '',
    initialPartnerName: '',
  }
}

export default function RecordForm({ territory }: { territory: TerritoryStructure }) {
  const { dispatch, pending, error, state } = useServerAction(createRecordAction, ['SAVED'], 'Record added.')
  const [sectionId, setSectionId] = useState(territory.sections[0]?.id ?? '')
  const section = territory.sections.find((s) => s.id === sectionId)
  const [initialResult, setInitialResult] = useState<(typeof SELECTABLE_VISIT_RESULTS)[number] | ''>('')
  const [fields, setFields] = useState<RecordFields>(() => emptyFields(section?.blocks[0]?.id ?? ''))
  const selectableResults = getSelectableResults()
  const initialNotesRequired = initialResult === 'other'
  const conductorPrompt = initialResult ? VISIT_RESULT_CONDUCTOR_PROMPT[initialResult] : undefined

  // Only clear the form after a real successful save — every other submit (validation error,
  // server error) leaves everything exactly as typed so nothing has to be retyped. Watches the
  // whole `state` object (a fresh reference on every action resolution) rather than the
  // 'SAVED' sentinel string itself, so two successful saves in a row both correctly reset —
  // the sentinel string alone wouldn't change identity between them.
  useEffect(() => {
    if (state.error === 'SAVED') {
      const firstSection = territory.sections[0]
      setSectionId(firstSection?.id ?? '')
      setInitialResult('')
      setFields(emptyFields(firstSection?.blocks[0]?.id ?? ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function handleSectionChange(newSectionId: string) {
    setSectionId(newSectionId)
    const newSection = territory.sections.find((s) => s.id === newSectionId)
    setFields((f) => ({ ...f, blockId: newSection?.blocks[0]?.id ?? '' }))
  }

  if (territory.sections.length === 0) {
    return <Card className="p-6 text-sm text-slate-600">Add a section first before adding records.</Card>
  }

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Add a Contact Record</h2>
      <form action={dispatch} className="space-y-4">
        <input type="hidden" name="territoryId" value={territory.id} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Section">
            <select
              name="sectionId"
              value={sectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
              className={inputClass}
            >
              {territory.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Block">
            <select
              name="blockId"
              value={fields.blockId}
              onChange={(e) => setFields((f) => ({ ...f, blockId: e.target.value }))}
              className={inputClass}
              disabled={!section || section.blocks.length === 0}
            >
              {(section?.blocks ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  Block {b.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Address" optional>
          <input
            name="address"
            value={fields.address}
            onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
            maxLength={200}
            className={inputClass}
            placeholder="123 Main St"
          />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Unit" optional>
            <input
              name="unit"
              value={fields.unit}
              onChange={(e) => setFields((f) => ({ ...f, unit: e.target.value }))}
              maxLength={40}
              className={inputClass}
            />
          </FormField>
          <FormField label="Resident name" optional>
            <input
              name="residentName"
              value={fields.residentName}
              onChange={(e) => setFields((f) => ({ ...f, residentName: e.target.value }))}
              maxLength={120}
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Plus Code">
            <input
              name="plusCode"
              value={fields.plusCode}
              onChange={(e) => setFields((f) => ({ ...f, plusCode: e.target.value }))}
              required
              maxLength={20}
              className={inputClass}
              placeholder="e.g. 7FG8+4V"
            />
          </FormField>
          <FormField label="Household members" optional>
            <input
              name="householdMembers"
              type="number"
              min={0}
              max={99}
              value={fields.householdMembers}
              onChange={(e) => setFields((f) => ({ ...f, householdMembers: e.target.value }))}
              className={inputClass}
              placeholder="1"
            />
          </FormField>
        </div>
        <FormField label="Notes" optional>
          <textarea
            name="notes"
            value={fields.notes}
            onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
            maxLength={500}
            rows={2}
            className={inputClass}
          />
        </FormField>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="doNotCall"
            value="true"
            checked={fields.doNotCall}
            onChange={(e) => setFields((f) => ({ ...f, doNotCall: e.target.checked }))}
            className="h-4 w-4 rounded border-blue-200"
          />
          Do Not Call
        </label>
        <FormField label="Initial status" optional>
          <select
            name="initialResult"
            value={initialResult}
            onChange={(e) => setInitialResult(e.target.value as (typeof SELECTABLE_VISIT_RESULTS)[number] | '')}
            className={inputClass}
          >
            <option value="">Leave blank (Initial Visit)</option>
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
              name="initialConductorName"
              value={fields.initialConductorName}
              onChange={(e) => setFields((f) => ({ ...f, initialConductorName: e.target.value }))}
              required
              maxLength={80}
              className={inputClass}
            />
          </FormField>
        )}
        {initialResult && (
          <FormField label="Ministry Partner" optional>
            <input
              name="initialPartnerName"
              value={fields.initialPartnerName}
              onChange={(e) => setFields((f) => ({ ...f, initialPartnerName: e.target.value }))}
              placeholder="Who actually made this visit?"
              maxLength={80}
              className={inputClass}
            />
          </FormField>
        )}
        {initialResult && (
          <FormField label="Initial visit notes" optional={!initialNotesRequired}>
            <textarea
              name="initialNotes"
              value={fields.initialNotes}
              onChange={(e) => setFields((f) => ({ ...f, initialNotes: e.target.value }))}
              maxLength={500}
              rows={2}
              required={initialNotesRequired}
              className={inputClass}
            />
          </FormField>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending || !section || section.blocks.length === 0}
          className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add Record'}
        </button>
      </form>
    </Card>
  )
}
