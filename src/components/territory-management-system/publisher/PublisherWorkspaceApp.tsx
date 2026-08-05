'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import { CheckCircle2, ClipboardCopy, CloudOff, Download, PartyPopper, Plus, RefreshCw, X } from 'lucide-react'
import type { PartnershipWithProgress, PartnershipWorkspace } from '@/lib/territory-management-system/modules/assignment/types'
import type { TerritoryRecordWithLocation } from '@/lib/territory-management-system/modules/records/types'
import { isPartnershipAllDone, VISIT_RESULT_LABELS, VISIT_RESULTS } from '@/lib/territory-management-system/modules/records/schema'
import type { VisitResult } from '@/lib/territory-management-system/modules/records/types'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import type { SyncQueueItem } from '@/lib/territory-management-system/modules/offline/db'
import type { RecordLocation } from '@/lib/territory-management-system/modules/reports/queries'
import { downloadAssignment, getLocalMapImageUrl, isDownloaded } from '@/lib/territory-management-system/modules/offline/download'
import { enqueue, listQueue } from '@/lib/territory-management-system/modules/offline/queue'
import { flushQueue } from '@/lib/territory-management-system/modules/offline/sync'
import { useOnlineStatus } from '@/lib/territory-management-system/modules/offline/useOnlineStatus'
import { useRouter } from 'next/navigation'
import {
  clearClaimedPartnershipToken,
  getClaimedPartnershipToken,
  setClaimedPartnershipToken,
} from '@/lib/territory-management-system/modules/offline/claim'
import { chooseSearchScopeAction, getBatchPartnersAction, getSearchScopeRecordsAction } from '@/app/tms/actions/publisher'
import TerritoryMapViewer from '@/components/territory-management-system/TerritoryMapViewer'
import VisitResultPieChart from '@/components/territory-management-system/VisitResultPieChart'
import Card from '@/components/territory-management-system/dashboard/Card'
import PublisherBottomMenu from './PublisherBottomMenu'
import PublisherStatusHelp from './PublisherStatusHelp'
import PublisherFAQ from './PublisherFAQ'
import ConfirmModal from '@/components/territory-management-system/ConfirmModal'
import PartnershipRenameForm from './PartnershipRenameForm'
import PublisherQuickNoteForm, { type QuickNoteFields } from './PublisherQuickNoteForm'
import PublisherSearchPanel from './PublisherSearchPanel'
import SharePartnershipCard from './SharePartnershipCard'
import ChooseSearchScopeForm from './ChooseSearchScopeForm'
import AssignedRecordsList from './AssignedRecordsList'
import AddedRecordsList from './AddedRecordsList'
import PublisherRecordDetailView from './PublisherRecordDetailView'
import type { CorrectionFields } from './RecommendCorrectionForm'
import PublisherAddedRecordDetailView from './PublisherAddedRecordDetailView'
import PublisherRecordForm, { type NewPublisherRecordPayload } from './PublisherRecordForm'
import AddHouseholdMemberForm, { type NewHouseholdMemberPayload } from './AddHouseholdMemberForm'
import PublisherNoteForm from './PublisherNoteForm'
import SearchScopeRecordsList from './SearchScopeRecordsList'
import PartnerStatusList from './PartnerStatusList'
import SearchScopeSummaryCard from './SearchScopeSummaryCard'

// Leaflet touches `window`/`document` on import — client-only, same pattern as the Admin
// Reports page's own use of this same component.
const HouseholdDistributionMap = dynamic(() => import('@/components/territory-management-system/HouseholdDistributionMap'), {
  ssr: false,
  loading: () => (
    <Card className="p-10 text-center">
      <p className="text-sm text-slate-600">Loading map…</p>
    </Card>
  ),
})

// Friendly label for a queued sync item, used to show the publisher (or whoever they show their
// screen to) *what* failed, alongside its captured error, instead of just a bare count.
const QUEUE_ITEM_TYPE_LABELS: Record<SyncQueueItem['type'], string> = {
  rename: 'Rename partnership',
  visit: 'Visit',
  addRecord: 'Add contact record',
  terminate: 'End ministry early',
  moveRecord: 'Pass record to another partner',
  note: 'Note to Group Leader',
  updateRecord: 'Update contact record',
  recommendRemoval: 'Recommend for removal',
  finish: 'Finish',
  deleteAddedRecord: 'Delete added record',
  editAddedRecord: 'Edit added record',
  recommendCorrection: 'Recommend a correction',
  recommendSearchScopeCorrection: 'Recommend a correction',
  recommendMove: 'Recommend new location',
  quickNote: 'Quick note to Admin',
}

function describeQueueItem(item: SyncQueueItem): string {
  if (item.type === 'visit' && item.payload.result) {
    const label = VISIT_RESULT_LABELS[item.payload.result as keyof typeof VISIT_RESULT_LABELS]
    return label ? `Visit: ${label}` : QUEUE_ITEM_TYPE_LABELS.visit
  }
  return QUEUE_ITEM_TYPE_LABELS[item.type] ?? item.type
}

