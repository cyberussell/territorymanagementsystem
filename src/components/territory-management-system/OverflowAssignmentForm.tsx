'use client'

import { useState } from 'react'
import { createOverflowAssignmentAction } from '@/app/tms/actions/group-leader'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import FormField from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'
import { NumberStepper } from './AssignmentForm'

// Generates a second, independent batch for the same territory an existing batch already
// covers today — for when more publishers show up than the original batch had partnerships
// for. Deliberately much simpler than AssignmentForm: no "how many records support this many
// partnerships" math, since every partnership here always starts with zero records by design
// (see createOverflowAssignmentAction's forceZeroRecords) — this is a "go canvass/search"
// assignment, not a recompute against the territory's eligible-record pool. The territory list
// is pre-narrowed by the parent to only territories already covered by one of today's batches,
// so there's no "no active territories yet" empty state to handle here the way AssignmentForm
// has to.
//
// The Group Leader deliberately does NOT choose a search area here — that choice moved to each
// Ministry Partner individually (see ChooseSearchScopeForm), a one-time locked-in pick made
// after they claim their partnership. Blocks are shareable across partnerships by design (see
// 037_partnership_search_blocks_shareable.sql); only the section itself is a one-time,
// single choice per partnership.
export default function OverflowAssignmentForm({ territories }: { territories: { id: string; name: string; barangayName: string }[] }) {
  const { dispatch, pending, error } = useServerAction(createOverflowAssignmentAction)
  const [selected, setSelected] = useState<string[]>([])
  const [publisherCount, setPublisherCount] = useState(2)
  const [groupSize, setGroupSize] = useState(2)
  const partnershipCount = Math.max(1, Math.ceil((publisherCount || 1) / (groupSize || 1)))

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  if (territories.length === 0) return null

  return (
    <Card className="max-w-2xl p-6">
      <form action={dispatch} className="space-y-4">
        <FormField label="Territory (already assigned today)">
          <div className="space-y-2 rounded-lg border border-blue-100 p-3">
            {territories.map((t) => (
              <label key={t.id} className="flex items-center gap-2 text-sm text-[#0B1B33]">
                <input
                  type="checkbox"
                  name="territoryIds"
                  value={t.id}
                  checked={selected.includes(t.id)}
                  onChange={() => toggle(t.id)}
                  className="h-4 w-4 rounded border-blue-200"
                />
                {t.name}
                {t.barangayName ? ` — ${t.barangayName}` : ''}
              </label>
            ))}
          </div>
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberStepper label="Extra publishers going out" value={publisherCount} onChange={setPublisherCount} min={1} max={999} />
          <NumberStepper label="Group size" value={groupSize} onChange={setGroupSize} min={1} max={10} />
        </div>
        <input type="hidden" name="partnershipCount" value={partnershipCount} />
        <div className="rounded-lg border border-blue-100 bg-[#F8FBFF] p-3 text-sm text-slate-500">
          <p>
            {publisherCount} publisher{publisherCount === 1 ? '' : 's'} in groups of {groupSize} → {partnershipCount} new
            Ministry Partner{partnershipCount === 1 ? '' : 's'}, each starting with no assigned records — they go canvass/search
            the territory instead.
          </p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={pending || selected.length === 0}
          className="w-full rounded-lg border border-[#2563EB] bg-white py-2.5 font-semibold text-[#2563EB] transition hover:bg-blue-50 disabled:opacity-50"
        >
          {pending ? 'Generating…' : 'Create Auxiliary Groups'}
        </button>
      </form>
    </Card>
  )
}
