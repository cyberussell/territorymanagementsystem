'use client'

import { useState } from 'react'
import { RefreshCw, Truck } from 'lucide-react'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

export interface MovedRecordFields {
  address: string
  unit: string
  residentName: string
  plusCode: string
  householdMembers: string
  notes: string
}

// Submitted by the "Suggest New Location" path — no territory/section/block/Plus Code anymore
// (see MoveRecommendFields comment below), and admin-review-gated: nothing changes on the record
// until the Admin applies it.
export interface MoveRecommendFields {
  address: string
  householdMembers: string
  notes: string
}

// Marking a record "Moved" is never a bare status update — the publisher must pick one of two
// paths: the current resident here knows where the person who used to live here moved to
// (suggest the new address for Admin approval), or recommend the Admin remove it outright, with
// a required reason. Collapsed behind a single trigger by default so it doesn't clutter every
// record's detail view.
export default function MarkMovedForm({
  initial,
  submitting,
  onRecommendMove,
  onRecommend,
  // Lets a parent skip straight past the trigger button — used by the mobile "Pass to Other /
  // Mark as Moved" button row (PublisherRecordDetailView), which only mounts this component
  // once its own "Mark as Moved" button is tapped, so the trigger itself would be redundant.
  initialMode = 'closed',
  currentRecordId,
  currentRecordLabel,
  householdRecords = [],
}: {
  initial: MovedRecordFields
  submitting: boolean
  // "Suggest New Location" — the same person moved and the current resident here knows where
  // to. Review-gated: nothing changes on the record until the Admin applies it. Resident name
  // and household members are carried over from the record as-is (same household, just a new
  // address) — only address and notes are ever new input here.
  onRecommendMove: (fields: MoveRecommendFields) => void
  // recordId is currentRecordId unless the publisher picks a different household member on the
  // record-picker step below (only shown when householdRecords is non-empty).
  onRecommend: (reason: string, recordId: string) => void
  initialMode?: 'closed' | 'choose'
  // This record's own id/label, used as the record picker's default selection and its own radio
  // option — required even when householdRecords is empty since onRecommend always needs a
  // recordId.
  currentRecordId: string
  currentRecordLabel: string
  // Other records at this same address (same Plus Code) already assigned to this partnership —
  // see PublisherWorkspaceApp's householdRecords. Empty for a single-record household, in which
  // case the picker step is skipped entirely (nothing to choose between).
  householdRecords?: { id: string; label: string }[]
}) {
  const [mode, setMode] = useState<'closed' | 'choose' | 'recommendMove' | 'recommend'>(initialMode)
  const [fields, setFields] = useState(initial)
  const [reason, setReason] = useState('')
  const [recommendRecordId, setRecommendRecordId] = useState(currentRecordId)

  if (mode === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setMode('choose')}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 transition hover:border-amber-300"
      >
        <Truck className="h-4 w-4" />
        Unlocated
      </button>
    )
  }

  if (mode === 'choose') {
    return (
      <Card className="border-amber-200 bg-amber-50 p-6">
        <h2 className="font-semibold text-[#0B1B33]">This Household Is Unlocated</h2>
        <p className="mt-1 text-sm text-slate-500">Choose one before this can be logged as Unlocated.</p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={() => setMode('recommendMove')}
            className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Suggest New Location
          </button>
          <button
            type="button"
            onClick={() => setMode('recommend')}
            className="w-full rounded-lg border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 transition hover:border-red-300"
          >
            Request Record Removal
          </button>
          <button
            type="button"
            onClick={() => setMode('closed')}
            className="w-full text-center text-xs font-medium text-slate-400 hover:underline"
          >
            Cancel
          </button>
        </div>
      </Card>
    )
  }

  if (mode === 'recommendMove') {
    return (
      <Card className="border-amber-200 bg-amber-50 p-6">
        <h2 className="font-semibold text-[#0B1B33]">Suggest New Location</h2>
        <p className="mt-1 text-sm text-slate-500">
          The current resident here knows where the person who used to live here moved to. This is sent to the Admin for
          approval — nothing changes on this record until it's applied.
        </p>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Resident Name">
              <input value={fields.residentName} disabled className={`${inputClass} bg-slate-100 text-slate-400`} />
            </FormField>
            <FormField label="Household Members" optional>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={fields.householdMembers}
                onChange={(e) => setFields((f) => ({ ...f, householdMembers: e.target.value }))}
                disabled={submitting}
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField label="Address">
            <textarea
              value={fields.address}
              onChange={(e) => setFields((f) => ({ ...f, address: e.target.value }))}
              maxLength={300}
              rows={3}
              required
              disabled={submitting}
              className={inputClass}
              placeholder="Describe the new location as specifically as you can…"
            />
          </FormField>
          <FormField label="Notes">
            <textarea
              value={fields.notes}
              onChange={(e) => setFields((f) => ({ ...f, notes: e.target.value }))}
              maxLength={500}
              rows={2}
              required
              disabled={submitting}
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setMode('choose')}
            disabled={submitting}
            className="flex-1 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40 disabled:opacity-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() =>
              onRecommendMove({
                address: fields.address,
                householdMembers: fields.householdMembers,
                notes: fields.notes,
              })
            }
            disabled={submitting || !fields.address.trim() || !fields.notes.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Sending…
              </>
            ) : (
              'Suggest Location'
            )}
          </button>
        </div>
      </Card>
    )
  }

  return (
    <Card className="border-red-200 bg-red-50 p-6">
      <h2 className="font-semibold text-[#0B1B33]">Request Record Removal</h2>
      <p className="mt-1 text-sm text-slate-500">Required — tell the Admin why this record should be removed.</p>
      {householdRecords.length > 0 && (
        <div className="mt-4">
          <FormField label="Which record?">
            <div className="space-y-2">
              {[{ id: currentRecordId, label: currentRecordLabel }, ...householdRecords].map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="recommendRecordId"
                    checked={recommendRecordId === r.id}
                    onChange={() => setRecommendRecordId(r.id)}
                    disabled={submitting}
                    className="h-4 w-4 border-blue-200"
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </FormField>
        </div>
      )}
      <div className="mt-4">
        <FormField label="Reason">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
            required
            disabled={submitting}
            className={inputClass}
            placeholder="e.g. house is vacant / demolished, resident confirmed they moved away…"
          />
        </FormField>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => setMode('choose')}
          disabled={submitting}
          className="flex-1 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40 disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onRecommend(reason, recommendRecordId)}
          disabled={submitting || !reason.trim()}
          className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </Card>
  )
}
