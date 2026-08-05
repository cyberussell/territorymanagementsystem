import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import PublisherFAQ from '@/components/territory-management-system/publisher/PublisherFAQ'

export default async function FaqPage() {
  await requireAdmin()

  return (
    <div>
      <PageHeader title="FAQ" subtitle="The same FAQ Ministry Partners see in their workspace." />
      <PublisherFAQ />
    </div>
  )
}
