import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import CongregationSettingsForm from '@/components/territory-management-system/CongregationSettingsForm'

export default async function SettingsPage() {
  const { congregation } = await requireAdmin()

  return (
    <div>
      <PageHeader title="Settings" subtitle="Congregation profile and application preferences." />
      <CongregationSettingsForm congregation={congregation} />
    </div>
  )
}
