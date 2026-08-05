'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { createGroupLeaderAssignmentAction } from '@/app/tms/actions/group-leader'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import { useConfirm } from '@/lib/territory-management-system/hooks/useConfirm'
import { DEFAULT_MAX_PER_PARTNERSHIP } from '@/lib/territory-management-system/modules/assignment/engine'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

// Plain type="number" inputs give mobile browsers no visible increment/decrement affordance
// (the native stepper arrows are a desktop-only convention) — publishers/group-size are both a
// small bounded range, so tap +/- buttons are the clearer mobile pattern. Typing is still
// supported (useful for a bigger jump, e.g. 2 → 8) via the same not-clamped-until-blur pattern
// as before, so clearing the field to type a fresh value still works.
// Exported for reuse by OverflowAssignmentForm, which needs the exact same tap +/- stepper for
// its own publisher-count/group-size fields.
export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (next: number) => void
  min: number
  max: number
}) {
  return (
    <FormField label={label}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          required
          value={value || ''}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
          onBlur={() => onChange(Math.min(max, Math.max(min, value || min)))}
          className={`${inputClass} text-center`}
        />
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </FormField>
  )
}

// Natural sort by territory number ("M-2" before "M-6" before "M-11", not lexicographic which
// would put "M-11" before "M-2") — splits into alternating digit/non-digit chunks and compares
// numeric chunks as numbers, everything else as plain strings. A territory with no number in its
// name (e.g. "Maligaya") just becomes a single non-digit chunk and sorts in wherever its letters
// naturally fall, no special-casing needed.
function naturalCompare(a: string, b: string): number {
  const chunk = (s: string) => s.match(/\d+|\D+/g) ?? []
  const ca = chunk(a)
  const cb = chunk(b)
  const len = Math.max(ca.length, cb.length)
  for (let i = 0; i < len; i++) {
    const x = ca[i] ?? ''
    const y = cb[i] ?? ''
    if (x === y) continue
    const nx = Number(x)
    const ny = Number(y)
    if (x !== '' && y !== '' && !isNaN(nx) && !isNaN(ny)) {
      if (nx !== ny) return nx - ny
    } else {
      return x < y ? -1 : 1
    }
  }
  return 0
}

