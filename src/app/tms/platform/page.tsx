import { requireSuperAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { listPlatformCongregations } from '@/lib/territory-management-system/modules/platform/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import PlatformCongregationsManager from '@/components/territory-management-system/platform/PlatformCongregationsManager'

export const dynamic = 'force-dynamic'

export default async function PlatformPage() {
  await requireSuperAdmin()
  // Super admins get nothing through RLS — the role was verified just above, so the
  // service-role client reads across every congregation here.
  const congregations = await listPlatformCongregations(createAdminSupabase())

  return (
    <div>
      <PageHeader title="Congregations" subtitle="Add a congregation and invite its Administrator by email." />
      <PlatformCongregationsManager congregations={congregations} />
    </div>
  )
}
