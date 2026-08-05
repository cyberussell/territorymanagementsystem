'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRightLeft, ChevronDown, ChevronRight, Clock, Home, MapPin, PencilLine, Truck, UserPlus, Users, X } from 'lucide-react'
import type { PartnershipRecordDetail } from '@/lib/territory-management-system/modules/assignment/types'
import type { VisitResult } from '@/lib/territory-management-system/modules/records/types'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import type { SyncQueueItem } from '@/lib/territory-management-system/modules/offline/db'
import { doNotCallUnlockDate, getRecordCardTone, isDoNotCallLocked, VISIT_RESULT_LABELS } from '@/lib/territory-management-system/modules/records/schema'
import VisitHistoryList from '@/components/territory-management-system/VisitHistoryList'
import VisitResultBadge from '@/components/territory-management-system/VisitResultBadge'
import TerritoryMapViewer from '@/components/territory-management-system/TerritoryMapViewer'
import Card from '@/components/territory-management-system/dashboard/Card'
import PublisherVisitLogForm from './PublisherVisitLogForm'
import MoveRecordForm from './MoveRecordForm'
import MarkMovedForm, { type MoveRecommendFields } from './MarkMovedForm'
import RecommendCorrectionForm, { type CorrectionFields } from './RecommendCorrectionForm'
import AddHouseholdMemberForm, { type NewHouseholdMemberPayload } from './AddHouseholdMemberForm'

// Closes one of the mobile Pass/Unlocated/Correction sub-forms, back to the 3-button row —
// overlaid on the sub-form's own Card via the parent's `relative` wrapper rather than sitting as
// a separate line above it, since a plain small-text "‹ Back" link there was hard to notice.
function CloseMobileActionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Close"
      className="absolute right-3 top-3 z-10 rounded-full p-1 text-red-500 transition hover:bg-red-50"
    >
      <X className="h-5 w-5" />
    </button>
  )
}