// Group-Leader-only (assignment generation moved off the Admin dashboard — see
// actions/group-leader.ts). Asks for a publisher headcount rather than a raw partnership
// count directly, since on a campaign day the Group Leader knows "how many people showed up,"
// not how the engine should group them — partnershipCount is derived (ceil(publishers /
// groupSize)) and submitted as the hidden field the engine actually expects.
export default function AssignmentForm({
  territories: territoriesProp,
  hasExistingBatch,
}: {
  territories: { id: string; name: string; barangayName: string; approvedCount: number }[]
  hasExistingBatch: boolean
}) {
  const territories = useMemo(() => [...territoriesProp].sort((a, b) => naturalCompare(a.name, b.name)), [territoriesProp])
  const { dispatch, pending, error } = useServerAction(createGroupLeaderAssignmentAction)
  const { confirm, ConfirmDialog } = useConfirm()
  const [selected, setSelected] = useState<string[]>([])
  const [publisherCount, setPublisherCount] = useState(4)
  const [groupSize, setGroupSize] = useState(2)
  // The Group Leader's own suggestion for how many records each publisher/pair takes today,
  // instead of always the fixed DEFAULT_MAX_PER_PARTNERSHIP — still just a per-partnership cap
  // once submitted (calculateAssignment fills each partnership up to this many records, in
  // order), not a soft hint.
  const [maxPerPartnership, setMaxPerPartnership] = useState(DEFAULT_MAX_PER_PARTNERSHIP)
  // Only a full group of `groupSize` counts as a real Ministry Partner — a leftover publisher who
  // doesn't fill one out isn't given their own partnership (they'd need to join an existing pair
  // or do another form of ministry). Floor, not ceil — see leftoverPublishers below for the rest.
  const partnershipCount = Math.floor((publisherCount || 0) / (groupSize || 1))
  const leftoverPublishers = (publisherCount || 0) - partnershipCount * (groupSize || 1)

  const eligibleTotal = useMemo(
    () => territories.filter((t) => selected.includes(t.id)).reduce((sum, t) => sum + t.approvedCount, 0),
    [territories, selected]
  )
  // Mirrors engine.ts's calculateAssignment: records fill sequentially up to maxPerPartnership
  // per partnership, so at most ceil(eligibleTotal / max) partnerships can end up with any
  // records at all. Requesting more than that is no longer blocked — the engine caps the actual
  // partnership count at what the records support and leaves the rest uncreated, since a
  // territory legitimately having fewer approved records than publishers who showed up is a
  // normal day, not a mistake to correct before generating.
  const recordsMaxPartnerships = eligibleTotal > 0 ? Math.ceil(eligibleTotal / maxPerPartnership) : 0
  const insufficientForHeadcount = eligibleTotal > 0 && partnershipCount > recordsMaxPartnerships
  const shortfallPublishers = insufficientForHeadcount
    ? Math.max(0, publisherCount - recordsMaxPartnerships * groupSize)
    : 0
  // Plain arithmetic straight off the current inputs, not the engine's actual per-territory
  // capping — matches how Russell wants the summary to read regardless of whether the territory
  // truly has that many approved records (the separate insufficientForHeadcount box below still
  // covers that headcount-vs-records mismatch). Capped at eligibleTotal — there's never more to
  // work on than the territory actually has approved, however high the requested capacity is.
  const recordsToWork = Math.min(partnershipCount * maxPerPartnership, eligibleTotal)
  const recordsRemaining = Math.max(0, eligibleTotal - recordsToWork)
  // Records fill sequentially, one partnership at a time, up to maxPerPartnership each (mirrors
  // engine.ts's calculateAssignment) — so when the records don't divide evenly, exactly one
  // partnership (the last one to receive any) ends up with fewer than everyone else, not an even
  // split across all of them. Surfaced so the Group Leader can adjust publisher/group-size/
  // records-per-publisher instead of being surprised by an uneven partner later.
  const fullyLoadedPartnerships = Math.min(partnershipCount, Math.floor(eligibleTotal / maxPerPartnership))
  const partialRecords = eligibleTotal - fullyLoadedPartnerships * maxPerPartnership
  const hasPartialPartnership = fullyLoadedPartnerships < partnershipCount && partialRecords > 0

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    if (hasExistingBatch) {
      const ok = await confirm({
        title: 'Replace today’s assignment?',
        message:
          'An assignment already exists for today. Generating a new one replaces it — any Partners publishers have already claimed today will be lost. Continue?',
        confirmLabel: 'Generate New',
        variant: 'caution',
      })
      if (!ok) return
    }
    dispatch(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
      {ConfirmDialog}
      {hasExistingBatch && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          An assignment already exists for today. Generating a new one will replace it.
        </div>
      )}
      <Card className="p-6">
        <FormField label="Territory map(s)">
          {territories.length === 0 ? (
            <p className="text-sm text-slate-600">No active territories yet.</p>
          ) : (
            <div className="space-y-2 rounded-lg border border-blue-100 p-3">
              {territories.map((t) => (
                <label key={t.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 text-[#0B1B33]">
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
                  </span>
                  <span className="text-slate-600">{t.approvedCount} approved</span>
                </label>
              ))}
            </div>
          )}
        </FormField>
      </Card>

      {/* Hidden until at least one territory is ticked — nothing here is meaningful without a
          territory selected, and it kept the form looking cluttered/unfinished while empty. */}
      {selected.length > 0 && (
        <Card className="space-y-4 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberStepper label="Publishers going out" value={publisherCount} onChange={setPublisherCount} min={1} max={999} />
            <NumberStepper label="Group size" value={groupSize} onChange={setGroupSize} min={1} max={10} />
          </div>
          {/* Meaningless with zero approved records selected — there's nothing for a per-partnership
              cap to act on, every partnership starts empty regardless of this value. Still submitted
              via the hidden field below at whatever it's currently set to (harmless — calculateAssignment
              has nothing to cap either way), just not shown as a choice the Group Leader needs to make. */}
          {eligibleTotal > 0 && (
            <NumberStepper label="Records per publisher" value={maxPerPartnership} onChange={setMaxPerPartnership} min={1} max={30} />
          )}
          <input type="hidden" name="partnershipCount" value={partnershipCount} />
          <input type="hidden" name="maxPerPartnership" value={maxPerPartnership} />
          <div className="rounded-lg border border-blue-100 bg-[#F8FBFF] p-3 text-sm text-slate-500">
            {eligibleTotal === 0 ? (
              <p>No approved contact records yet in the selected territories — every partnership will start empty.</p>
            ) : (
              <>
                <p className="text-center font-bold text-[#0B1B33]">
                  {partnershipCount} Ministry Partner{partnershipCount === 1 ? '' : 's'}
                </p>
                {leftoverPublishers > 0 && (
                  <p className="mt-1 text-center text-red-600">
                    {leftoverPublishers} publisher{leftoverPublishers === 1 ? '' : 's'} without a Ministry Partner
                  </p>
                )}
                <p className="mt-1 text-center">
                  {recordsToWork} Record{recordsToWork === 1 ? '' : 's'} to be worked on
                </p>
                {hasPartialPartnership && (
                  <p className="mt-1 text-center text-amber-700">
                    1 Ministry Partner will only get {partialRecords} Record{partialRecords === 1 ? '' : 's'} (not {maxPerPartnership})
                  </p>
                )}
                <p className="mt-1 text-center">
                  {recordsRemaining} Record{recordsRemaining === 1 ? '' : 's'} still {recordsRemaining === 1 ? 'needs' : 'need'} to be
                  worked on
                </p>
              </>
            )}
          </div>
          {insufficientForHeadcount && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Only {recordsMaxPartnerships} of {partnershipCount} partnership{partnershipCount === 1 ? '' : 's'} will have
                territory work today — {shortfallPublishers} publisher{shortfallPublishers === 1 ? '' : 's'} should do another
                form of ministry instead (Street Witnessing, Return Visits, Business Witnessing, or other).
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={pending || partnershipCount < 1}
            className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? 'Generating…' : partnershipCount < 1 ? 'Not enough publishers for one Ministry Partner' : 'Generate Assignment'}
          </button>
        </Card>
      )}
    </form>
  )
}
