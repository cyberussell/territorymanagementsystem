import Link from 'next/link'
import { Plus } from 'lucide-react'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { listTerritories } from '@/lib/territory-management-system/modules/territory/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import TerritoriesTable from '@/components/territory-management-system/TerritoriesTable'

export default async function TerritoriesPage() {
  const { supabase, congregation } = await requireAdmin()
  const territories = await listTerritories(supabase, congregation.id)

  return (
    <div>
      <PageHeader
        title="Territories"
        subtitle="Create and manage your congregation's territories."
        action={
          <Link
            href="/tms/dashboard/territories/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
          >
            <Plus className="h-4 w-4" />
            New Territory
          </Link>
        }
      />
      <TerritoriesTable territories={territories} />
    </div>
  )
}
