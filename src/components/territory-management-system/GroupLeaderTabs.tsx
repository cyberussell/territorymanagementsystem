'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  BookMarked,
  BookOpen,
  BookX,
  CheckCircle2,
  ClipboardList,
  Clock,
  DoorClosed,
  FilePlus,
  HelpCircle,
  Home,
  LayoutDashboard,
  Percent,
  PhoneOff,
  RefreshCw,
  Repeat,
  Sparkles,
  TrendingUp,
  Truck,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import type { BatchStats, TerritoryVisitHistoryEntry } from '@/lib/territory-management-system/modules/reports/queries'
import { VISIT_RESULT_LABELS } from '@/lib/territory-management-system/modules/records/schema'
import {
  deleteGroupLeaderAssignmentAction,
  endPartnershipAction,
  getPartnershipAssignedRecordsAction,
} from '@/app/tms/actions/group-leader'
import StatCard from '@/components/territory-management-system/dashboard/StatCard'
import Card from '@/components/territory-management-system/dashboard/Card'
import ConfirmDeleteButton from '@/components/territory-management-system/dashboard/ConfirmDeleteButton'
import PartnershipList from '@/components/territory-management-system/PartnershipList'
import VisitResultBarChart from '@/components/territory-management-system/VisitResultBarChart'
import AssignmentForm from '@/components/territory-management-system/AssignmentForm'
import OverflowAssignmentForm from '@/components/territory-management-system/OverflowAssignmentForm'
import PublisherFAQ from '@/components/territory-management-system/publisher/PublisherFAQ'
import TerritoryVisitHistoryList from '@/components/territory-management-system/TerritoryVisitHistoryList'

type Tab = 'home' | 'dashboard' | 'results' | 'progress' | 'faq'

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'results', label: 'Visits', icon: ClipboardList },
  { id: 'progress', label: 'Partners', icon: Users },
  { id: 'faq', label: 'FAQ', icon: HelpCircle },
]

// Always rendered in Philippine time (Asia/Manila), regardless of the viewer's own device
// timezone — every TMS congregation this app serves is PH-based.
function formatVisitTime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
}

function SummaryStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="font-semibold text-[#0B1B33]">{value}</p>
    </div>
  )
}

// One entry per batch this Group Leader owns today — a Group Leader can now have more than one
// (see 023_multiple_batches_per_group_leader.sql), e.g. an original batch plus one or more
// overflow batches generated for extra publishers later the same day.
export interface BatchView {
  batchId: string
  qrDataUrl: string
  publicUrl: string
  requestedPartnershipCount: number
  // True for a batch generated via "Generate Overflow Assignment" (see
  // 024_batch_is_overflow.sql) — drives both the switcher label and the QR card's own heading.
  isOverflow: boolean
  stats: BatchStats
}

