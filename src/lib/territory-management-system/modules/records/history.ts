import type { RecordHistoryAction } from './types'

// Shared by RecordHistoryList — one label/color per action, same "single source of truth"
// pattern as VISIT_RESULT_LABELS/VISIT_RESULT_STYLES in schema.ts.
export const RECORD_HISTORY_ACTION_LABELS: Record<RecordHistoryAction, string> = {
  created: 'Added',
  edited: 'Edited',
  correction_recommended: 'Correction recommended',
  correction_applied: 'Correction applied',
  correction_dismissed: 'Correction dismissed',
  move_recommended: 'Move recommended',
  move_applied: 'Move applied',
  move_dismissed: 'Move dismissed',
  removal_recommended: 'Removal recommended',
  removal_dismissed: 'Removal dismissed',
}

export const RECORD_HISTORY_ACTION_STYLES: Record<RecordHistoryAction, string> = {
  created: 'bg-blue-50 text-[#2563EB]',
  edited: 'bg-slate-100 text-slate-600',
  correction_recommended: 'bg-amber-50 text-amber-600',
  correction_applied: 'bg-emerald-50 text-emerald-600',
  correction_dismissed: 'bg-gray-100 text-gray-500',
  move_recommended: 'bg-amber-50 text-amber-600',
  move_applied: 'bg-emerald-50 text-emerald-600',
  move_dismissed: 'bg-gray-100 text-gray-500',
  removal_recommended: 'bg-red-50 text-red-600',
  removal_dismissed: 'bg-gray-100 text-gray-500',
}

interface EditableRecordFields {
  address: string
  unit: string
  residentName: string
  plusCode: string
  householdMembers: number | null
  doNotCall: boolean
  notes: string
}

const FIELD_LABELS = {
  address: 'Address',
  unit: 'Unit',
  residentName: 'Resident name',
  plusCode: 'Plus Code',
  householdMembers: 'Household members',
  doNotCall: 'Do Not Call',
} as const

function displayValue(v: string | number | boolean | null): string {
  if (v === null || v === '') return '(blank)'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

// Compares only the fields RecordEditForm/PublisherRecordForm actually let someone touch.
// Returns '' when nothing changed, so the caller can skip logging a no-op edit. Notes is
// checked but never quoted in the summary (could be long free text) — just flagged as changed.
export function buildEditSummary(before: EditableRecordFields, after: EditableRecordFields): string {
  const parts: string[] = []
  const push = (label: string, from: string | number | boolean | null, to: string | number | boolean | null) => {
    if (from === to) return
    parts.push(`${label}: ${displayValue(from)} → ${displayValue(to)}`)
  }
  push(FIELD_LABELS.address, before.address, after.address)
  push(FIELD_LABELS.unit, before.unit, after.unit)
  push(FIELD_LABELS.residentName, before.residentName, after.residentName)
  push(FIELD_LABELS.plusCode, before.plusCode || null, after.plusCode || null)
  push(FIELD_LABELS.householdMembers, before.householdMembers, after.householdMembers)
  push(FIELD_LABELS.doNotCall, before.doNotCall, after.doNotCall)
  if (before.notes !== after.notes) parts.push('Notes updated')
  return parts.join('; ')
}
