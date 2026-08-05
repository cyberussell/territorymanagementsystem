'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { LocateFixed, RefreshCw } from 'lucide-react'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import {
  getSelectableResults,
  SELECTABLE_VISIT_RESULTS,
  VISIT_RESULT_CONDUCTOR_PROMPT,
  VISIT_RESULT_LABELS,
} from '@/lib/territory-management-system/modules/records/schema'
import { locatePlusCode } from '@/lib/territory-management-system/plusCode'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export interface NewPublisherRecordPayload {
  territoryId: string
  sectionId: string
  blockId: string
  address: string
  unit: string
  residentName: string
  plusCode: string
  householdMembers: string
  notes: string
  initialResult: string
  initialConductorName: string
  initialNotes: string
}

// Fully controlled — enqueueing (not a native form action) is how this reaches the server now,
// so every field needs to be readable in JS on submit rather than pulled from FormData.
//
// Doubles as the "edit a record I added" form (mode='edit') — same fields, seeded from
// initialValues instead of blank, minus the initial-visit-status section (editing a record you
// added isn't "logging a visit"). onSubmit's payload shape stays the same either way; the
// initialResult/initialConductorName/initialNotes fields just come back empty in edit mode and
// the caller (handleEditAddedRecord) ignores them.
export default function PublisherRecordForm({
  territories,
  onSubmit,
  onCancel,
  mode = 'add',
  initialValues,
  lockedScope,
}: {
  territories: TerritoryStructure[]
  onSubmit: (payload: NewPublisherRecordPayload) => void
  onCancel: () => void
  mode?: 'add' | 'edit'
  initialValues?: Partial<Omit<NewPublisherRecordPayload, 'initialResult' | 'initialConductorName' | 'initialNotes'>>
  // Set for an overflow Ministry Partner who has already locked in a search area (see
  // ChooseSearchScopeForm) — territory/section become fixed (shown as plain text, not
  // choosable) and the block choice narrows to just the blocks they locked in, since they may
  // only add records within their own search area.
  lockedScope?: {
    territoryId: string
    territoryName: string
    sectionId: string
    sectionLabel: string
    blocks: { id: string; label: string }[]
  }
}) {
  const [territoryId, setTerritoryId] = useState(lockedScope?.territoryId ?? initialValues?.territoryId ?? territories[0]?.id ?? '')
  const territory = territories.find((t) => t.id === territoryId)
  const [sectionId, setSectionId] = useState(lockedScope?.sectionId ?? initialValues?.sectionId ?? territory?.sections[0]?.id ?? '')
  const section = territory?.sections.find((s) => s.id === sectionId)
  const blockOptions = lockedScope ? lockedScope.blocks : (section?.blocks ?? [])
  const [blockId, setBlockId] = useState(initialValues?.blockId ?? blockOptions[0]?.id ?? '')
  const [address, setAddress] = useState(initialValues?.address ?? '')
  const [unit, setUnit] = useState(initialValues?.unit ?? '')
  const [residentName, setResidentName] = useState(initialValues?.residentName ?? '')
  const [plusCode, setPlusCode] = useState(initialValues?.plusCode ?? '')
  const [householdMembers, setHouseholdMembers] = useState(initialValues?.householdMembers ?? '')
  const [notes, setNotes] = useState(initialValues?.notes ?? '')
  const [locating, setLocating] = useState(false)
  // A brand-new record has no prior visit and is never do_not_call yet, so the full selectable
  // list applies — same call shape as a fresh admin RecordForm.
  const [initialResult, setInitialResult] = useState<(typeof SELECTABLE_VISIT_RESULTS)[number] | ''>('')
  const [initialConductorName, setInitialConductorName] = useState('')
  const [initialNotes, setInitialNotes] = useState('')
  const selectableResults = getSelectableResults()
  const initialNotesRequired = initialResult === 'other'
  const conductorPrompt = initialResult ? VISIT_RESULT_CONDUCTOR_PROMPT[initialResult] : undefined

  function handleTerritoryChange(id: string) {
    setTerritoryId(id)
    const t = territories.find((x) => x.id === id)
    const firstSection = t?.sections[0]
    setSectionId(firstSection?.id ?? '')
    setBlockId(firstSection?.blocks[0]?.id ?? '')
  }

  function handleSectionChange(id: string) {
    setSectionId(id)
    const s = territory?.sections.find((x) => x.id === id)
    setBlockId(s?.blocks[0]?.id ?? '')
  }

  // Reads the device's GPS position and converts it to a Plus Code entirely client-side (no
  // network call, no API key — see lib/plusCode.ts) — a quick way to fill in the now-required
  // Plus Code field while standing at the door, without needing to look it up manually.
  async function handleUseMyLocation() {
    setLocating(true)
    try {
      const result = await locatePlusCode()
      if ('error' in result) {
        toast.error(result.error)
      } else {
        setPlusCode(result.code)
      }
    } finally {
      setLocating(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!territoryId || !sectionId || !blockId || !plusCode.trim()) return
    if (conductorPrompt && !initialConductorName.trim()) return
    if (initialNotesRequired && !initialNotes.trim()) return
    onSubmit({
      territoryId,
      sectionId,
      blockId,
      address: address.trim(),
      unit,
      residentName,
      plusCode,
      householdMembers,
      notes,
      initialResult,
      initialConductorName,
      // Unlike PublisherVisitLogForm, the conductor name isn't merged into notes client-side —
      // addPublisherRecordAction does that merge itself once the record (and its id) exists.
      initialNotes,
    })
  }

  if (!territory && !lockedScope) return null

  return (
    <Card className="p-6">
      <h2 className="mb-1 font-semibold text-[#0B1B33]">{mode === 'edit' ? 'Edit Contact Record' : 'Add a New Contact Record'}</h2>
      <p className="mb-4 text-xs text-slate-500">
        {lockedScope
          ? "Only within your locked search area — you'll see it under My Added Records right away, still pending Admin review."
          : mode === 'edit'
            ? 'Still pending Admin review — you can keep editing until you end your ministry for today.'
            : "You'll see it under My Added Records right away — still pending Admin review before it's used in a future assignment."}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        {lockedScope ? (
          <FormField label="Territory">
            <p className="mt-1 rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-sm text-[#0B1B33]">
              {lockedScope.territoryName}
            </p>
          </FormField>
        ) : (
          territories.length > 1 && (
            <FormField label="Territory">
              <select value={territoryId} onChange={(e) => handleTerritoryChange(e.target.value)} className={inputClass}>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </FormField>
          )
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {lockedScope ? (
            <FormField label="Section">
              <p className="mt-1 rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-sm text-[#0B1B33]">
                Section {lockedScope.sectionLabel}
              </p>
            </FormField>
          ) : (
            <FormField label="Section">
              <select value={sectionId} onChange={(e) => handleSectionChange(e.target.value)} className={inputClass}>
                {territory?.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    Section {s.label}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Block">
            <select
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              className={inputClass}
              disabled={blockOptions.length === 0}
            >
              {blockOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  Block {b.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Unit" optional>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={40} className={inputClass} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Address" optional>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={200}
              className={inputClass}
              placeholder="123 Main St"
            />
          </FormField>
          <FormField label="Resident name" optional>
            <input value={residentName} onChange={(e) => setResidentName(e.target.value)} maxLength={120} className={inputClass} />
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Plus Code">
            <div className="flex gap-2">
              <input
                value={plusCode}
                onChange={(e) => setPlusCode(e.target.value)}
                required
                maxLength={20}
                className={`${inputClass} min-w-0 flex-1`}
                placeholder="e.g. 7FG8+4V"
              />
              <button
                type="button"
                onClick={handleUseMyLocation}
                disabled={locating}
                title="Use my current location"
                aria-label="Use my current location"
                className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 text-sm font-medium text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-50"
              >
                {locating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              </button>
            </div>
          </FormField>
          <FormField label="Household Number" optional>
            <input
              value={householdMembers}
              onChange={(e) => setHouseholdMembers(e.target.value)}
              type="number"
              min={0}
              max={99}
              className={inputClass}
              placeholder="Default: 1"
            />
          </FormField>
        </div>
        <FormField label="Notes" optional>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={2} className={inputClass} />
        </FormField>
        {mode === 'add' && (
          <FormField label="Initial status" optional>
            <select
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
        )}
        {mode === 'add' && conductorPrompt && (
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
        {mode === 'add' && initialResult && (
          <FormField label="Initial visit notes" optional={!initialNotesRequired}>
            <textarea
              value={initialNotes}
              onChange={(e) => setInitialNotes(e.target.value)}
              maxLength={500}
              rows={2}
              required={initialNotesRequired}
              className={inputClass}
            />
          </FormField>
        )}
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
            disabled={blockOptions.length === 0}
            className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {mode === 'edit' ? 'Save Changes' : 'Submit Record'}
          </button>
        </div>
      </form>
    </Card>
  )
}