export default function GroupLeaderTabs({
  batches,
  activeTerritories,
  todaysTerritories,
  combinedStats,
  territoryHistory,
}: {
  batches: BatchView[]
  activeTerritories: { id: string; name: string; barangayName: string; approvedCount: number }[]
  todaysTerritories: { id: string; name: string; barangayName: string }[]
  // Regular assignment + every auxiliary/overflow batch owned today, summed/deduped (see
  // getCombinedBatchStats) — what the Dashboard/Visits/Partners tabs and the post-completion Home
  // tab summary display, instead of forcing a per-batch view. The batch switcher below still picks
  // which single batch the QR/generate/regenerate/delete controls on the Home tab act on.
  combinedStats: BatchStats
  // "Worked in the last month" territory list (see getTerritoryVisitHistory) — same data shown
  // on the pre-assignment "no assignment yet" screen (group-leader/dashboard/page.tsx), rendered
  // here too on the Dashboard tab so it's still visible once today's assignment exists.
  territoryHistory: TerritoryVisitHistoryEntry[]
}) {
  const [tab, setTab] = useState<Tab>('home')
  // Spins the Refresh icon for the moment between tapping it and the full page reload actually
  // taking over — otherwise the button looks like it did nothing for however long the network
  // round-trip takes.
  const [refreshing, setRefreshing] = useState(false)
  // Home tab's Generate/Regenerate toggle — deliberately starts at null (neither shown), even
  // right after a page refresh, so the tab opens clean instead of always stacking both forms.
  const [assignmentAction, setAssignmentAction] = useState<'generate' | 'regenerate' | null>(null)
  // Both panels render well below the fold (under the QR/summary card and, for regenerate, a
  // solid button inside it) — without this, picking either one silently expands content the
  // Group Leader has to go hunting for by scrolling themselves.
  const assignmentPanelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (assignmentAction) assignmentPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [assignmentAction])
  const [selectedBatchId, setSelectedBatchId] = useState(batches[0]?.batchId)
  const selected = batches.find((b) => b.batchId === selectedBatchId) ?? batches[0]
  const { batchId, qrDataUrl, publicUrl, requestedPartnershipCount, isOverflow, stats } = selected
  // The barangay/locality name for the QR card's own heading — territory.name is the internal
  // code (e.g. "Q-11"), the barangay name is territory.description. Read directly off
  // stats.territories (sourced from getBatchSummary's own territory join, so it's guaranteed to
  // reflect exactly what this batch covers) rather than cross-referencing the separate
  // activeTerritories prop (scoped/filtered for the New Assignment form's territory picker,
  // e.g. by status === 'active' — a real but different purpose that this earlier lookup wrongly
  // piggybacked on and could silently miss).
  const batchBarangays = stats.territories.map((t) => t.description).filter((d): d is string => Boolean(d && d.trim()))

  // The "Visits" tab shows each result's count as of when this device first opened today's
  // combined batches, plus a live delta badge (see StatCard) for whatever's changed since then.
  // Kept in localStorage (not just component state) keyed by the combined set of today's batch
  // ids (sorted, so it's stable regardless of fetch order) — a new auxiliary batch showing up
  // changes the key, naturally re-seeding the baseline, and this resets every morning with no
  // extra logic — because relying on component state alone meant a plain page reload (as opposed
  // to the in-place router.refresh() poll) silently reset the baseline to the just-loaded
  // numbers, making the delta permanently read 0.
  const combinedBatchKey = [...batches].map((b) => b.batchId).sort().join('_')
  const baselineStorageKey = `tms_gl_result_baseline_combined_${combinedBatchKey}`
  const [resultBaseline, setResultBaseline] = useState(combinedStats.resultCounts)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(baselineStorageKey)
    if (stored) {
      try {
        setResultBaseline(JSON.parse(stored))
        return
      } catch {
        // Falls through to re-seed below if the stored value was somehow corrupt.
      }
    }
    setResultBaseline(combinedStats.resultCounts)
    window.localStorage.setItem(baselineStorageKey, JSON.stringify(combinedStats.resultCounts))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combinedBatchKey])

  // Records fill sequentially, so a shortfall of approved records caps the actual partnership
  // count below what was requested (see engine.ts's calculateAssignment) instead of blocking
  // generation outright — this surfaces that gap after the fact too, in case it wasn't noticed
  // on the form before generating.
  const shortfallPartnerships = Math.max(0, requestedPartnershipCount - stats.partnerships.length)
  const base = 'flex-1 rounded-xl px-2 py-3 text-center text-sm font-semibold leading-tight transition'
  const active = 'bg-[#2563EB] text-white'
  const inactive = 'bg-blue-50 text-[#2563EB] hover:bg-blue-100'

  // Once every Ministry Partner has either finished their assigned records or ended early,
  // there's nothing left to scan for — the QR card gives way to a same-day results summary
  // instead. The batch itself isn't deleted (Reports/history still need it); it naturally stops
  // working the next day via the existing assignment_date/isBatchExpired midnight cutoff.
  //
  // completedCount >= recordCount is vacuously true for a zero-record ("searching a fresh
  // territory") partnership the instant the batch is created — before anyone has even claimed
  // it — which made the QR never show at all for a zero-record territory. finished_at/
  // ended_early_at (set only when a publisher actually reaches Sync & Finish or ends early) are
  // the real "genuinely done" signal and take priority; the record-count check still covers a
  // normal partnership whose publisher never explicitly finishes (closes the tab, say).
  const allPartnersDone =
    stats.partnerships.length > 0 &&
    stats.partnerships.every(
      (p) => Boolean(p.finished_at) || Boolean(p.ended_early_at) || (p.recordCount > 0 && p.completedCount >= p.recordCount)
    )

  // Combined across every batch owned today, same as the rest of the completed-summary card
  // below — not just the currently selected/switcher batch.
  const partnersEndedEarly = combinedStats.partnerships.filter((p) => p.ended_early_at).length
  const partnersFinished = combinedStats.partnerships.filter((p) => p.finished_at).length

  // Label for the batch switcher AND the Partners tab's per-batch section headers below —
  // "House To House" for the original, "Auxiliary Groups" for an overflow batch (numbered
  // "Auxiliary Groups 2", "Auxiliary Groups 3"... only once there's more than one, since a Group
  // Leader can generate more than one overflow batch the same day). Computed once into a map
  // (rather than a mutable counter read directly in each render site) so calling it from two
  // separate places in the same render doesn't double-advance the overflow numbering.
  let overflowSeen = 0
  const batchLabelById = new Map(
    batches.map((b) => {
      if (!b.isOverflow) return [b.batchId, 'House To House'] as const
      overflowSeen += 1
      return [b.batchId, overflowSeen === 1 ? 'Auxiliary Groups' : `Auxiliary Groups ${overflowSeen}`] as const
    })
  )
  const batchLabel = (b: BatchView) => batchLabelById.get(b.batchId) ?? 'House To House'

  const router = useRouter()
  // `stats` (and everything else here) is fetched once per Server Component render and passed
  // down as a prop — switching between Home/Dashboard/Visit Results/Ministry Partner (and now
  // between batches) is pure client-side state, nothing here ever refetches on its own. Without
  // this, a publisher syncing a visit while the Group Leader already has this page open would
  // never show up until a manual browser reload. router.refresh() re-runs the page's Server
  // Component and pushes fresh props down without losing the selected tab/batch (that's local
  // state, untouched by this).
  useEffect(() => {
    const interval = setInterval(() => router.refresh(), 30000)
    function handleVisibility() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [router])

  return (
    <div className="pb-24 sm:pb-0">
      {batches.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Today's assignment batches">
          {batches.map((b) => (
            <button
              key={b.batchId}
              type="button"
              onClick={() => setSelectedBatchId(b.batchId)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                b.batchId === batchId ? 'bg-[#2563EB] text-white' : 'bg-blue-50 text-[#2563EB] hover:bg-blue-100'
              }`}
            >
              {batchLabel(b)}
            </button>
          ))}
        </div>
      )}

      {/* Desktop/tablet: sticky top tab bar. Hidden below `sm` in favor of the fixed bottom bar. */}
      <nav
        className="sticky top-0 z-10 mb-6 hidden gap-2 rounded-2xl border border-blue-100/60 bg-white/95 p-2 shadow-sm backdrop-blur sm:flex"
        aria-label="Assignment sections"
      >
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`${base} ${tab === t.id ? active : inactive}`}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* Mobile: fixed bottom icon bar, like a native app tab bar. Hidden at `sm` and up. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-blue-100/60 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur sm:hidden"
        aria-label="Assignment sections"
      >
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold leading-tight transition ${
                isActive ? 'text-[#2563EB]' : 'text-slate-400'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`flex items-center justify-center rounded-full p-1.5 transition ${isActive ? 'bg-blue-50' : ''}`}>
                <Icon className={isActive ? 'h-6 w-6' : 'h-5 w-5'} strokeWidth={isActive ? 2.75 : 2} aria-hidden />
              </span>
              {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'home' && (
        <div className="space-y-8">
          {allPartnersDone ? (
            <Card className="relative p-6">
              {/* A full browser reload rather than a soft in-app refresh — this component is fed
                  by server-rendered props too, same "only ever read once" concern as the
                  publisher workspace's own Refresh button. Icon-only, mirrors the delete button's
                  corner on the opposite side of the same row. */}
              <button
                type="button"
                onClick={() => {
                  setRefreshing(true)
                  window.location.reload()
                }}
                disabled={refreshing}
                aria-label="Refresh"
                title="Refresh"
                className="absolute left-4 top-4 text-[#2563EB] hover:text-[#1d4fd1] disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <ConfirmDeleteButton
                action={deleteGroupLeaderAssignmentAction.bind(null, batchId)}
                confirmMessage="Delete this assignment? Publishers who scanned the QR code will lose access."
                ariaLabel="Delete Assignment"
                className="absolute right-4 top-4 text-red-400 hover:text-red-600"
              />
              <h2 className="text-center font-semibold text-[#0B1B33]">
                {combinedStats.partnerships.length} ministry partner{combinedStats.partnerships.length === 1 ? '' : 's'} completed
                today
              </h2>
              {combinedStats.territories.length > 0 && (
                <p className="mt-1 text-center text-xs text-slate-600">
                  Territories worked: {combinedStats.territories.map((t) => t.name).join(', ')}
                </p>
              )}
              <div className="mt-6">
                <VisitResultBarChart resultCounts={combinedStats.resultCounts} />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-blue-100 pt-5 sm:grid-cols-4">
                <SummaryStat label="Records Distributed" value={combinedStats.totalRecords} />
                <SummaryStat label="Records Untouched" value={combinedStats.remainingRecords} />
                <SummaryStat label="Records Added" value={combinedStats.newRecordsSubmitted} />
                <SummaryStat label="Partners Finished" value={partnersFinished} />
                <SummaryStat label="Ended Ministry Early" value={partnersEndedEarly} />
                <SummaryStat label="First Logged Visit" value={formatVisitTime(combinedStats.firstVisitedAt)} />
                <SummaryStat label="Last Logged Visit" value={formatVisitTime(combinedStats.lastVisitedAt)} />
              </div>
            </Card>
          ) : (
            <Card
              className={`relative flex flex-col items-center gap-3 p-6 text-center ${
                // Card's own panelClass already sets bg-white/border-gray-300 on this same
                // element — a plain bg-black/border-black loses that cascade fight regardless of
                // string order (Tailwind's compiled stylesheet order decides ties, not source
                // order), leaving the panel white even when isOverflow is true. The `!` important
                // modifier forces this override to actually win.
                isOverflow ? '!border-black !bg-black' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setRefreshing(true)
                  window.location.reload()
                }}
                disabled={refreshing}
                aria-label="Refresh"
                title="Refresh"
                className={
                  isOverflow
                    ? 'absolute left-4 top-4 text-[#60A5FA] hover:text-white disabled:opacity-50'
                    : 'absolute left-4 top-4 text-[#2563EB] hover:text-[#1d4fd1] disabled:opacity-50'
                }
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <ConfirmDeleteButton
                action={deleteGroupLeaderAssignmentAction.bind(null, batchId)}
                confirmMessage="Delete this assignment? Publishers who scanned the QR code will lose access."
                ariaLabel="Delete Assignment"
                className={isOverflow ? 'absolute right-4 top-4 text-red-400 hover:text-red-300' : 'absolute right-4 top-4 text-red-400 hover:text-red-600'}
              />
              <h2 className={`font-semibold ${isOverflow ? 'text-white' : 'text-[#0B1B33]'}`}>
                {isOverflow ? 'Auxiliary Group QR Code' : 'House To House QR Code'}
              </h2>
              {batchBarangays.length > 0 && (
                <p className={`-mt-2 text-xs font-medium ${isOverflow ? 'text-[#60A5FA]' : 'text-[#2563EB]'}`}>
                  {batchBarangays.join(', ')}
                </p>
              )}
              <p className={`text-[11px] ${isOverflow ? 'text-white/70' : 'text-slate-400'}`}>
                Valid for today only — a new one is needed tomorrow.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="Assignment QR code" className="h-80 w-80 sm:h-40 sm:w-40" />
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`break-all text-xs hover:underline ${isOverflow ? 'text-[#60A5FA]' : 'text-[#2563EB]'}`}
              >
                {publicUrl}
              </a>
              <button
                type="button"
                onClick={() => setAssignmentAction((a) => (a === 'regenerate' ? null : 'regenerate'))}
                className={`w-full rounded-lg py-2.5 text-sm font-semibold transition hover:brightness-110 ${
                  isOverflow ? 'bg-white text-black' : 'bg-[#2563EB] text-white'
                }`}
              >
                Generate New
              </button>
            </Card>
          )}

          {shortfallPartnerships > 0 && (
            <div className="mx-auto max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-700">
              {shortfallPartnerships} fewer partnership{shortfallPartnerships === 1 ? '' : 's'}{' '}
              were created than requested — there weren&apos;t enough approved records in the selected territories. Create
              Auxiliary Groups below if more publishers than expected showed up.
            </div>
          )}

          <div className="mx-auto max-w-md text-center">
            {/* "Generate New" lives as a solid button inside the QR panel above while it's showing
                (not-done state); once the results summary/graph takes over, it moves down here
                instead of sitting inside that card. */}
            <div className="flex flex-wrap justify-center gap-3">
              {allPartnersDone && (
                <button
                  type="button"
                  onClick={() => setAssignmentAction((a) => (a === 'regenerate' ? null : 'regenerate'))}
                  className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                    assignmentAction === 'regenerate' ? 'bg-[#2563EB] text-white' : 'bg-blue-50 text-[#2563EB] hover:bg-blue-100'
                  }`}
                >
                  Generate New
                </button>
              )}
              {todaysTerritories.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAssignmentAction((a) => (a === 'generate' ? null : 'generate'))}
                  className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
                    assignmentAction === 'generate' ? 'bg-[#2563EB] text-white' : 'bg-blue-50 text-[#2563EB] hover:bg-blue-100'
                  }`}
                >
                  Create Auxiliary Groups
                </button>
              )}
            </div>

            {assignmentAction === 'generate' && todaysTerritories.length > 0 && (
              <div ref={assignmentPanelRef} className="mt-4 scroll-mt-4">
                <h2 className="mb-1 font-semibold text-[#0B1B33]">Create Auxiliary Groups</h2>
                <p className="mb-4 text-xs text-slate-500">
                  For extra publishers when a territory has more people than the original assignment had room for. Adds a new,
                  separate QR code — today&apos;s existing assignment(s) are untouched.
                </p>
                <OverflowAssignmentForm territories={todaysTerritories} />
              </div>
            )}

            {assignmentAction === 'regenerate' && (
              <div ref={assignmentPanelRef} className="mt-4 scroll-mt-4">
                <h2 className="mb-4 font-semibold text-[#0B1B33]">Generate New Assignment</h2>
                <p className="mb-4 text-xs text-slate-500">
                  Replaces every one of today&apos;s assignments (all batches) with a brand new one.
                </p>
                <AssignmentForm territories={activeTerritories} hasExistingBatch={true} />
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={ClipboardList} label="Total Contact Records" value={combinedStats.totalRecords} />
          <StatCard icon={CheckCircle2} label="Contact Records Completed" value={combinedStats.completedRecords} />
          <StatCard icon={Clock} label="Remaining Contact Records" value={combinedStats.remainingRecords} />
          <StatCard icon={Percent} label="Completion" value={`${combinedStats.completionPct}%`} />
          <StatCard icon={FilePlus} label="New Contact Records Submitted" value={combinedStats.newRecordsSubmitted} />
          <StatCard icon={BookOpen} label="Bible Studies in the Area" value={combinedStats.activeBibleStudies} />
        </div>
      )}

      {tab === 'dashboard' && (
        <div className="mt-8">
          <TerritoryVisitHistoryList entries={territoryHistory} />
        </div>
      )}

      {tab === 'results' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-semibold text-[#0B1B33]">Visit Results</h2>
            <p className="mt-1 text-sm text-slate-500">
              How every contact record has been logged so far today, across the currently generated assignment (House To House plus any
              Auxiliary Groups) — not a running history. The small arrow badge shows what&apos;s changed since you first opened this tab
              today.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {(
            [
              ['initial_visit', ClipboardList],
              ['return_visit', Repeat],
              ['potential_bible_study', Sparkles],
              ['started_bible_study', BookMarked],
              ['bible_study', BookOpen],
              ['progressing', TrendingUp],
              ['discontinued', XCircle],
              ['study_discontinued', BookX],
              ['not_home', DoorClosed],
              ['do_not_call', PhoneOff],
              ['moved', Truck],
              ['other', HelpCircle],
            ] as const
          ).map(([key, Icon]) => (
            <StatCard
              key={key}
              icon={Icon}
              label={VISIT_RESULT_LABELS[key]}
              value={combinedStats.resultCounts[key]}
              delta={combinedStats.resultCounts[key] - resultBaseline[key]}
            />
          ))}
          </div>
        </div>
      )}

      {/* Follows the batch switcher above (House To House / Auxiliary Groups) — only the
          currently selected batch's own partners, not every batch stacked on one page. */}
      {tab === 'progress' && (
        <PartnershipList
          partnerships={stats.partnerships}
          onEndPartnership={endPartnershipAction}
          onLoadAssignedRecords={getPartnershipAssignedRecordsAction}
        />
      )}

      {tab === 'faq' && <PublisherFAQ />}
    </div>
  )
}
