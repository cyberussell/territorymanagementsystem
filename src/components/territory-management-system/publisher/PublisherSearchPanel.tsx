'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { RefreshCw, Search as SearchIcon } from 'lucide-react'
import type { IncomingRecordTransferRequest, RecordSearchResult } from '@/lib/territory-management-system/modules/assignment/types'
import {
  claimUnassignedRecordAction,
  listIncomingRecordTransferRequestsAction,
  requestRecordTransferAction,
  respondToRecordTransferRequestAction,
  searchTodaysRecordsAction,
} from '@/app/tms/actions/publisher'
import { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'
import ConfirmModal from '@/components/territory-management-system/ConfirmModal'

// Congregation-wide search across every one of today's batches (House To House + every
// Auxiliary/overflow one) — a Ministry Partner can find any of today's assigned record contacts,
// see who currently has it (or that it's unassigned today), and ask the current holder for it
// instead of an instant "Pass." The holder must approve before it actually transfers — see
// resolveRecordTransferRequest. An Auxiliary/overflow partnership can never successfully ask for
// a record held by a House To House one (enforced server-side in requestRecordTransferAction;
// the "Ask" button here is disabled/explained for that same case as a UI-level reflection of it,
// not the real gate).
export default function PublisherSearchPanel({
  partnershipToken,
  isOverflow,
  incomingRequests,
  onIncomingRequestsChange,
}: {
  partnershipToken: string
  isOverflow: boolean
  incomingRequests: IncomingRecordTransferRequest[]
  onIncomingRequestsChange: (requests: IncomingRecordTransferRequest[]) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<RecordSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [askConfirmFor, setAskConfirmFor] = useState<RecordSearchResult | null>(null)
  const [asking, setAsking] = useState(false)
  const [claimConfirmFor, setClaimConfirmFor] = useState<RecordSearchResult | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [refreshingIncoming, setRefreshingIncoming] = useState(false)
  const [respondingId, setRespondingId] = useState<string | null>(null)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (query.trim().length < 2) return
    setSearching(true)
    try {
      const found = await searchTodaysRecordsAction(partnershipToken, query)
      setResults(found)
    } finally {
      setSearching(false)
    }
  }

  async function handleAsk() {
    if (!askConfirmFor) return
    setAsking(true)
    try {
      const result = await requestRecordTransferAction(partnershipToken, askConfirmFor.id)
      if (result.error && result.error !== 'SAVED') {
        toast.error(result.error)
      } else {
        toast.success(`Request sent to ${askConfirmFor.assignedTo?.partnershipName ?? 'the Ministry Partner'}.`)
      }
    } finally {
      setAsking(false)
      setAskConfirmFor(null)
    }
  }

  async function handleClaim() {
    if (!claimConfirmFor) return
    setClaiming(true)
    try {
      const result = await claimUnassignedRecordAction(partnershipToken, claimConfirmFor.id)
      if (result.error && result.error !== 'SAVED') {
        toast.error(result.error)
        setClaiming(false)
        setClaimConfirmFor(null)
        return
      }
      // A full reload, not a soft in-app navigation — the workspace only ever reads its records
      // from the initial server-rendered load, so this is the only way the newly-claimed
      // record's full detail (territory/section/block, visit history) actually shows up.
      // ?view=list lands directly on the Assigned Contact Records list, same param
      // BatchLandingBottomMenu already uses to jump straight to a tab on first mount.
      window.location.href = `${window.location.pathname}?view=list`
    } catch (e) {
      setClaiming(false)
      setClaimConfirmFor(null)
      throw e
    }
  }

  async function handleRefreshIncoming() {
    setRefreshingIncoming(true)
    try {
      const requests = await listIncomingRecordTransferRequestsAction(partnershipToken)
      onIncomingRequestsChange(requests)
    } finally {
      setRefreshingIncoming(false)
    }
  }

  async function handleRespond(requestId: string, decision: 'approved' | 'declined') {
    setRespondingId(requestId)
    try {
      const result = await respondToRecordTransferRequestAction(partnershipToken, requestId, decision)
      if (result.error && result.error !== 'SAVED') {
        toast.error(result.error)
      } else {
        toast.success(decision === 'approved' ? 'Record transferred to them.' : 'Request declined.')
        onIncomingRequestsChange(incomingRequests.filter((r) => r.id !== requestId))
      }
    } finally {
      setRespondingId(null)
    }
  }

  // Mirrors the server-side rule in createRecordTransferRequest — a UI reflection, not the real
  // gate (that's enforced again on submit regardless of what this button shows).
  const blockedByGroupType = (r: RecordSearchResult) => isOverflow && r.assignedTo && !r.assignedTo.isOverflow

  return (
    <div className="space-y-6">
      {incomingRequests.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-[#0B1B33]">Incoming Requests</h2>
            <button
              type="button"
              onClick={handleRefreshIncoming}
              disabled={refreshingIncoming}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshingIncoming ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="space-y-2">
            {incomingRequests.map((r) => (
              <Card key={r.id} className="p-3">
                <p className="truncate text-sm font-medium text-[#0B1B33]">{r.residentName || r.address || 'Unlabeled record'}</p>
                <p className="mt-0.5 text-xs text-slate-500">{r.requestingPartnershipName} is asking for this record</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespond(r.id, 'declined')}
                    disabled={respondingId === r.id}
                    className="flex-1 rounded-lg border border-blue-100 bg-white py-1.5 text-xs font-semibold text-slate-500 transition hover:border-[#38BDF8]/40 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(r.id, 'approved')}
                    disabled={respondingId === r.id}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                  >
                    {respondingId === r.id ? 'Working…' : 'Approve'}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-semibold text-[#0B1B33]">Search Today&apos;s Assigned Records</h2>
        <p className="mt-1 text-sm text-slate-500">
          Search by name, address, or Plus Code across every Ministry Partner working today — House To House and Auxiliary Groups alike.
        </p>
        <form onSubmit={handleSearch} className="mt-3 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or address…"
            className={inputClass}
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            <SearchIcon className="h-4 w-4" />
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {results !== null && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <Card className="p-6 text-center text-sm text-slate-600">No matching records found today.</Card>
          ) : (
            results.map((r) => (
              <Card key={r.id} className="p-3">
                <p className="truncate font-medium text-[#0B1B33]">{r.residentName || r.address || 'Unlabeled record'}</p>
                {r.address && r.residentName && <p className="truncate text-xs text-slate-500">{r.address}</p>}
                <p className="truncate text-xs text-slate-400">{r.territoryName}</p>
                {r.assignedTo ? (
                  <>
                    <p className="mt-1 text-xs font-medium text-amber-600">
                      Assigned to {r.assignedTo.partnershipName} ({r.assignedTo.isOverflow ? 'Auxiliary Group' : 'House To House'})
                    </p>
                    {blockedByGroupType(r) ? (
                      <p className="mt-1 text-xs text-slate-400">Auxiliary Groups cannot request House To House records.</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAskConfirmFor(r)}
                        className="mt-2 w-full rounded-lg border border-blue-100 bg-white py-1.5 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40"
                      >
                        Ask for This Record
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-xs font-medium text-emerald-600">Not assigned today</p>
                    <button
                      type="button"
                      onClick={() => setClaimConfirmFor(r)}
                      className="mt-2 w-full rounded-lg border border-emerald-200 bg-white py-1.5 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300"
                    >
                      Add to My List
                    </button>
                  </>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      <ConfirmModal
        open={askConfirmFor !== null}
        title="Ask for this record?"
        message={`Send a request to ${askConfirmFor?.assignedTo?.partnershipName ?? 'the Ministry Partner'} for ${
          askConfirmFor?.residentName || askConfirmFor?.address || 'this record'
        }? They'll need to approve it before it's actually transferred to you.`}
        confirmLabel={asking ? 'Sending…' : 'Send Request'}
        variant="info"
        onConfirm={handleAsk}
        onCancel={() => setAskConfirmFor(null)}
      />

      <ConfirmModal
        open={claimConfirmFor !== null}
        title="Add this record to your list?"
        message={`No one else has ${claimConfirmFor?.residentName || claimConfirmFor?.address || 'this record'} assigned today, so this adds it straight to your list — no approval needed.`}
        confirmLabel={claiming ? 'Adding…' : 'Add to My List'}
        variant="info"
        onConfirm={handleClaim}
        onCancel={() => setClaimConfirmFor(null)}
      />
    </div>
  )
}