// Device-local calendar-day comparison (matches how every date in this component and
// VisitHistoryList is already displayed — no server/congregation timezone is plumbed through
// to the publisher workspace). Used to decide whether the latest visit is "today's" submission.
function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11-13 -> "11th"/"12th"/"13th" (the standard
// English ordinal-suffix exception for the teens).
function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

// Status tone — this is the ONLY place status coloring shows now (Russell: card list stays
// all-white, this single-record detail card is where it "only changes when they are in the
// actual record card"). Tints the whole detail card (bg + border); the address icon stays a
// fixed neutral white/blue circle so it doesn't disappear against a same-hue tinted card.
// Exact hex values from Russell, not Tailwind's palette. Text color per tone picked by actual
// WCAG contrast ratio against each background, not eyeballed —
// #4a6da7 is dark enough for white (5.2:1) but #799fcc/#e59797/#dadad9 are all too light for
// white (2.3–2.8:1, fails AA) and need dark navy instead (7.6–15:1). Border is each background
// darkened ~20% for a bit of edge definition against the page background.
function cardTone(doNotCall: boolean, latestResult: string | undefined) {
  switch (getRecordCardTone(doNotCall, latestResult)) {
    case 'do_not_call':
      return { container: 'border-[#b77979] bg-[#e59797]', primary: 'text-[#0B1B33]', secondary: 'text-[#0B1B33]/70' }
    case 'potential_bible_study':
      return { container: 'border-[#617fa3] bg-[#799fcc]', primary: 'text-[#0B1B33]', secondary: 'text-[#0B1B33]/70' }
    case 'bible_study':
      return { container: 'border-[#3b5786] bg-[#4a6da7]', primary: 'text-white', secondary: 'text-white/80' }
    case 'moved':
      return { container: 'border-amber-300 bg-amber-50', primary: 'text-[#0B1B33]', secondary: 'text-slate-500' }
    default:
      return { container: 'border-[#aeaeae] bg-[#dadad9]', primary: 'text-[#0B1B33]', secondary: 'text-[#0B1B33]/70' }
  }
}

export default function PublisherRecordDetailView({
  assigned,
  onBack,
  pendingVisits,
  readOnly,
  sessionEnded,
  saving,
  siblingPartnerships,
  householdRecords,
  onSelectHouseholdRecord,
  moving,
  markingMoved,
  recommendingCorrection,
  territories,
  mapUrl,
  onLogVisit,
  onMoveRecord,
  onRecommendMove,
  onRecommendRemoval,
  onRecommendCorrection,
  onAddSibling,
  onAddHouseholdMember,
}: {
  assigned: PartnershipRecordDetail
  // The header row's back arrow — always just returns to the assigned-records list, same
  // destination as returnToList() everywhere else in the workspace.
  onBack: () => void
  pendingVisits: SyncQueueItem[]
  // True while viewing another Ministry Partner's assignment from this device — address,
  // badges, and full visit history still show, but there's nothing here to log or edit.
  readOnly: boolean
  // True once this partnership's own ministry session has ended (finished normally or ended
  // early) — same "viewable, not editable" treatment as readOnly, but for your own session
  // rather than someone else's.
  sessionEnded: boolean
  // True while a just-submitted visit is being saved/synced — disables the form and shows a
  // spinner so a slow connection doesn't look like a missed tap.
  saving: boolean
  siblingPartnerships: { id: string; name: string; batchLabel: string }[]
  // Other records assigned to this partnership sharing this record's Plus Code — "other people
  // at this address," not to be confused with siblingPartnerships above (other Ministry
  // Partners). Empty when this record's Plus Code is blank or no other assigned record matches
  // it. Drives the "N at this address" disclosure below, MarkMovedForm's record picker, and the
  // "+ Add Another Person Here" button.
  householdRecords: { id: string; label: string; latestResult: VisitResult | null }[]
  // Jumps the workspace to another household member's own detail view — see the "N contact
  // records at this address" disclosure below. Plain navigation, not a mutation, so it's
  // available even on the read-only/other-partner's-assignment view.
  onSelectHouseholdRecord: (recordId: string) => void
  moving: boolean
  // True while either "Mark as Moved" path (Suggest New Location / Recommend for Admin
  // Removal) is being saved/synced.
  markingMoved: boolean
  // True while the "Correction" (Recommend a Correction) form is being saved/synced.
  recommendingCorrection: boolean
  // Every congregation territory (not just this record's own), for RecommendCorrectionForm's and
  // MarkMovedForm's Barangay pickers — a correction or a move recommendation can both relocate a
  // record into a different barangay entirely, not just a different Section/Block within its own.
  territories: TerritoryStructure[]
  // The record's own territory map — resolved by the parent (preferring an offline-cached
  // blob over the live URL, same as the workspace list view's Territory Map(s) section).
  // Undefined/empty when the territory has no map uploaded, or hasn't been resolved yet.
  mapUrl?: string
  onLogVisit: (visitedAt: string, result: string, notes: string) => void
  onMoveRecord: (destinationPartnershipId: string) => void
  // "Suggest New Location" — review-gated, see MarkMovedForm.
  onRecommendMove: (fields: MoveRecommendFields) => void
  // recordId defaults to this record's own id, but can be any entry from householdRecords —
  // see MarkMovedForm's record picker.
  onRecommendRemoval: (reason: string, recordId: string) => void
  onRecommendCorrection: (fields: CorrectionFields) => void
  onAddSibling: () => void
  // Mobile-only inline path for "Add Person" — same underlying add-a-household-member action as
  // onAddSibling, but submits from right here instead of navigating to a separate view, matching
  // how Pass/Unlocated/Correction behave on mobile.
  onAddHouseholdMember: (payload: NewHouseholdMemberPayload) => void
}) {
  const mapsUrl = assigned.record.plus_code
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(assigned.record.plus_code)}`
    : null
  const latestResult = assigned.visits[0]?.result
  const editable = !readOnly && !sessionEnded
  // Mobile only (see the sm:hidden/hidden sm:block split below) — desktop has room to show both
  // "Pass to Another Partner" and "Mark as Moved" fully expanded at once, but on a phone that's
  // a lot of scrolling past two big cards to reach Record a Visit. Collapsed behind a two-button
  // row instead; tapping one reveals its panel in place of the row.
  const [mobileAction, setMobileAction] = useState<'none' | 'move' | 'moved' | 'correction' | 'addPerson'>('none')
  const [householdOpen, setHouseholdOpen] = useState(false)
  const movedFields = {
    address: assigned.record.address,
    unit: assigned.record.unit,
    residentName: assigned.record.resident_name,
    plusCode: assigned.record.plus_code ?? '',
    householdMembers: assigned.record.household_members != null ? String(assigned.record.household_members) : '',
    notes: assigned.record.notes,
  }

  const tone = cardTone(assigned.record.do_not_call, latestResult)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#0B1B33] transition hover:bg-black/5"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="min-w-0 flex-1 truncate font-semibold text-[#0B1B33]">{ordinal(assigned.sequence)} record to visit</h1>
        <VisitResultBadge result={assigned.visits[0]?.result ?? 'initial_visit'} />
      </div>

      <div
        className={`rounded-2xl border p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)] ${tone.container}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/90 shadow-sm">
            <Home className="h-5 w-5 text-[#2563EB]" />
          </div>
          <div className="min-w-0 flex-1">
            {/* Hierarchy: Resident Name first (biggest/boldest — who this record is about),
                then Section/Block, then Address (if any), then Plus Code. Read-only viewers
                (someone else's assignment) never see the map icons below — bumped up a size
                here to fill that space rather than leave it looking sparse. */}
            <h2 className={`truncate font-semibold ${readOnly ? 'text-lg' : ''} ${tone.primary}`}>
              {assigned.record.resident_name || assigned.record.address || assigned.record.plus_code || 'Unlabeled record'}
            </h2>
            <p className={`mt-0.5 truncate ${readOnly ? 'text-base' : 'text-sm'} ${tone.secondary}`}>
              Sec {assigned.record.section?.label ?? '—'} / Blk {assigned.record.block?.label ?? '—'}
            </p>
            {/* Address/Plus Code only get their own line when they're not already doing double
                duty as the h2 above (i.e. whenever a Resident Name — or, for Plus Code, an
                Address too — pushed them out of the title spot). */}
            {assigned.record.address && assigned.record.resident_name && (
              <p className={`mt-0.5 truncate ${readOnly ? 'text-base' : 'text-sm'} ${tone.secondary}`}>
                {assigned.record.address}
                {assigned.record.unit ? `, ${assigned.record.unit}` : ''}
              </p>
            )}
            {assigned.record.plus_code && (assigned.record.resident_name || assigned.record.address) && (
              <p className={`mt-0.5 truncate ${readOnly ? 'text-base' : 'text-sm'} ${tone.secondary}`}>{assigned.record.plus_code}</p>
            )}
            {(assigned.record.household_members != null || householdRecords.length > 0) && (
              <div className={`mt-1.5 flex flex-nowrap items-center gap-1.5 text-sm ${tone.secondary}`}>
                {assigned.record.household_members != null && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {assigned.record.household_members} household{assigned.record.household_members === 1 ? '' : 's'}
                  </span>
                )}
                {assigned.record.household_members != null && householdRecords.length > 0 && (
                  <span aria-hidden="true">·</span>
                )}
                {householdRecords.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHouseholdOpen((o) => !o)}
                    aria-expanded={householdOpen}
                    className={`flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline ${tone.primary}`}
                  >
                    <Users className="h-3.5 w-3.5" />
                    {householdRecords.length + 1} linked contacts
                    {householdOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            )}
            {householdOpen && householdRecords.length > 0 && (
              <div className="mt-2 space-y-1 rounded-lg bg-[#F8FBFF] p-1.5">
                {householdRecords.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => onSelectHouseholdRecord(h.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[#0B1B33] transition hover:bg-white"
                  >
                    <span className="truncate">{h.label}</span>
                    <VisitResultBadge result={h.latestResult ?? 'initial_visit'} />
                  </button>
                ))}
              </div>
            )}
            {assigned.record.do_not_call && (
              <p className="mt-2 text-sm font-medium text-red-600">
                Do Not Call
                {isDoNotCallLocked(assigned.record.do_not_call, assigned.record.do_not_call_at) && assigned.record.do_not_call_at && (
                  <span className="ml-1 font-normal text-red-500/80">
                    — locked until{' '}
                    {doNotCallUnlockDate(assigned.record.do_not_call_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </p>
            )}
            {assigned.passed_from_name && (
              <p className="mt-2 text-sm font-medium text-[#2563EB]">
                Passed by {assigned.passed_from_name}
                {assigned.passed_from_at ? ` on ${new Date(assigned.passed_from_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
              </p>
            )}
          </div>
        </div>

        {/* Bigger, well-separated, icon-only touch targets in the corner rather than full-width
            labeled buttons — easier for a less phone-dexterous publisher to tap accurately.
            Notes intentionally don't appear on this card anymore — a visit's own notes still
            show per-entry in Visit History below. Hidden entirely for a read-only viewer (someone
            else's assignment) — a "viewer" shouldn't have a way to navigate to a record that
            isn't theirs, map or otherwise. */}
        {!readOnly && (mapsUrl || mapUrl) && (
          <div className="mt-4 flex justify-end gap-3">
            {mapUrl && (
              <TerritoryMapViewer mapImageUrl={mapUrl} territoryName={assigned.record.territory?.name ?? 'Territory'} variant="icon" />
            )}
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open in Google Maps"
                title="Open in Google Maps"
                className="flex h-14 w-14 items-center justify-center rounded-full border border-blue-100 bg-white text-[#2563EB] shadow-sm transition hover:border-[#38BDF8]/40 hover:bg-blue-50"
              >
                <MapPin className="h-6 w-6" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Desktop/tablet only — on mobile this is folded into the grouped Pass/Unlocated/
          Correction/Add Person panel below instead of sitting as its own separate button. */}
      {editable && (
        <button
          type="button"
          onClick={onAddSibling}
          className="hidden w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 sm:flex"
        >
          <UserPlus className="h-4 w-4" />
          Add Another Person Here
        </button>
      )}

      {editable && (
        <>
          {/* Desktop/tablet: all forms fully expanded, plenty of room. Pass to Another Partner
              only makes sense before any visit has been logged yet — once a status is already on
              record, Unlocated/Correction/Add Person all stay available so a publisher can keep
              editing/appending to what's already there, but passing an already-worked record to
              someone else no longer makes sense. */}
          <div className="hidden space-y-6 sm:block">
            {!assigned.completed_at && <MoveRecordForm siblingPartnerships={siblingPartnerships} moving={moving} onMove={onMoveRecord} />}
            <MarkMovedForm
              initial={movedFields}
              submitting={markingMoved}
              onRecommendMove={onRecommendMove}
              onRecommend={onRecommendRemoval}
              currentRecordId={assigned.record.id}
              currentRecordLabel={assigned.record.resident_name || assigned.record.address || 'this record'}
              householdRecords={householdRecords}
            />
            <RecommendCorrectionForm
              currentPlusCode={assigned.record.plus_code ?? ''}
              currentTerritoryId={assigned.record.territory_id}
              currentSectionId={assigned.record.section_id}
              currentBlockId={assigned.record.block_id}
              currentHouseholdMembers={assigned.record.household_members}
              currentResidentName={assigned.record.resident_name}
              territories={territories}
              submitting={recommendingCorrection}
              onSubmit={onRecommendCorrection}
            />
          </div>

          {/* Mobile: collapsed behind a button row (one shared panel, not separate floating
              buttons) until one is tapped — Pass is only included once the record hasn't been
              logged yet, same reasoning as desktop above. */}
          <div className="sm:hidden">
            {mobileAction === 'none' && (
              <Card className="overflow-hidden p-0">
                <div className={`grid divide-x divide-gray-100 ${assigned.completed_at ? 'grid-cols-3' : 'grid-cols-4'}`}>
                  {/* Each action gets its own bold, distinct color against the white card — all
                      four used to share the same blue, making them hard to tell apart at a
                      glance. */}
                  {!assigned.completed_at && (
                    <button
                      type="button"
                      onClick={() => setMobileAction('move')}
                      className="flex flex-col items-center justify-center gap-1.5 py-3 text-xs font-semibold text-[#2563EB] transition hover:bg-blue-50"
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                      Pass
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMobileAction('moved')}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-50"
                  >
                    <Truck className="h-4 w-4" />
                    Unlocated
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileAction('correction')}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-50"
                  >
                    <PencilLine className="h-4 w-4" />
                    Correction
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileAction('addPerson')}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <UserPlus className="h-4 w-4" />
                    Add Person
                  </button>
                </div>
              </Card>
            )}
            {mobileAction === 'move' && !assigned.completed_at && (
              <div className="relative">
                <CloseMobileActionButton onClick={() => setMobileAction('none')} />
                <MoveRecordForm siblingPartnerships={siblingPartnerships} moving={moving} onMove={onMoveRecord} />
              </div>
            )}
            {mobileAction === 'moved' && (
              <div className="relative">
                <CloseMobileActionButton onClick={() => setMobileAction('none')} />
                <MarkMovedForm
                  initialMode="choose"
                  initial={movedFields}
                  submitting={markingMoved}
                  onRecommendMove={onRecommendMove}
                  onRecommend={onRecommendRemoval}
                  currentRecordId={assigned.record.id}
                  currentRecordLabel={assigned.record.resident_name || assigned.record.address || 'this record'}
                  householdRecords={householdRecords}
                />
              </div>
            )}
            {mobileAction === 'correction' && (
              <div className="relative">
                <CloseMobileActionButton onClick={() => setMobileAction('none')} />
                <RecommendCorrectionForm
                  currentPlusCode={assigned.record.plus_code ?? ''}
                  currentTerritoryId={assigned.record.territory_id}
                  currentSectionId={assigned.record.section_id}
                  currentBlockId={assigned.record.block_id}
                  currentHouseholdMembers={assigned.record.household_members}
                  currentResidentName={assigned.record.resident_name}
                  territories={territories}
                  submitting={recommendingCorrection}
                  onSubmit={onRecommendCorrection}
                  initialOpen
                />
              </div>
            )}
            {mobileAction === 'addPerson' && (
              <div className="relative">
                <CloseMobileActionButton onClick={() => setMobileAction('none')} />
                <AddHouseholdMemberForm
                  address={assigned.record.address || assigned.record.plus_code || 'this address'}
                  onSubmit={(payload) => {
                    onAddHouseholdMember(payload)
                    setMobileAction('none')
                  }}
                  onCancel={() => setMobileAction('none')}
                />
              </div>
            )}
          </div>
        </>
      )}

      {editable && (
        <div id="record-a-visit-form">
          <PublisherVisitLogForm
            latestResult={latestResult}
            latestVisitNotes={assigned.visits[0]?.notes}
            doNotCall={assigned.record.do_not_call}
            doNotCallAt={assigned.record.do_not_call_at}
            saving={saving}
            onLogVisit={onLogVisit}
          />
        </div>
      )}

      {!readOnly && pendingVisits.length > 0 && (
        <div>
          <h2 className="mb-3 font-semibold text-[#0B1B33]">Pending Sync</h2>
          <div className="space-y-2">
            {pendingVisits.map((v) => (
              <Card key={v.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#0B1B33]">
                    {VISIT_RESULT_LABELS[v.payload.result as keyof typeof VISIT_RESULT_LABELS] ?? v.payload.result}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      v.status === 'failed' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {v.status === 'failed' ? 'Failed' : 'Queued'}
                  </span>
                </div>
                {v.payload.notes && <p className="mt-1 text-sm text-slate-500">{v.payload.notes}</p>}
                {v.error && <p className="mt-1 text-xs text-red-500">{v.error}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {(assigned.record.move_recommended_at || assigned.record.correction_recommended_at || assigned.record.removal_recommended_at) && (
        <div className="space-y-2">
          {assigned.record.move_recommended_at && (
            <Card className="border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-amber-700">Move recommended — pending Admin approval</p>
                  <p className="mt-0.5 text-slate-600">
                    New address: <span className="font-medium text-[#0B1B33]">{assigned.record.move_recommended_address}</span>
                    {assigned.record.move_recommended_plus_code && ` · ${assigned.record.move_recommended_plus_code}`}
                  </p>
                  {assigned.record.move_territory && (
                    <p className="mt-0.5 text-slate-600">
                      New barangay:{' '}
                      <span className="font-medium text-[#0B1B33]">
                        {assigned.record.move_territory.description || assigned.record.move_territory.name}
                        {assigned.record.move_section ? ` / Section ${assigned.record.move_section.label}` : ''}
                        {assigned.record.move_block ? ` / Block ${assigned.record.move_block.label}` : ''}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}
          {assigned.record.correction_recommended_at && (
            <Card className="border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-amber-700">Correction recommended — pending Admin approval</p>
                  {assigned.record.correction_territory && (
                    <p className="mt-0.5 text-slate-600">
                      New barangay:{' '}
                      <span className="font-medium text-[#0B1B33]">
                        {assigned.record.correction_territory.description || assigned.record.correction_territory.name}
                        {assigned.record.correction_section ? ` / Section ${assigned.record.correction_section.label}` : ''}
                        {assigned.record.correction_block ? ` / Block ${assigned.record.correction_block.label}` : ''}
                      </span>
                    </p>
                  )}
                  {assigned.record.correction_recommended_reason && (
                    <p className="mt-0.5 text-slate-600">{assigned.record.correction_recommended_reason}</p>
                  )}
                </div>
              </div>
            </Card>
          )}
          {assigned.record.removal_recommended_at && (
            <Card className="border-red-200 bg-red-50 p-3">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-red-600">Removal recommended — pending Admin approval</p>
                  {assigned.record.removal_recommended_reason && (
                    <p className="mt-0.5 text-slate-600">{assigned.record.removal_recommended_reason}</p>
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {assigned.visits[0] && isSameCalendarDay(new Date(assigned.visits[0].visited_at), new Date()) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">What you submitted</p>
            <p className="text-xs text-amber-700/80">
              {new Date(assigned.visits[0].visited_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          </div>
          <p className="mt-1 text-sm font-medium text-[#0B1B33]">{VISIT_RESULT_LABELS[assigned.visits[0].result]}</p>
          {assigned.visits[0].notes && <p className="mt-1 text-sm text-[#0B1B33]/80">{assigned.visits[0].notes}</p>}
        </div>
      )}

      <div>
        <h2 className="mb-3 font-semibold text-[#0B1B33]">Visit History</h2>
        <VisitHistoryList visits={assigned.visits} />
      </div>
    </div>
  )
}
