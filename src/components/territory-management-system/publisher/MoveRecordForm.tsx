'use client'

import { useState } from 'react'
import { ArrowRightLeft, RefreshCw } from 'lucide-react'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

// Lets a publisher pass an unfinished record to a different Ministry Partner working under the
// same Group Leader today — their own batch or any overflow batch (see
// getGroupLeaderPartnershipsForDate) — e.g. it's on the other pair's way home, or this pair is
// running out of time. Shows just the partner's own saved name, not which batch they belong to
// (Russell's call — the receiving publisher needs to recognize whose person they're getting, not
// batch bookkeeping). Hidden entirely when there's no other partnership to pass to (a
// single-partnership day, or every sibling has already ended their ministry for the day).
export default function MoveRecordForm({
  siblingPartnerships,
  moving,
  onMove,
}: {
  siblingPartnerships: { id: string; name: string; batchLabel: string }[]
  moving: boolean
  onMove: (destinationPartnershipId: string) => void
}) {
  const [destinationId, setDestinationId] = useState('')

  if (siblingPartnerships.length === 0) return null

  return (
    <Card className="p-6">
      <h2 className="mb-4 font-semibold text-[#0B1B33]">Pass to Another Partner</h2>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <FormField label="Move to">
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              disabled={moving}
              className={inputClass}
            >
              <option value="" disabled>
                Select a Ministry Partner…
              </option>
              {siblingPartnerships.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <button
          type="button"
          disabled={!destinationId || moving}
          onClick={() => onMove(destinationId)}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {moving ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Moving…
            </>
          ) : (
            <>
              <ArrowRightLeft className="h-4 w-4" />
              Move
            </>
          )}
        </button>
      </div>
    </Card>
  )
}
