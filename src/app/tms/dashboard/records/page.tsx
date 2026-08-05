import Link from 'next/link'
import { Flag } from 'lucide-react'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { listFlaggedForRemoval, listRecords } from '@/lib/territory-management-system/modules/records/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import RecordsTable from '@/components/territory-management-system/RecordsTable'
import CsvExportButton from '@/components/territory-management-system/CsvExportButton'
import CsvImportDialog from '@/components/territory-management-system/CsvImportDialog'

export default async function RecordsPage() {
  const { supabase, congregation } = await requireAdmin()
  const [records, flagged] = await Promise.all([listRecords(supabase, congregation.id), listFlaggedForRemoval(supabase, congregation.id)])

  return (
    <div>
      <PageHeader
        title="Contact Records"
        subtitle="Search, filter, and review every address across all territories."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/tms/dashboard/records/flagged"
              className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 hover:border-red-300"
            >
              <Flag className="h-4 w-4" />
              Flagged for Removal
              {flagged.length > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">{flagged.length}</span>
              )}
            </Link>
            <CsvImportDialog />
            <CsvExportButton href="/tms/dashboard/records/export" />
          </div>
        }
      />
      <RecordsTable records={records} />
    </div>
  )
}