// Plain-text summary of everything still failing to sync — the cheap version of an admin
// override: there's no server-side visibility into a stuck client-side queue item (it never
// reached the server to be logged anywhere), so the publisher copies this and sends it to their
// Group Leader/Admin directly (Messenger, etc.), who then re-enters it manually through the
// existing Admin pages. Good enough for the actual failure mode here — poor connectivity in the
// field, not a systemic bug — a real server-side "Sync Issues" admin page would be the next step
// up if this starts happening often enough to justify it.
function buildFailedSyncReport(items: SyncQueueItem[], partnerName: string): string {
  const lines = [`Sync issues — ${partnerName || 'Ministry Partner'} — ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, '']
  for (const item of items) {
    lines.push(`• ${describeQueueItem(item)}`)
    lines.push(`  Error: ${item.error ?? 'Sync failed.'}`)
  }
  return lines.join('\n')
}

type View =
  | { name: 'home' }
  | { name: 'partners' }
  | { name: 'search' }
  | { name: 'list' }
  | { name: 'detail'; recordId: string }
  // prefill + returnToRecordId are both set when reached via "+ Add Another Person Here" on a
  // detail view — prefill carries the current record's territory/section/block/address/Plus
  // Code so a second household member doesn't need to be retyped, and its presence is what picks
  // the lightweight AddHouseholdMemberForm over the full PublisherRecordForm below.
  // returnToRecordId sends the publisher back to the record they came from on submit/cancel
  // instead of "My Added Records". Both undefined for the plain "My Added Records" entry point,
  // which still starts blank and lands on "My Added Records" afterward as before.
  | { name: 'addRecord'; prefill?: Partial<NewPublisherRecordPayload>; returnToRecordId?: string }
  | { name: 'addQuickNote' }
  | { name: 'addedRecords' }
  | { name: 'addedRecordDetail'; recordId: string }
  | { name: 'editAddedRecord'; recordId: string }
  | { name: 'note' }
  | { name: 'sync' }
  | { name: 'done' }

// The offline-first app shell: everything after the initial server-rendered load happens as
// in-memory view-state changes here, never a new Next.js page navigation — that's what makes
// the rest of the day's session work with zero network once this has mounted once online.
export default function PublisherWorkspaceApp({
  batchToken,
  partnershipToken,
  initialWorkspace,
  territoryStructures,
  initialView = 'home',
}: {
  batchToken: string
  partnershipToken: string
  initialWorkspace: PartnershipWorkspace
  territoryStructures: TerritoryStructure[]
  // Which tab to land on for this initial mount only — the batch-landing page's nav bar links
  // straight into a specific tab (see BatchLandingBottomMenu's ?view= query param) since there's
  // no other way to reach anything but Home from a fresh navigation. Never consulted again after
  // mount; all navigation from here on is the in-memory setView calls below.
  initialView?: 'home' | 'list' | 'addedRecords'
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [view, setView] = useState<View>({ name: initialView } as View)
  const [downloaded, setDownloaded] = useState(false)
  const [savingVisit, setSavingVisit] = useState(false)
  const [movingRecord, setMovingRecord] = useState(false)
  const [sendingNote, setSendingNote] = useState(false)
  const [sendingQuickNote, setSendingQuickNote] = useState(false)
  const [markingMoved, setMarkingMoved] = useState(false)
  const [recommendingCorrection, setRecommendingCorrection] = useState(false)
  const [refreshingSearchScope, setRefreshingSearchScope] = useState(false)
  const [refreshingPartners, setRefreshingPartners] = useState(false)
  // Shared by the Home/List "Refresh" buttons (see handleFullRefresh) — only one is ever on
  // screen at a time, since they belong to different tabs.
  const [fullRefreshing, setFullRefreshing] = useState(false)
  const [choosingSearchScope, setChoosingSearchScope] = useState(false)
  const [searchScopeChoiceError, setSearchScopeChoiceError] = useState('')
  const [deletingAddedRecord, setDeletingAddedRecord] = useState(false)
  const [queue, setQueue] = useState<SyncQueueItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [mapUrls, setMapUrls] = useState<Record<string, string>>({})
  // Which map the list view shows when both are available — a toggle instead of stacking both
  // maps, for a cleaner one-screen-at-a-time look. Defaults to Territory Map (the prior default
  // visual order).
  const [mapView, setMapView] = useState<'territory' | 'records' | 'search' | 'summary' | 'share' | 'help' | 'faq'>('territory')
  // Which branded confirm dialog (see ConfirmModal) is currently open, replacing
  // window.confirm() — its "www.cyberussell.com says" chrome reads as an unfamiliar browser
  // warning to a publisher in the field, not a TMS-branded prompt. Release still goes through
  // ReleaseAssignmentSlider's own SlideToConfirm drag gesture; ending ministry (early or once
  // all records are done) used to as well but was switched to this same modal below — a
  // completion-aware label needed a real button to hang the label off of, and a slide gesture
  // was hiding the "missing" Save-button-style bug pattern behind an unfamiliar interaction.
  const [confirmDialog, setConfirmDialog] = useState<
    { type: 'deleteAddedRecord'; recordId: string } | { type: 'endMinistry' } | { type: 'endMinistryEarly' } | null
  >(null)
  const online = useOnlineStatus()
  const router = useRouter()
  // Several call sites can each decide "we're online, sync now" in quick succession (a form
  // submit's own trigger, plus the reconnect effect) — without this, two overlapping
  // flushQueue() runs could both pick up the same still-queued item and submit it twice. A
  // ref survives across renders without retriggering effects, unlike state.
  const syncingRef = useRef(false)

  // Which ONE partnership this device is bound to for today's batch — resolved synchronously
  // from localStorage on first render (a lazy initializer, not an effect) so a device that's
  // already bound elsewhere renders read-only immediately, with no flash of full editing access.
  const [deviceClaim, setDeviceClaim] = useState<string | null>(() =>
    typeof window !== 'undefined' ? getClaimedPartnershipToken(batchToken) : null
  )
  // A device with no claim yet, opening a partnership someone else in the pair already named,
  // is joining it — not claiming a second one — so it silently binds here too.
  useEffect(() => {
    if (deviceClaim) return
    if (initialWorkspace.claimed_at) {
      setClaimedPartnershipToken(batchToken, partnershipToken)
      setDeviceClaim(partnershipToken)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const readOnly = deviceClaim !== null && deviceClaim !== partnershipToken
  // Once this partnership's own ministry session has ended (normally finished or ended early),
  // the record detail view stays fully viewable (address, map, visit history) but the editing
  // controls (Record a Visit, Mark as Moved, Pass to Another Partner) go away — there's nothing
  // left to log for the day.
  const sessionEnded = Boolean(workspace.finished_at || workspace.ended_early_at)
  // Same rule PublisherRecordDetailView applies internally for assigned records — reused here
  // to gate the "Add a New Contact Record" button and the added-records Edit/Delete actions.
  const editable = !readOnly && !sessionEnded

  const refreshQueue = useCallback(async () => {
    setQueue(await listQueue(partnershipToken))
  }, [partnershipToken])

  useEffect(() => {
    isDownloaded(partnershipToken).then(setDownloaded)
    refreshQueue()
  }, [partnershipToken, refreshQueue])

  // Prefer a locally cached map blob (works offline, and skips a refetch even when online);
  // fall back to the live URL until a download has happened. Keyed off the territory ids
  // themselves (not the array reference, which changes on every workspace update) so this
  // doesn't re-run — and re-create + leak blob URLs — on every unrelated state change.
  const territoryIdsKey = workspace.territories.map((t) => t.id).join(',')
  useEffect(() => {
    let cancelled = false
    const createdUrls: string[] = []

    async function resolveMaps() {
      const entries = await Promise.all(
        workspace.territories.map(async (t) => {
          const local = await getLocalMapImageUrl(t.id)
          if (local) createdUrls.push(local)
          return [t.id, local ?? t.map_image_url ?? ''] as const
        })
      )
      if (!cancelled) setMapUrls(Object.fromEntries(entries.filter(([, url]) => url)))
    }
    resolveMaps()

    return () => {
      cancelled = true
      createdUrls.forEach((url) => URL.revokeObjectURL(url))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [territoryIdsKey])

  const handleSync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true)
    try {
      const result = await flushQueue(partnershipToken)
      await refreshQueue()
      if (result.synced > 0) toast.success(`${result.synced} item(s) synced.`)
      if (result.failed > 0) toast.error(`${result.failed} item(s) failed to sync — see the pending list below.`)
      // result.stillPending (a connectivity blip, not a rejection) is deliberately silent —
      // it'll retry automatically next time, no need to alarm the publisher over it.
    } finally {
      syncingRef.current = false
      setSyncing(false)
    }
  }, [partnershipToken, refreshQueue])

  // Automatic synchronization the moment connectivity returns.
  useEffect(() => {
    if (online) {
      listQueue(partnershipToken).then((items) => {
        if (items.some((i) => i.status === 'pending')) handleSync()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])

  const pendingCount = queue.filter((q) => q.status === 'pending' || q.status === 'syncing').length
  const failedCount = queue.filter((q) => q.status === 'failed').length

  async function handleCopyFailedReport() {
    const report = buildFailedSyncReport(
      queue.filter((q) => q.status === 'failed'),
      workspace.name
    )
    try {
      await navigator.clipboard.writeText(report)
      toast.success('Copied — send this to your Group Leader.')
    } catch {
      toast.error('Could not copy — please screenshot this screen instead.')
    }
  }

  // Once on the Sync screen, the moment nothing is left pending or failed, the session is done.
  useEffect(() => {
    if (view.name === 'sync' && pendingCount === 0 && failedCount === 0) setView({ name: 'done' })
  }, [view.name, pendingCount, failedCount])

  async function handleDownload() {
    await downloadAssignment(partnershipToken, workspace)
    setDownloaded(true)
    toast.success('Downloaded — ready for offline use.')
  }

  // Fixes a real "stuck" bug: a device with no local claim yet silently binds itself to
  // WHATEVER partnership it opens that's already claimed_at (see the mount effect below — meant
  // for a real pair's second phone joining the same partnership), with no in-workspace way back
  // to "Select Ministry Partner Number" if that was actually the wrong card tapped by mistake.
  // Deliberately only clears THIS device's own local binding (clearClaimedPartnershipToken) —
  // never the partnership's server-side claimed_at/name, so a real pair's in-progress session
  // stays completely untouched if this was them. The batch-landing page's own
  // ReleaseAssignmentSlider (zero-completed-records eligibility) remains the only way to reset
  // the server-side claim itself, unchanged by this.
  function handleSwitchPartner() {
    clearClaimedPartnershipToken(batchToken)
    router.push(`/tms/assignment/${batchToken}`)
  }

  async function handleRename(name: string) {
    const claiming = !workspace.claimed_at
    setWorkspace((w) => ({ ...w, name, claimed_at: w.claimed_at ?? new Date().toISOString() }))
    if (claiming) {
      setClaimedPartnershipToken(batchToken, partnershipToken)
      setDeviceClaim(partnershipToken)
      // First-time claim lands on the records list (what they're here to do) instead of
      // staying on Home — a later rename (editing an already-claimed name) doesn't navigate.
      setView({ name: 'list' })
    }
    await enqueue(partnershipToken, 'rename', { partnershipToken, name })
    await refreshQueue()
    if (online) handleSync()
  }

  async function handleLogVisit(recordId: string, visitedAt: string, result: string, notes: string) {
    setSavingVisit(true)
    try {
      // Prepends an optimistic visit row (not just completed_at) — myResultCounts below and
      // VisitHistoryList both read r.visits[0], and handleSync never refetches the workspace
      // from the server, so without this the just-logged result (e.g. "Busy") silently stayed
      // missing from this partnership's own Summary chart until a full page reload, even though
      // it was already correctly saved and visible in the Group Leader's dashboard.
      const optimisticVisit = {
        id: `optimistic-${Date.now()}`,
        congregation_id: workspace.congregation_id,
        record_id: recordId,
        visited_at: visitedAt,
        result: result as VisitResult,
        notes,
        created_by: null,
        partner_name: workspace.name || null,
        created_at: new Date().toISOString(),
        overridden_by_admin_at: null,
        weekly_note_dismissed_at: null,
        created_by_name: null,
      }
      const updatedRecords = workspace.records.map((r) =>
        r.record.id === recordId
          ? { ...r, completed_at: r.completed_at ?? new Date().toISOString(), visits: [optimisticVisit, ...r.visits] }
          : r
      )
      setWorkspace((w) => ({ ...w, records: updatedRecords }))
      await enqueue(partnershipToken, 'visit', { partnershipToken, recordId, visitedAt, result, notes })
      await refreshQueue()
      if (online) await handleSync()
      returnToList()
    } finally {
      setSavingVisit(false)
    }
  }

  // Passes a record to a different Ministry Partner — unlike logging a visit, the record simply
  // leaves this partnership's list entirely (it isn't "completed" here, it's someone else's now).
  async function handleMoveRecord(recordId: string, destinationPartnershipId: string) {
    setMovingRecord(true)
    try {
      await enqueue(partnershipToken, 'moveRecord', { partnershipToken, recordId, destinationPartnershipId })
      await refreshQueue()
      if (online) await handleSync()
      const remainingRecords = workspace.records.filter((r) => r.record.id !== recordId)
      setWorkspace((w) => ({ ...w, records: remainingRecords }))
      toast.success('Moved to another Ministry Partner.')
      const next = [...remainingRecords].sort((a, b) => a.sequence - b.sequence).find((r) => !r.completed_at)
      setView(next ? { name: 'detail', recordId: next.record.id } : { name: 'list' })
      window.scrollTo({ top: 0, behavior: 'auto' })
    } finally {
      setMovingRecord(false)
    }
  }

  // "Suggest New Location" — this doesn't write to the record directly (see recommendMoveAction),
  // but it's still a real ministry-visit outcome (the household situation changed — the old
  // resident moved), so it completes the record and advances the list same as the other "Mark as
  // Moved" path (Request Record Removal).
  async function handleRecommendMove(recordId: string, fields: { address: string; householdMembers: string; notes: string }) {
    setMarkingMoved(true)
    try {
      const updatedRecords = workspace.records.map((r) =>
        r.record.id === recordId ? { ...r, completed_at: r.completed_at ?? new Date().toISOString() } : r
      )
      setWorkspace((w) => ({ ...w, records: updatedRecords }))
      await enqueue(partnershipToken, 'recommendMove', { partnershipToken, recordId, ...fields })
      await refreshQueue()
      if (online) await handleSync()
      toast.success('New location recommendation sent to the Admin.')
      returnToList()
    } finally {
      setMarkingMoved(false)
    }
  }

  async function handleRecommendRemoval(recordId: string, reason: string) {
    setMarkingMoved(true)
    try {
      const updatedRecords = workspace.records.map((r) =>
        r.record.id === recordId ? { ...r, completed_at: r.completed_at ?? new Date().toISOString() } : r
      )
      setWorkspace((w) => ({ ...w, records: updatedRecords }))
      await enqueue(partnershipToken, 'recommendRemoval', { partnershipToken, recordId, reason })
      await refreshQueue()
      if (online) await handleSync()
      toast.success('Recommendation sent to the Admin.')
      returnToList()
    } finally {
      setMarkingMoved(false)
    }
  }

  // Unlike the "Mark as Moved" recommendations above, this isn't a ministry-visit outcome — the
  // record stays exactly as-is (still incomplete if it was) and nothing here changes what's
  // displayed, since the Admin hasn't applied the correction yet.
  async function handleRecommendCorrection(recordId: string, fields: CorrectionFields) {
    setRecommendingCorrection(true)
    try {
      await enqueue(partnershipToken, 'recommendCorrection', {
        partnershipToken,
        recordId,
        plusCode: fields.plusCode,
        householdMembers: fields.householdMembers,
        residentName: fields.residentName,
        reason: fields.reason,
        territoryId: fields.territoryId,
        sectionId: fields.sectionId,
        blockId: fields.blockId,
      })
      await refreshQueue()
      if (online) await handleSync()
      toast.success('Correction recommendation sent to the Admin.')
    } finally {
      setRecommendingCorrection(false)
    }
  }

  // After logging a visit, marking a record moved, or recommending removal, return to the card
  // list instead of auto-advancing to the next incomplete record — the publisher picks what to
  // do next themselves rather than being taken somewhere automatically.
  function returnToList() {
    setView({ name: 'list' })
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  // Manual re-fetch of the search-scope records list — deliberately not automatic polling
  // (this workspace is offline-first, no background network), but the whole point of this list
  // is checking whether someone else just logged a record moments ago, so it's worth an explicit
  // live re-check rather than only ever showing what was cached at initial page load.
  async function handleRefreshSearchScope() {
    setRefreshingSearchScope(true)
    try {
      const { records, blockPartners } = await getSearchScopeRecordsAction(partnershipToken)
      setWorkspace((w) => ({ ...w, searchScopeRecords: records, searchScopeBlockPartners: blockPartners }))
    } finally {
      setRefreshingSearchScope(false)
    }
  }

  // Manual re-fetch for the "All Partners" tab — same reasoning as handleRefreshSearchScope
  // above (other partners' progress changes throughout the day, and this tab otherwise only
  // ever shows whatever was fetched at initial page load).
  async function handleRefreshPartners() {
    setRefreshingPartners(true)
    try {
      const batchPartnerships = await getBatchPartnersAction(partnershipToken)
      setWorkspace((w) => ({ ...w, batchPartnerships }))
    } finally {
      setRefreshingPartners(false)
    }
  }

  // Full-page reload used by the Home/List "Refresh" buttons — see their onClick comments for
  // why a soft router.refresh() isn't enough. Switching tabs via the bottom nav is an in-memory
  // setView() only (see PublisherBottomMenu), it never touches the URL's ?view= param, so a
  // plain window.location.reload() would reload whatever tab the URL happened to be set to on
  // first mount — not necessarily the tab currently on screen. Stamping ?view= with the current
  // tab before reloading keeps the reload landing back where the publisher actually was.
  function handleFullRefresh(targetView: 'home' | 'list') {
    setFullRefreshing(true)
    const url = new URL(window.location.href)
    url.searchParams.set('view', targetView)
    window.location.href = url.toString()
  }

  // The one-time, locked-in search-area choice — called directly (not through the offline sync
  // queue) since it needs a live, real-time answer about whether these blocks are still
  // available, same reasoning as handleRefreshSearchScope's direct call. On success, sets
  // workspace.searchScope locally (which permanently hides this form, per the "no changing it
  // later" rule) and immediately fetches whatever existing records are already in that area.
  async function handleChooseSearchScope(sectionId: string, blockIds: string[]) {
    setChoosingSearchScope(true)
    setSearchScopeChoiceError('')
    try {
      const formData = new FormData()
      formData.set('partnershipToken', partnershipToken)
      formData.set('sectionId', sectionId)
      blockIds.forEach((id) => formData.append('blockIds', id))
      const result = await chooseSearchScopeAction({}, formData)
      if (result.error && result.error !== 'SAVED') {
        setSearchScopeChoiceError(result.error)
        return
      }
      const territory = territoryStructures.find((t) => t.sections.some((s) => s.id === sectionId))
      const section = territory?.sections.find((s) => s.id === sectionId)
      const blocks = (section?.blocks ?? [])
        .filter((b) => blockIds.includes(b.id))
        .map((b) => ({ id: b.id, label: b.label }))
      setWorkspace((w) => ({ ...w, searchScope: { sectionId, sectionLabel: section?.label ?? '', blocks } }))
      const { records, blockPartners } = await getSearchScopeRecordsAction(partnershipToken)
      setWorkspace((w) => ({ ...w, searchScopeRecords: records, searchScopeBlockPartners: blockPartners }))
      toast.success('Search area saved.')
    } finally {
      setChoosingSearchScope(false)
    }
  }

  // The new record's id is generated here (not server-side) so it can be optimistically
  // rendered in "My Added Records" — and immediately made editable/deletable — before this
  // write has even synced. addPublisherRecordAction inserts under this exact id.
  // redirectTo lets "+ Add Another Person Here" send the publisher back to the household record
  // they came from instead of the default "My Added Records" landing spot.
  async function handleAddRecord(payload: NewPublisherRecordPayload, redirectTo?: View) {
    const recordId = crypto.randomUUID()
    const territory = territoryStructures.find((t) => t.id === payload.territoryId)
    const section = territory?.sections.find((s) => s.id === payload.sectionId)
    const block = section?.blocks.find((b) => b.id === payload.blockId)
    const optimisticRecord: TerritoryRecordWithLocation = {
      id: recordId,
      congregation_id: workspace.congregation_id,
      territory_id: payload.territoryId,
      section_id: payload.sectionId,
      block_id: payload.blockId,
      address: payload.address,
      unit: payload.unit,
      resident_name: payload.residentName,
      plus_code: payload.plusCode || null,
      household_members: payload.householdMembers ? Number(payload.householdMembers) : null,
      notes: payload.notes,
      do_not_call: false,
      do_not_call_at: null,
      status: 'pending',
      source: 'publisher',
      removal_recommended_at: null,
      removal_recommended_reason: null,
      removal_recommended_by: null,
      correction_recommended_at: null,
      correction_recommended_plus_code: null,
      correction_recommended_reason: null,
      correction_recommended_by: null,
      correction_recommended_territory_id: null,
      correction_recommended_section_id: null,
      correction_recommended_block_id: null,
      correction_recommended_household_members: null,
      correction_recommended_resident_name: null,
      move_recommended_at: null,
      move_recommended_address: null,
      move_recommended_unit: null,
      move_recommended_plus_code: null,
      move_recommended_household_members: null,
      move_recommended_notes: null,
      move_recommended_by: null,
      move_recommended_territory_id: null,
      move_recommended_section_id: null,
      move_recommended_block_id: null,
      created_by_partnership_id: workspace.id,
      admin_added_by: null,
      admin_added_at: null,
      admin_edited_by: null,
      admin_edited_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      territory: territory ? { id: territory.id, name: territory.name, description: territory.description } : null,
      section: section ? { id: section.id, label: section.label } : null,
      block: block ? { id: block.id, label: block.label } : null,
      correction_territory: null,
      correction_section: null,
      correction_block: null,
      move_territory: null,
      move_section: null,
      move_block: null,
      added_by_profile: null,
      edited_by_profile: null,
    }
    setWorkspace((w) => ({ ...w, addedRecords: [optimisticRecord, ...w.addedRecords] }))
    await enqueue(partnershipToken, 'addRecord', { partnershipToken, recordId, ...payload })
    await refreshQueue()
    setView(redirectTo ?? { name: 'addedRecords' })
    toast.success('Contact record added.')
    if (online) handleSync()
  }

  async function handleEditAddedRecord(recordId: string, payload: NewPublisherRecordPayload) {
    const territory = territoryStructures.find((t) => t.id === payload.territoryId)
    const section = territory?.sections.find((s) => s.id === payload.sectionId)
    const block = section?.blocks.find((b) => b.id === payload.blockId)
    setWorkspace((w) => ({
      ...w,
      addedRecords: w.addedRecords.map((r) =>
        r.id === recordId
          ? {
              ...r,
              territory_id: payload.territoryId,
              section_id: payload.sectionId,
              block_id: payload.blockId,
              address: payload.address,
              unit: payload.unit,
              resident_name: payload.residentName,
              plus_code: payload.plusCode || null,
              household_members: payload.householdMembers ? Number(payload.householdMembers) : null,
              notes: payload.notes,
              territory: territory ? { id: territory.id, name: territory.name, description: territory.description } : r.territory,
              section: section ? { id: section.id, label: section.label } : r.section,
              block: block ? { id: block.id, label: block.label } : r.block,
            }
          : r
      ),
    }))
    await enqueue(partnershipToken, 'editAddedRecord', {
      partnershipToken,
      recordId,
      territoryId: payload.territoryId,
      sectionId: payload.sectionId,
      blockId: payload.blockId,
      address: payload.address,
      unit: payload.unit,
      residentName: payload.residentName,
      plusCode: payload.plusCode,
      householdMembers: payload.householdMembers,
      notes: payload.notes,
    })
    await refreshQueue()
    toast.success('Contact record updated.')
    if (online) await handleSync()
    setView({ name: 'addedRecordDetail', recordId })
  }

  async function handleDeleteAddedRecord(recordId: string) {
    setDeletingAddedRecord(true)
    try {
      setWorkspace((w) => ({ ...w, addedRecords: w.addedRecords.filter((r) => r.id !== recordId) }))
      await enqueue(partnershipToken, 'deleteAddedRecord', { partnershipToken, recordId })
      await refreshQueue()
      toast.success('Contact record deleted.')
      if (online) await handleSync()
      setView({ name: 'addedRecords' })
    } finally {
      setDeletingAddedRecord(false)
    }
  }

  function goToSync() {
    setView({ name: 'sync' })
    if (online) handleSync()
  }

  // Both the normal "Sync & Finish" path and "End My Ministry Early" route through the note
  // screen first — it's genuinely optional (Skip goes straight to Sync), not a required step.
  function goToNote() {
    setView({ name: 'note' })
  }

  // Marks the partnership genuinely finished (see finishPartnershipAction) — the actual "end of
  // ministry" signal the Group Leader's all-done detection and the Record a Visit panel's
  // read-only gating both depend on. Fires from both note-screen handlers below, since both
  // Sync & Finish and End Early route through this same screen.
  async function handleFinish() {
    const now = new Date().toISOString()
    setWorkspace((w) => ({
      ...w,
      finished_at: w.finished_at ?? now,
      // Mirrors the same optimistic update onto this partnership's own entry in the "All
      // Partners" tab snapshot (see PartnerStatusList) — that list is only ever refetched on a
      // manual Refresh, so without this a publisher who finishes normally (no Early Out) still
      // reads as "In Progress" to themselves until they hit Refresh, even though they're done.
      batchPartnerships: w.batchPartnerships.map((p) => (p.id === w.id ? { ...p, finished_at: p.finished_at ?? now } : p)),
    }))
    await enqueue(partnershipToken, 'finish', { partnershipToken })
    await refreshQueue()
  }

  async function handleSendNote(note: string) {
    setSendingNote(true)
    try {
      await enqueue(partnershipToken, 'note', { partnershipToken, note })
      await handleFinish()
      await refreshQueue()
      if (online) await handleSync()
    } finally {
      setSendingNote(false)
      goToSync()
    }
  }

  async function handleSkipNote() {
    await handleFinish()
    if (online) await handleSync()
    goToSync()
  }

  // The unstructured "I don't have the full details" alternative to Add Record / Recommend New
  // Location — lands in the same admin Notes list as the end-of-ministry note, just enqueued as
  // its own item rather than routing through the finish flow (a partnership can send any number
  // of these throughout the day).
  async function handleSendQuickNote(fields: QuickNoteFields) {
    setSendingQuickNote(true)
    try {
      await enqueue(partnershipToken, 'quickNote', { partnershipToken, ...fields })
      await refreshQueue()
      if (online) await handleSync()
      toast.success('Sent to the Admin.')
      setView({ name: 'addedRecords' })
    } finally {
      setSendingQuickNote(false)
    }
  }

  async function handleTerminate() {
    const now = new Date().toISOString()
    setWorkspace((w) => ({
      ...w,
      ended_early_at: w.ended_early_at ?? now,
      records: w.records.map((r) => (r.completed_at ? r : { ...r, completed_at: now })),
      // Same self-entry mirror as handleFinish above — without it, ending ministry from a
      // search-area (zero-assigned-record) partnership left that same partner's own card in the
      // "All Partners" tab stuck on "In Progress" until a manual, online-only Refresh.
      batchPartnerships: w.batchPartnerships.map((p) => (p.id === w.id ? { ...p, ended_early_at: p.ended_early_at ?? now } : p)),
    }))
    await enqueue(partnershipToken, 'terminate', { partnershipToken })
    await refreshQueue()
    goToNote()
  }

  const selected = view.name === 'detail' ? (workspace.records.find((r) => r.record.id === view.recordId) ?? null) : null
  const pendingVisitsForSelected =
    view.name === 'detail' ? queue.filter((q) => q.type === 'visit' && q.payload.recordId === view.recordId) : []
  // Other records assigned to this same partnership that share a non-empty Plus Code — reads as
  // "other people at this address." Client-side only, matched against records already loaded
  // into this workspace (offline-first — no server round-trip), so a sibling assigned to a
  // different partner won't show up here. Used both for the "N at this address" context and for
  // MarkMovedForm's record picker when recommending one specific person for removal.
  const householdRecords =
    selected && selected.record.plus_code
      ? workspace.records
          .filter((r) => r.record.id !== selected.record.id && r.record.plus_code === selected.record.plus_code)
          .map((r) => ({
            id: r.record.id,
            label: r.record.resident_name || r.record.address || r.record.plus_code || 'Unlabeled record',
            latestResult: r.visits[0]?.result ?? null,
          }))
      : []
  // Deliberately requires at least one real assigned record — a "searching a fresh territory"
  // partnership (zero assigned records) should NOT auto-surface "All assigned records are
  // done! Sync & Finish" the instant it's claimed, since the whole point is spending the
  // allotted time adding new contact records, which can keep happening throughout the session.
  // "End My Ministry Early" is the only way that kind of partnership finishes for the day. See
  // isPartnershipAllDone for the household/Do-Not-Call grouping rules (real bug found live: a
  // multi-record household only ever gets completed_at stamped on whichever single record the
  // visit was logged against, so an un-grouped every-record check could never reach "done" for a
  // household even after the whole address was genuinely visited).
  const allDone = isPartnershipAllDone(
    workspace.records.map((r) => ({
      id: r.record.id,
      plusCode: r.record.plus_code,
      completedAt: r.completed_at,
      doNotCall: r.record.do_not_call,
      doNotCallAt: r.record.do_not_call_at,
    }))
  )
  // This partnership's own results breakdown, shown as VisitResultPieChart on the Home > Summary
  // tab (and linked to from the "Thank you" done screen below) — counting only records THIS
  // partnership has actually logged a visit against, not the congregation-wide totals. A record
  // with zero logged visits is skipped entirely rather than counted as 'initial_visit' — that's
  // the implicit "not yet visited" default, never a result a publisher actually chose (see
  // records/schema.ts). A currently-flagged Do Not Call record always counts under 'do_not_call'
  // regardless of its latest logged visit's own result string — e.g. a record locked via an
  // earlier visit can carry an older 'return_visit'/'moved' result underneath (see
  // DO_NOT_CALL_RESULTS in records/schema.ts, which lets those be logged without clearing the
  // flag), and counting it under that stale result instead of Do Not Call both misrepresents a
  // record nothing could be logged against today and desyncs the chart's total from the assigned
  // record count.
  const myResultCounts = ((): Record<VisitResult, number> => {
    const counts = Object.fromEntries(VISIT_RESULTS.map((r) => [r, 0])) as Record<VisitResult, number>
    for (const r of workspace.records) {
      if (r.record.do_not_call) {
        counts.do_not_call += 1
        continue
      }
      const latest = r.visits[0]?.result
      if (latest) counts[latest] += 1
    }
    return counts
  })()
  // Only hide a territory's map when it genuinely has no section/block structure at all — a
  // defensive guard, not the normal zero-records case (a fresh territory still has real
  // sections/blocks from the moment it's created; TerritoryMapViewer just has nothing useful to
  // render without them).
  const territoriesWithStructure = new Set(
    territoryStructures.filter((s) => s.sections.length > 0).map((s) => s.id)
  )
  const showSessionChrome = view.name !== 'note' && view.name !== 'sync' && view.name !== 'done'
  // Pins for this partnership's own currently-assigned records only — not every approved record
  // in the territory (that's the Admin's Household Distribution map on Reports) — so a publisher
  // only ever sees where their own work is, not the whole congregation's.
  const assignedRecordLocations: RecordLocation[] = workspace.records.map((r) => ({
    id: r.record.id,
    address: r.record.address,
    residentName: r.record.resident_name,
    plusCode: r.record.plus_code ?? '',
    territoryName: r.record.territory?.name ?? '',
  }))
  // Pins for an overflow batch's chosen search area — existing/pre-assigned records (blue) and
  // this partnership's own newly-added, still-pending-Admin-approval ones (red), combined on
  // one map so a publisher can tell "already known" from "what I just found" at a glance. Added
  // records are filtered to this partnership's own locked blocks (should already always be true
  // given the add-record form's own lock, but re-checked here rather than assumed).
  const scopeBlockIds = new Set(workspace.searchScope?.blocks.map((b) => b.id) ?? [])
  const searchScopeLocations: (RecordLocation & { color: 'blue' | 'red' })[] = [
    ...workspace.searchScopeRecords.map((r) => ({
      id: r.id,
      address: r.address,
      residentName: r.resident_name,
      plusCode: r.plus_code ?? '',
      territoryName: r.territory?.name ?? '',
      color: 'blue' as const,
    })),
    ...workspace.addedRecords
      .filter((r) => scopeBlockIds.has(r.block_id))
      .map((r) => ({
        id: r.id,
        address: r.address,
        residentName: r.resident_name,
        plusCode: r.plus_code ?? '',
        territoryName: r.territory?.name ?? '',
        color: 'red' as const,
      })),
  ]
  // An overflow partnership — or any partnership that simply has zero assigned records, e.g. a
  // batch generated against a brand-new/unmapped territory — must lock in its search area before
  // anything else in the workspace becomes visible, mirroring how the unclaimed state already
  // hides everything behind the rename form. Skipped once a scope has already been chosen
  // (one-time only) or if there are real assigned records to work instead.
  const needsSearchScope = !readOnly && (workspace.batch.is_overflow || workspace.records.length === 0) && !workspace.searchScope
  // Only this batch's own territories, narrowed from the full territoryStructures prop — the
  // search-area picker can't offer a section from a territory this batch doesn't even cover.
  const batchTerritoryStructures = territoryStructures.filter((t) => workspace.territories.some((wt) => wt.id === t.id))
  // Once a search area is locked in, "Add a New Contact Record" narrows to it — this partner
  // may only add records within their own scope. Undefined for every other partnership, which
  // keeps the form's normal whole-territory behavior.
  const addRecordLockedScope = (() => {
    if (!workspace.searchScope) return undefined
    const scopeTerritory = territoryStructures.find((t) => t.sections.some((s) => s.id === workspace.searchScope!.sectionId))
    if (!scopeTerritory) return undefined
    return {
      territoryId: scopeTerritory.id,
      territoryName: scopeTerritory.name,
      territoryDescription: scopeTerritory.description,
      sectionId: workspace.searchScope.sectionId,
      sectionLabel: workspace.searchScope.sectionLabel,
      blocks: workspace.searchScope.blocks,
    }
  })()
  // A partnership with zero assigned records only ever gets there by searching a fresh
  // area (see needsSearchScope above) — there's no fixed quota of incomplete records to leave
  // behind, so "Early Out" doesn't really describe what ending the session means for them.
  const isSearchOnlyPartnership = workspace.records.length === 0

  return (
    <div className="min-h-dvh bg-[#C9D8EE] px-4 pb-24 pt-8">
      {/* Saving indicator lives here, floating at the top of the screen — not on the "Log
          Visit" button itself — so it's visible the instant the view jumps to the next record. */}
      {savingVisit && (
        <div className="fixed inset-x-0 top-4 z-30 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-[#0B1B33] px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
            <RefreshCw className="h-4 w-4 animate-spin text-[#38BDF8]" />
            Saving your visit…
          </div>
        </div>
      )}

      <div className="mx-auto max-w-lg space-y-6">
        {showSessionChrome && view.name === 'home' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloaded}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-white py-2 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-60"
            >
              {downloaded ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
              {downloaded ? 'Downloaded' : 'Download'}
            </button>
            {/* Once the ministry session has ended AND nothing is left pending/failed, there's
                nothing left to sync — hide the button entirely rather than leaving a permanent
                "Synced" no-op sitting there. If something still failed to sync by the time the
                session ended, keep showing it so that can still be retried. */}
            {!(sessionEnded && pendingCount === 0 && failedCount === 0) && (
              <button
                type="button"
                onClick={handleSync}
                disabled={syncing || (pendingCount === 0 && failedCount === 0)}
                className="relative flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-white py-2 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-60"
              >
                {!online && !syncing ? (
                  <CloudOff className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
                )}
                {syncing ? 'Syncing…' : !online ? 'Offline' : pendingCount + failedCount > 0 ? 'Sync' : 'Synced'}
                {!syncing && pendingCount + failedCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                    {pendingCount + failedCount}
                  </span>
                )}
              </button>
            )}
            {/* A full browser reload, not a soft in-app refresh — this component only ever reads
                its initialWorkspace prop once (useState's initializer), so a Next.js
                router.refresh() alone would silently fetch fresh data and then throw it away.
                Disabled offline since a full reload needs a real network round-trip to render
                the page at all, unlike Sync above which just flushes the local queue. */}
            <button
              type="button"
              onClick={() => handleFullRefresh('home')}
              disabled={!online || fullRefreshing}
              title={online ? 'Refresh everything (records, partners, requests)' : 'Refresh needs a connection'}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-100 bg-white py-2 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fullRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        )}

        {/* Always available on Home, claimed or not — covers both "I haven't named anyone yet
            and this is the wrong card" and the silent-join case (this device had no claim yet
            and opened an ALREADY-claimed partnership — see the mount effect below — meant for a
            real pair's second phone, but just as easily a mistaken tap on someone else's
            in-progress card). Hidden while readOnly: that means this device is already bound to
            a DIFFERENT partnership and is only viewing this one via All Partners, so "switch"
            doesn't apply to what's on screen. */}
        {showSessionChrome && view.name === 'home' && !readOnly && (
          <div className="text-center">
            <button type="button" onClick={handleSwitchPartner} className="text-xs font-medium text-slate-400 hover:text-[#2563EB] hover:underline">
              Wrong Ministry Partner? Switch
            </button>
          </div>
        )}

        {readOnly && (view.name === 'home' || view.name === 'list' || view.name === 'detail') && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-sm font-medium text-amber-700 shadow-sm">
            Viewing {workspace.name}&apos;s assignment — read only.
          </div>
        )}

        {(view.name === 'home' || view.name === 'list') && !readOnly && !workspace.claimed_at && (
          <>
            <div className="rounded-2xl border border-gray-300 bg-white p-4 text-center text-sm text-slate-600 shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]">
              Enter your name(s) below to begin — your assigned contact records will appear once saved.
            </div>
            <PartnershipRenameForm currentName={workspace.name} onRename={handleRename} />
          </>
        )}

        {(view.name === 'home' || view.name === 'list') && (readOnly || workspace.claimed_at) && needsSearchScope && (
          <ChooseSearchScopeForm
            territories={batchTerritoryStructures}
            submitting={choosingSearchScope}
            error={searchScopeChoiceError}
            onSubmit={handleChooseSearchScope}
          />
        )}

        {view.name === 'home' && (readOnly || workspace.claimed_at) && !needsSearchScope && (
          <>
            {!readOnly && <PartnershipRenameForm currentName={workspace.name} onRename={handleRename} />}

            {(() => {
              const mappableTerritories = workspace.territories.filter((t) => mapUrls[t.id] && territoriesWithStructure.has(t.id))
              // "Status" (now labeled "All Statuses") and "FAQ" used to sit in this same pill row
              // as Map/Pins/Search Area/Summary/Share, crowding it on narrow screens — they're
              // reference material, not panels a publisher switches between, so they're broken
              // out below as plain centered text links instead of competing for pill space.
              const panelTabs: { key: 'territory' | 'records' | 'search' | 'summary' | 'share'; label: string; available: boolean }[] = [
                { key: 'territory', label: 'Territory Map', available: mappableTerritories.length > 0 },
                { key: 'records', label: 'Pins', available: assignedRecordLocations.length > 0 },
                { key: 'search', label: 'Search Area', available: searchScopeLocations.length > 0 },
                // Only revealed once ministry has actually ended — a mid-session Summary would
                // just show a partial/misleading picture of the day's results.
                { key: 'summary', label: 'Summary', available: sessionEnded },
                { key: 'share', label: 'Share QR', available: !readOnly },
              ]
              const availablePanelTabs = panelTabs.filter((t) => t.available)

              // A toggle only makes sense once there are genuinely two-or-more panels to switch
              // between — with just one (or zero, when only Status/FAQ are reachable) available,
              // show it directly instead of a one-option pill row.
              const showToggle = availablePanelTabs.length > 1
              const activeView =
                mapView === 'help' || mapView === 'faq'
                  ? mapView
                  : showToggle && availablePanelTabs.some((t) => t.key === mapView)
                    ? mapView
                    : (availablePanelTabs[0]?.key ?? 'help')

              return (
                <div className="space-y-3">
                  {showToggle && (
                    <div className="flex justify-center">
                      <div className="inline-flex flex-wrap justify-center rounded-full bg-blue-50 p-1">
                        {availablePanelTabs.map((t) => (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => setMapView(t.key)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              activeView === t.key ? 'bg-[#2563EB] text-white' : 'text-[#2563EB] hover:bg-blue-100'
                            }`}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeView === 'territory' && (
                    <div className="space-y-3">
                      {!showToggle && (
                        <h2 className="font-semibold text-[#0B1B33]">Map{mappableTerritories.length > 1 ? 's' : ''}</h2>
                      )}
                      {mappableTerritories.map((t) => (
                        <div key={t.id}>
                          <p className="mb-1 text-xs text-slate-700">{t.name}</p>
                          <TerritoryMapViewer mapImageUrl={mapUrls[t.id]} territoryName={t.name} />
                        </div>
                      ))}
                    </div>
                  )}

                  {activeView === 'records' && (
                    <div className="space-y-3">
                      {!showToggle && <h2 className="font-semibold text-[#0B1B33]">Pins</h2>}
                      <HouseholdDistributionMap records={assignedRecordLocations} fallbackAnchor={workspace.congregationAnchor} />
                    </div>
                  )}

                  {activeView === 'search' && (
                    <div className="space-y-3">
                      {!showToggle && <h2 className="font-semibold text-[#0B1B33]">Search Area Map</h2>}
                      <HouseholdDistributionMap records={searchScopeLocations} fallbackAnchor={workspace.congregationAnchor} />
                    </div>
                  )}

                  {activeView === 'summary' && (
                    <div className="space-y-3">
                      {!showToggle && <h2 className="font-semibold text-[#0B1B33]">Your Results</h2>}
                      {workspace.searchScope ? (
                        <SearchScopeSummaryCard
                          addedRecords={workspace.addedRecords}
                          territoryName={addRecordLockedScope?.territoryName}
                          territoryDescription={addRecordLockedScope?.territoryDescription}
                          sectionLabel={workspace.searchScope.sectionLabel}
                          blockLabels={workspace.searchScope.blocks.map((b) => b.label)}
                        />
                      ) : (
                        <Card className="p-4">
                          <VisitResultPieChart resultCounts={myResultCounts} />
                        </Card>
                      )}
                    </div>
                  )}

                  {activeView === 'share' && !readOnly && (
                    <SharePartnershipCard batchToken={batchToken} partnershipToken={partnershipToken} />
                  )}

                  {(activeView === 'help' || activeView === 'faq') && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMapView(availablePanelTabs[0]?.key ?? 'territory')}
                        aria-label="Close"
                        className="absolute right-2 top-2 z-10 rounded-full bg-white/90 p-1.5 text-slate-500 shadow-sm transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {activeView === 'help' && <PublisherStatusHelp />}
                      {activeView === 'faq' && <PublisherFAQ />}
                    </div>
                  )}

                  <div className="flex justify-center gap-4 pt-1 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setMapView('help')}
                      className={activeView === 'help' ? 'text-[#2563EB] underline' : 'text-slate-500 hover:text-[#2563EB] hover:underline'}
                    >
                      All Statuses
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapView('faq')}
                      className={activeView === 'faq' ? 'text-[#2563EB] underline' : 'text-slate-500 hover:text-[#2563EB] hover:underline'}
                    >
                      Frequently Asked Questions
                    </button>
                  </div>
                </div>
              )
            })()}

          </>
        )}

        {view.name === 'list' && (readOnly || workspace.claimed_at) && !needsSearchScope && (
          <>
            {/* No push notifications anywhere in this app — a record claimed via Search, an
                approved Ask, or a Pass from another partner all only ever show up here after a
                fresh load. Same full-reload Refresh as Home, always visible on this tab
                regardless of whether records exist yet. Header + Refresh share one row, same
                layout as PartnerStatusList's "All Partners" header. */}
            <div className="mb-3 flex items-center justify-between gap-2">
              {workspace.records.length > 0 ? (
                <h2 className="text-xl font-bold text-[#0B1B33]">Assigned Contact Records</h2>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => handleFullRefresh('list')}
                disabled={!online || fullRefreshing}
                title={online ? 'Refresh your assigned records' : 'Refresh needs a connection'}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fullRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            {workspace.records.length > 0 && (
              <div>
                {workspace.territories.length > 0 && (
                  <div className="text-center">
                    {workspace.territories.map((t) => (
                      <p key={t.id} className="text-xs text-slate-500">
                        {t.name} — {t.description}
                      </p>
                    ))}
                  </div>
                )}

                {!readOnly && allDone && (
                  <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center shadow-sm">
                    <p className="text-sm font-semibold text-emerald-700">All assigned records are done!</p>
                    {/* Once this session has already been synced and finished, there's nothing
                        left to do here — a clickable "Sync & Finish" re-appearing on every
                        return to this list would just re-trigger the note/sync flow for no
                        reason. The plain note above is enough. */}
                    {!sessionEnded && (
                      <button
                        type="button"
                        onClick={goToNote}
                        className="mt-3 w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Sync &amp; Finish
                      </button>
                    )}
                  </div>
                )}

                <div className="mt-3">
                  <AssignedRecordsList
                    records={workspace.records}
                    failedRecordIds={new Set(queue.filter((q) => q.status === 'failed' && q.payload.recordId).map((q) => q.payload.recordId))}
                    onSelect={(recordId) => setView({ name: 'detail', recordId })}
                  />
                </div>
              </div>
            )}

            {workspace.searchScope &&
              (() => {
                const scopeStructTerritory = territoryStructures.find((t) => t.sections.some((s) => s.id === workspace.searchScope!.sectionId))
                const scopeTerritory = scopeStructTerritory ? workspace.territories.find((t) => t.id === scopeStructTerritory.id) : undefined
                const blockLabels = workspace.searchScope.blocks.map((b) => b.label)
                return (
                  <div className={workspace.records.length > 0 ? 'mt-6' : ''}>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-[#0B1B33]">Area To Search</h2>
                      {scopeTerritory && (
                        <p className="text-xs text-slate-500">
                          {scopeTerritory.name} — {scopeTerritory.description}
                        </p>
                      )}
                      <p className="text-xs text-slate-500">
                        Section {workspace.searchScope.sectionLabel} — Block{blockLabels.length === 1 ? '' : 's'} {blockLabels.join(', ')}
                      </p>
                    </div>
                    <div className="mt-3">
                      <SearchScopeRecordsList
                        sectionLabel={workspace.searchScope.sectionLabel}
                        blockLabels={blockLabels}
                        records={workspace.searchScopeRecords}
                        blockPartners={workspace.searchScopeBlockPartners}
                        refreshing={refreshingSearchScope}
                        onRefresh={handleRefreshSearchScope}
                        showAreaLabel={false}
                      />
                    </div>
                  </div>
                )
              })()}

            {workspace.records.length === 0 && !workspace.searchScope && (
              <div className="rounded-2xl border border-gray-300 bg-white p-4 text-center shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]">
                <p className="text-sm font-semibold text-[#0B1B33]">No contact records assigned to you.</p>
                <p className="mt-1 text-sm text-slate-500">Add any new contact records you find via My Added Records.</p>
              </div>
            )}

            {/* List-tab only now — Russell had this removed from Home (it's map/territory-
                focused, not a place to end ministry from). Skipped when the "All assigned
                records are done!" banner above is already showing its own Sync & Finish button
                — that's the same finish action, no need for a second one. */}
            {!readOnly && !sessionEnded && !(allDone && workspace.records.length > 0) && (
              <button
                type="button"
                onClick={() => setConfirmDialog({ type: allDone || isSearchOnlyPartnership ? 'endMinistry' : 'endMinistryEarly' })}
                className="w-full rounded-lg bg-gradient-to-r from-red-600 to-red-500 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                {allDone || isSearchOnlyPartnership ? 'End My Ministry' : 'End My Ministry Early'}
              </button>
            )}
          </>
        )}

        {view.name === 'partners' && (
          <PartnerStatusList
            partnerships={workspace.batchPartnerships}
            refreshing={refreshingPartners}
            canRefresh={online}
            onRefresh={handleRefreshPartners}
          />
        )}

        {view.name === 'detail' && selected && (
          <PublisherRecordDetailView
            // Forces a remount whenever the viewed record changes — including jumping straight
            // to a sibling via onSelectHouseholdRecord below, which (unlike the list->detail
            // navigation this view previously only ever appeared from) doesn't unmount this
            // component on its own. Without this, per-record UI state (the household disclosure,
            // the mobile Move/Moved/Correction toggle) would incorrectly carry over from the
            // record you just left.
            key={selected.record.id}
            assigned={selected}
            onBack={returnToList}
            pendingVisits={pendingVisitsForSelected}
            readOnly={readOnly}
            sessionEnded={sessionEnded}
            saving={savingVisit}
            siblingPartnerships={workspace.siblingPartnerships}
            householdRecords={householdRecords}
            onSelectHouseholdRecord={(recordId) => setView({ name: 'detail', recordId })}
            moving={movingRecord}
            markingMoved={markingMoved}
            recommendingCorrection={recommendingCorrection}
            territories={territoryStructures}
            mapUrl={selected.record.territory ? mapUrls[selected.record.territory.id] : undefined}
            onLogVisit={(visitedAt, result, notes) => handleLogVisit(selected.record.id, visitedAt, result, notes)}
            onMoveRecord={(destinationPartnershipId) => handleMoveRecord(selected.record.id, destinationPartnershipId)}
            onRecommendMove={(fields) => handleRecommendMove(selected.record.id, fields)}
            onRecommendRemoval={(reason, recordId) => handleRecommendRemoval(recordId, reason)}
            onRecommendCorrection={(fields) => handleRecommendCorrection(selected.record.id, fields)}
            onAddSibling={() =>
              setView({
                name: 'addRecord',
                prefill: {
                  territoryId: selected.record.territory_id,
                  sectionId: selected.record.section_id,
                  blockId: selected.record.block_id,
                  address: selected.record.address,
                  unit: selected.record.unit,
                  plusCode: selected.record.plus_code ?? '',
                },
                returnToRecordId: selected.record.id,
              })
            }
            onAddHouseholdMember={(memberPayload: NewHouseholdMemberPayload) =>
              handleAddRecord(
                {
                  territoryId: selected.record.territory_id,
                  sectionId: selected.record.section_id,
                  blockId: selected.record.block_id,
                  address: selected.record.address,
                  unit: selected.record.unit,
                  plusCode: selected.record.plus_code ?? '',
                  householdMembers: '',
                  ...memberPayload,
                },
                { name: 'detail', recordId: selected.record.id }
              )
            }
          />
        )}

        {view.name === 'addRecord' &&
          (view.prefill ? (
            <AddHouseholdMemberForm
              address={view.prefill.address || view.prefill.plusCode || 'this address'}
              onSubmit={(memberPayload) =>
                handleAddRecord(
                  {
                    territoryId: view.prefill?.territoryId ?? '',
                    sectionId: view.prefill?.sectionId ?? '',
                    blockId: view.prefill?.blockId ?? '',
                    address: view.prefill?.address ?? '',
                    unit: view.prefill?.unit ?? '',
                    plusCode: view.prefill?.plusCode ?? '',
                    householdMembers: '',
                    ...memberPayload,
                  },
                  view.returnToRecordId ? { name: 'detail', recordId: view.returnToRecordId } : undefined
                )
              }
              onCancel={() => setView(view.returnToRecordId ? { name: 'detail', recordId: view.returnToRecordId } : { name: 'list' })}
            />
          ) : (
            <PublisherRecordForm
              territories={territoryStructures}
              lockedScope={addRecordLockedScope}
              onSubmit={handleAddRecord}
              onCancel={() => setView({ name: 'addedRecords' })}
            />
          ))}

        {view.name === 'addedRecords' && (
          <div>
            <h2 className="mb-3 text-center text-xl font-bold text-[#0B1B33]">My Added Records</h2>
            <AddedRecordsList
              records={workspace.addedRecords}
              onSelect={(recordId) => setView({ name: 'addedRecordDetail', recordId })}
            />
            {editable && territoryStructures.length > 0 && (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setView({ name: 'addRecord' })}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-[#2563EB] hover:border-[#38BDF8]/40"
                >
                  <Plus className="h-4 w-4" />
                  Add Contact in This Territory
                </button>
                <button
                  type="button"
                  onClick={() => setView({ name: 'addQuickNote' })}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-[#2563EB] hover:border-[#38BDF8]/40"
                >
                  <Plus className="h-4 w-4" />
                  Report Contact in Another Territory
                </button>
              </div>
            )}
          </div>
        )}

        {view.name === 'addQuickNote' && (
          <PublisherQuickNoteForm
            heading="Report Contact in Another Territory"
            description="No territory details needed — just enough for the Admin to follow up. This goes to the same Notes list as your end-of-ministry note."
            sending={sendingQuickNote}
            onSubmit={handleSendQuickNote}
            onCancel={() => setView({ name: 'addedRecords' })}
          />
        )}

        {view.name === 'addedRecordDetail' &&
          (() => {
            const addedRecord = workspace.addedRecords.find((r) => r.id === view.recordId)
            if (!addedRecord) return null
            return (
              <PublisherAddedRecordDetailView
                record={addedRecord}
                editable={editable}
                deleting={deletingAddedRecord}
                onEdit={() => setView({ name: 'editAddedRecord', recordId: addedRecord.id })}
                onDelete={() => setConfirmDialog({ type: 'deleteAddedRecord', recordId: addedRecord.id })}
              />
            )
          })()}

        {view.name === 'editAddedRecord' &&
          (() => {
            const addedRecord = workspace.addedRecords.find((r) => r.id === view.recordId)
            if (!addedRecord) return null
            return (
              <PublisherRecordForm
                mode="edit"
                territories={territoryStructures}
                initialValues={{
                  territoryId: addedRecord.territory_id,
                  sectionId: addedRecord.section_id,
                  blockId: addedRecord.block_id,
                  address: addedRecord.address,
                  unit: addedRecord.unit,
                  residentName: addedRecord.resident_name,
                  plusCode: addedRecord.plus_code ?? '',
                  householdMembers: addedRecord.household_members != null ? String(addedRecord.household_members) : '',
                  notes: addedRecord.notes,
                }}
                onSubmit={(payload) => handleEditAddedRecord(addedRecord.id, payload)}
                onCancel={() => setView({ name: 'addedRecordDetail', recordId: addedRecord.id })}
              />
            )
          })()}

        {view.name === 'note' && <PublisherNoteForm sending={sendingNote} onSend={handleSendNote} onSkip={handleSkipNote} />}

        {view.name === 'sync' && (
          <div className="rounded-2xl border border-gray-300 bg-white p-6 text-center shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]">
            <h2 className="font-semibold text-[#0B1B33]">Syncing your work…</h2>
            <p className="mt-1 text-sm text-slate-500">
              {pendingCount > 0
                ? `${pendingCount} item(s) waiting to sync.`
                : failedCount > 0
                  ? `${failedCount} item(s) failed to sync.`
                  : 'All synced.'}
            </p>
            {!online && (
              <p className="mt-2 text-xs text-amber-600">You&apos;re offline — this will sync automatically once you&apos;re back online.</p>
            )}
            {failedCount > 0 && (
              <div className="mt-4 space-y-2 text-left">
                {queue
                  .filter((q) => q.status === 'failed')
                  .map((q) => (
                    <div key={q.id} className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-sm font-medium text-red-700">{describeQueueItem(q)}</p>
                      <p className="mt-0.5 text-xs text-red-500">{q.error ?? 'Sync failed.'}</p>
                    </div>
                  ))}
                <p className="text-xs text-slate-500">
                  Check your connection and tap Sync Now to retry. If this keeps failing, tell your Group Leader — they can check it from the
                  admin side.
                </p>
                <button
                  type="button"
                  onClick={handleCopyFailedReport}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-100 bg-white py-2 text-xs font-semibold text-[#2563EB] transition hover:border-[#38BDF8]/40"
                >
                  <ClipboardCopy className="h-3.5 w-3.5" />
                  Copy for Admin
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={handleSync}
              disabled={syncing || !online}
              className="mt-4 w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>
        )}

        {view.name === 'done' && (
          <div className="rounded-2xl border border-gray-300 bg-white p-8 text-center shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]">
            <PartyPopper className="mx-auto h-12 w-12 text-[#2563EB]" />
            <h2 className="mt-4 text-lg font-semibold text-[#0B1B33]">Thank you for your service today!</h2>
            <p className="mt-2 text-sm text-slate-500">Your work has been saved.</p>
            <blockquote className="mt-6 border-t border-blue-100/60 pt-6 text-base font-bold italic text-[#0B1B33]">
              &ldquo;Go, therefore, and make disciples of people of all the nations, baptizing them in the name of the Father
              and of the Son and of the holy spirit, teaching them to observe all the things I have commanded you. And look! I
              am with you all the days until the conclusion of the system of things.&rdquo;
            </blockquote>
            <p className="mt-2 text-sm font-medium text-slate-500">Matthew 28:19, 20</p>
            {workspace.congregationName && (
              <p className="mt-6 text-sm font-semibold text-[#2563EB]">{workspace.congregationName}</p>
            )}
            {/* Takes the publisher straight to their own results pie chart (Home > Summary,
                VisitResultPieChart) — the same tab reachable manually via the Home toggle, just
                surfaced here so today's outcome is one tap away from the finish screen. */}
            <button
              type="button"
              onClick={() => {
                setMapView('summary')
                setView({ name: 'home' })
              }}
              className="mt-6 w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
            >
              View My Results
            </button>
          </div>
        )}

        {view.name === 'search' && !readOnly && (
          <PublisherSearchPanel
            partnershipToken={partnershipToken}
            isOverflow={workspace.batch.is_overflow}
            incomingRequests={workspace.incomingRequests}
            onIncomingRequestsChange={(incomingRequests) => setWorkspace((w) => ({ ...w, incomingRequests }))}
          />
        )}
      </div>

      <PublisherBottomMenu
        view={
          view.name === 'note' ||
          view.name === 'sync' ||
          view.name === 'done' ||
          view.name === 'detail'
            ? 'list'
            : view.name
        }
        onGoToHome={() => setView({ name: 'home' })}
        onGoToPartners={() => setView({ name: 'partners' })}
        onGoToRecords={() => setView({ name: 'list' })}
        onGoToSearch={() => setView({ name: 'search' })}
        incomingRequestCount={workspace.incomingRequests.length}
        onGoToAddedRecords={() => setView({ name: 'addedRecords' })}
        showAddedRecords={!readOnly}
      />

      <ConfirmModal
        open={confirmDialog?.type === 'deleteAddedRecord'}
        title="Delete this contact record?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDialog?.type === 'deleteAddedRecord') handleDeleteAddedRecord(confirmDialog.recordId)
          setConfirmDialog(null)
        }}
        onCancel={() => setConfirmDialog(null)}
      />

      <ConfirmModal
        open={confirmDialog?.type === 'endMinistry'}
        title="End your ministry for today?"
        message="Every record assigned to you is done. This will take you to Sync & Finish."
        confirmLabel="End My Ministry"
        variant="info"
        onConfirm={() => {
          setConfirmDialog(null)
          goToNote()
        }}
        onCancel={() => setConfirmDialog(null)}
      />

      <ConfirmModal
        open={confirmDialog?.type === 'endMinistryEarly'}
        title="End your ministry early?"
        message="You still have unfinished records. Ending now marks them as not completed today."
        confirmLabel="End Early"
        variant="caution"
        onConfirm={() => {
          setConfirmDialog(null)
          handleTerminate()
        }}
        onCancel={() => setConfirmDialog(null)}
      />
    </div>
  )
}
