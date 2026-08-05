'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { OpenLocationCode } from 'open-location-code'
import { LocateFixed, PencilLine, RefreshCw } from 'lucide-react'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'
import { locatePlusCode } from '@/lib/territory-management-system/plusCode'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'

const openLocationCode = new OpenLocationCode()

export interface CorrectionFields {
  plusCode: string
  householdMembers: string
  residentName: string
  reason: string
  territoryId: string
  sectionId: string
  blockId: string
}

// Lets a publisher recommend a correction to a record's info (most commonly a wrong Plus Code,
// now also Territory/Section/Block and Household Members — see 030_correction_section_block.sql,
// 031_correction_household_members.sql, 034_correction_recommendation_territory.sql) without
// editing it directly — the Admin reviews and applies or dismisses it from the Flagged for
// Correction list, same review-gated pattern as "Recommend for Admin Removal". Collapsed behind
// a trigger button by default, same convention as MarkMovedForm.
export default function RecommendCorrectionForm({
  currentPlusCode,
  currentTerritoryId,
  currentSectionId,
  currentBlockId,
  currentHouseholdMembers,
  currentResidentName,
  territories,
  submitting,
  onSubmit,
  // Lets a parent skip straight past the trigger button — used by the mobile "Pass / Unlocated /
  // Update" button row, which only mounts this component once its own "Update" button is
  // tapped.
  initialOpen = false,
}: {
  currentPlusCode: string
  // The record's own current Territory/Section/Block — always known since this form is only ever
  // opened from an actual Contact Record (assigned or search-scope), never a bare location.
  // Territory/Section/Block all start prefilled to the record's current values rather than blank.
  currentTerritoryId: string
  currentSectionId: string
  currentBlockId: string
  currentHouseholdMembers: number | null
  // Lets a publisher recommend a corrected name (e.g. a misspelling) — admin-review-gated like
  // every other field here, unlike the old direct-write "Update Current Resident" path (removed).
  currentResidentName: string
  // Every congregation territory (not just this record's own) — a correction can move a record
  // into a different barangay entirely, not just a different Section/Block within its own.
  territories: TerritoryStructure[]
  submitting: boolean
  onSubmit: (fields: CorrectionFields) => void
  initialOpen?: boolean
}) {
  const [open, setOpen] = useState(initialOpen)
  const [plusCode, setPlusCode] = useState(currentPlusCode)
  const initialHouseholdMembers = currentHouseholdMembers != null ? String(currentHouseholdMembers) : ''
  const [householdMembers, setHouseholdMembers] = useState(initialHouseholdMembers)
  const [residentName, setResidentName] = useState(currentResidentName)
  const [reason, setReason] = useState('')
  const [locating, setLocating] = useState(false)
  const [territoryId, setTerritoryId] = useState(currentTerritoryId)
  const territory = territories.find((t) => t.id === territoryId)
  const [sectionId, setSectionId] = useState(currentSectionId)
  const [blockId, setBlockId] = useState(currentBlockId)
  const blockOptions = territory?.sections.find((s) => s.id === sectionId)?.blocks ?? []

  const trimmedPlusCode = plusCode.trim()
  const plusCodeValid = trimmedPlusCode.length > 0 && openLocationCode.isValid(trimmedPlusCode)
  // Nothing to recommend if every field still matches what the record already has — the reason
  // text alone isn't a "change" the Admin can act on.
  const isDirty =
    trimmedPlusCode !== currentPlusCode ||
    residentName.trim() !== currentResidentName ||
    territoryId !== currentTerritoryId ||
    sectionId !== currentSectionId ||
    blockId !== currentBlockId ||
    householdMembers.trim() !== initialHouseholdMembers

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

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40"
      >
        <PencilLine className="h-4 w-4" />
        Correction
      </button>
    )
  }

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-[#0B1B33]">Recommend a Correction</h2>
      <p className="mt-1 text-sm text-slate-500">Wrong Plus Code or other info? Let the Admin know what it should be.</p>
      <div className="mt-4 space-y-4">
        <FormField label="Correct Plus Code" error={trimmedPlusCode && !plusCodeValid ? 'Enter a valid Plus Code (e.g. 7FG8+4V).' : undefined}>
          <div className="flex gap-2">
            <input
              value={plusCode}
              onChange={(e) => setPlusCode(e.target.value)}
              maxLength={20}
              disabled={submitting}
              className={`${inputClass} min-w-0 flex-1`}
              placeholder="e.g. 7FG8+4V"
            />
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={submitting || locating}
              title="Use my current location"
              aria-label="Use my current location"
              className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 text-sm font-medium text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-50"
            >
              {locating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </button>
          </div>
        </FormField>
        <FormField label="Barangay">
          <select value={territoryId} onChange={(e) => handleTerritoryChange(e.target.value)} disabled={submitting} className={inputClass}>
            {territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.description || t.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Section">
            <select
              value={sectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
              disabled={submitting || !territory?.sections.length}
              className={inputClass}
            >
              {territory?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Block">
            <select
              value={blockId}
              onChange={(e) => setBlockId(e.target.value)}
              disabled={submitting || blockOptions.length === 0}
              className={inputClass}
            >
              {blockOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  Block {b.label}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Resident Name" optional>
            <input
              value={residentName}
              onChange={(e) => setResidentName(e.target.value)}
              maxLength={120}
              disabled={submitting}
              className={inputClass}
            />
          </FormField>
          <FormField label="Household Members" optional>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={householdMembers}
              onChange={(e) => setHouseholdMembers(e.target.value)}
              disabled={submitting}
              className={inputClass}
            />
          </FormField>
        </div>
        <FormField label="Note to Admin">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={submitting}
            className={inputClass}
            placeholder="Explain what's wrong and why…"
          />
        </FormField>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          className="flex-1 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() =>
            onSubmit({
              plusCode: trimmedPlusCode,
              householdMembers: householdMembers.trim(),
              residentName: residentName.trim(),
              reason: reason.trim(),
              territoryId,
              sectionId,
              blockId,
            })
          }
          disabled={submitting || !plusCodeValid || !reason.trim() || !territoryId || !sectionId || !blockId || !isDirty}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            'Send to Admin'
          )}
        </button>
      </div>
    </Card>
  )
}
