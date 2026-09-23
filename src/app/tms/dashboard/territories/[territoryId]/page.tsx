import { notFound } from 'next/navigation'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { getTerritoryStructure, withSignedTerritoryMapUrls } from '@/lib/territory-management-system/modules/territory/queries'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { listRecords } from '@/lib/territory-management-system/modules/records/queries'
import { deleteTerritoryAction } from '@/app/tms/actions/territories'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import ConfirmDeleteButton from '@/components/territory-management-system/dashboard/ConfirmDeleteButton'
import TerritoryDetailsForm from '@/components/territory-management-system/TerritoryDetailsForm'
import TerritoryMapUpload from '@/components/territory-management-system/TerritoryMapUpload'
import TerritoryTabs from '@/components/territory-management-system/TerritoryTabs'
import CsvImportDialog from '@/components/territory-management-system/CsvImportDialog'
import CsvExportButton from '@/components/territory-management-system/CsvExportButton'

export const dynamic = 'force-dynamic'

export default async function TerritoryDetailPage({ params }: { params: Promise<{ territoryId: string }> }) {
  const { territoryId } = await params
  const { supabase, congregation } = await requireAdmin()
  const territory = await getTerritoryStructure(supabase, congregation.id, territoryId)
  if (!territory) notFound()
  // The territory was just loaded through the admin's own RLS-scoped session (and filtered by
  // their congregation), so it's safe to sign its map with the service-role client.
  const [records, [signedTerritory]] = await Promise.all([
    listRecords(supabase, congregation.id, territoryId),
    withSignedTerritoryMapUrls(createAdminSupabase(), [territory]),
  ])

  return (
    <div className="space-y-8">
      <PageHeader
        title={territory.name}
        subtitle={territory.description || undefined}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <CsvImportDialog territoryId={territory.id} />
            <CsvExportButton href={`/tms/dashboard/records/export?territoryId=${territory.id}`} />
            <ConfirmDeleteButton
              action={deleteTerritoryAction.bind(null, territory.id)}
              confirmMessage={`Delete ${territory.name}? This deletes all its sections, blocks, and contact records.`}
              label="Delete Territory"
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TerritoryDetailsForm territory={territory} />
        <TerritoryMapUpload territoryId={territory.id} territoryName={territory.name} mapImageUrl={signedTerritory.map_image_url} />
      </div>

      <TerritoryTabs territory={territory} records={records} />
    </div>
  )
}
