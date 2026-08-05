'use client'

import { MapPin, Pencil, Trash2 } from 'lucide-react'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'

// Detail view for one of the publisher's own added records — deliberately much narrower than
// PublisherRecordDetailView (no visit logging, no move/mark-as-moved): the only actions here are
// Edit and Delete, and both disappear the moment the ministry session ends, same as every other
// editing control in the workspace (see PublisherWorkspaceApp's `editable`).
export default function PublisherAddedRecordDetailView({
  record,
  editable,
  deleting,
  onEdit,
  onDelete,
}: {
  record: TerritoryRecordWithLocation
  editable: boolean
  deleting: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const mapsUrl = record.plus_code
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(record.plus_code)}`
    : null

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]">
        <span className="inline-block rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
          Pending Admin Review
        </span>
        <h1 className="mt-2 font-semibold text-[#0B1B33]">
          {record.address || record.plus_code || 'Unlabeled record'}
          {record.unit ? `, ${record.unit}` : ''}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Sec {record.section?.label ?? '—'} / Blk {record.block?.label ?? '—'}
        </p>
        {record.resident_name && <p className="mt-2 text-sm text-slate-600">{record.resident_name}</p>}
        {record.household_members != null && (
          <p className="mt-2 text-sm text-slate-500">Household members: {record.household_members}</p>
        )}
        {record.notes && <p className="mt-2 text-sm text-slate-500">{record.notes}</p>}
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-semibold text-[#2563EB] hover:border-[#38BDF8]/40 hover:bg-blue-50"
          >
            <MapPin className="h-4 w-4" />
            Open in Google Maps
          </a>
        )}
      </div>

      {editable ? (
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-semibold text-[#2563EB] hover:border-[#38BDF8]/40"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onDelete}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white py-2.5 text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-500">
          Your ministry session has ended — this record can no longer be edited or deleted.
        </p>
      )}
    </div>
  )
}
