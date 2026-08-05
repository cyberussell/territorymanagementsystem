import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { listGroupLeaders } from '@/lib/territory-management-system/modules/groupLeaders/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import GroupLeadersManager from '@/components/territory-management-system/GroupLeadersManager'

export const dynamic = 'force-dynamic'

export default async function GroupLeadersPage() {
  const { congregation } = await requireAdmin()
  // profiles RLS only ever allowed reading your own row — listing every Group Leader in the
  // congregation needs the service-role client, with congregation scoping done explicitly here.
  const admin = createAdminSupabase()
  const groupLeaders = await listGroupLeaders(admin, congregation.id)

  return (
    <div>
      <PageHeader title="Group Leaders" subtitle="Invite Territory Group Leaders and manage their access." />
      <GroupLeadersManager initialGroupLeaders={groupLeaders} />
    </div>
  )
}
