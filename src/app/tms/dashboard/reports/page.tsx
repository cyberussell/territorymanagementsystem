import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import {
  getApprovedRecordLocations,
  getReportStats,
  getTerritoryReportRows,
} from '@/lib/territory-management-system/modules/reports/queries'
import { dailyRange, monthlyRange, weeklyRange } from '@/lib/territory-management-system/modules/reports/date'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import ReportsView from '@/components/territory-management-system/ReportsView'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const { supabase, congregation } = await requireAdmin()
  const [daily, weekly, monthly, territoryRows, recordLocations] = await Promise.all([
    getReportStats(supabase, congregation.id, dailyRange(congregation.timezone), congregation.timezone),
    getReportStats(supabase, congregation.id, weeklyRange(congregation.timezone), congregation.timezone),
    getReportStats(supabase, congregation.id, monthlyRange(congregation.timezone), congregation.timezone),
    getTerritoryReportRows(supabase, congregation.id),
    getApprovedRecordLocations(supabase, congregation.id),
  ])

  return (
    <div>
      <PageHeader title="Reports" subtitle="Territory work summary for the congregation." />
      <ReportsView daily={daily} weekly={weekly} monthly={monthly} territoryRows={territoryRows} recordLocations={recordLocations} />
    </div>
  )
}
