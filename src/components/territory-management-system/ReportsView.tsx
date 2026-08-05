'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import {
  BookMarked,
  BookOpen,
  BookX,
  CheckCircle2,
  ClipboardList,
  Clock,
  DoorClosed,
  FilePlus,
  Percent,
  PhoneOff,
  Repeat,
  Sparkles,
  TrendingUp,
  Truck,
  XCircle,
} from 'lucide-react'
import type { RecordLocation, ReportStats, TerritoryReportRow } from '@/lib/territory-management-system/modules/reports/queries'
import { VISIT_RESULT_LABELS } from '@/lib/territory-management-system/modules/records/schema'
import FilterPills from '@/components/territory-management-system/dashboard/FilterPills'
import StatCard from '@/components/territory-management-system/dashboard/StatCard'
import TerritoryReportTable from '@/components/territory-management-system/TerritoryReportTable'
import Card from '@/components/territory-management-system/dashboard/Card'

// Leaflet touches `window`/`document` on import — it can't run during server rendering, so this
// is loaded client-only, same pattern Next.js recommends for any browser-only map library.
const HouseholdDistributionMap = dynamic(() => import('@/components/territory-management-system/HouseholdDistributionMap'), {
  ssr: false,
  loading: () => (
    <Card className="p-10 text-center">
      <p className="text-sm text-slate-600">Loading map…</p>
    </Card>
  ),
})

type Period = 'daily' | 'weekly' | 'monthly'

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
]

export default function ReportsView({
  daily,
  weekly,
  monthly,
  territoryRows,
  recordLocations,
}: {
  daily: ReportStats
  weekly: ReportStats
  monthly: ReportStats
  territoryRows: TerritoryReportRow[]
  recordLocations: RecordLocation[]
}) {
  const [period, setPeriod] = useState<Period>('daily')
  const stats = { daily, weekly, monthly }[period]

  return (
    <div className="space-y-6">
      <FilterPills options={PERIODS} active={period} onChange={setPeriod} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={ClipboardList} label="Total Contact Records" value={stats.totalRecords} />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.completedRecords} />
        <StatCard icon={Clock} label="Remaining" value={stats.remainingRecords} />
        <StatCard icon={Percent} label="Completion" value={`${stats.completionPct}%`} />
        <StatCard icon={FilePlus} label="New Contact Records Submitted" value={stats.newRecordsSubmitted} />
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Visits</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
          <StatCard icon={ClipboardList} label={VISIT_RESULT_LABELS.initial_visit} value={stats.resultCounts.initial_visit} />
          <StatCard icon={Repeat} label={VISIT_RESULT_LABELS.return_visit} value={stats.resultCounts.return_visit} />
          <StatCard icon={Sparkles} label={VISIT_RESULT_LABELS.potential_bible_study} value={stats.resultCounts.potential_bible_study} />
          <StatCard icon={BookMarked} label={VISIT_RESULT_LABELS.started_bible_study} value={stats.resultCounts.started_bible_study} />
          <StatCard icon={BookOpen} label={VISIT_RESULT_LABELS.bible_study} value={stats.resultCounts.bible_study} />
          <StatCard icon={TrendingUp} label={VISIT_RESULT_LABELS.progressing} value={stats.resultCounts.progressing} />
          <StatCard icon={XCircle} label={VISIT_RESULT_LABELS.discontinued} value={stats.resultCounts.discontinued} />
          <StatCard icon={BookX} label={VISIT_RESULT_LABELS.study_discontinued} value={stats.resultCounts.study_discontinued} />
          <StatCard icon={DoorClosed} label={VISIT_RESULT_LABELS.not_home} value={stats.resultCounts.not_home} />
          <StatCard icon={PhoneOff} label={VISIT_RESULT_LABELS.do_not_call} value={stats.resultCounts.do_not_call} />
          <StatCard icon={Truck} label={VISIT_RESULT_LABELS.moved} value={stats.resultCounts.moved} />
        </div>
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Per-Territory Breakdown</h2>
        <TerritoryReportTable rows={territoryRows} />
      </div>

      <div>
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Household Distribution</h2>
        <HouseholdDistributionMap records={recordLocations} />
      </div>
    </div>
  )
}
