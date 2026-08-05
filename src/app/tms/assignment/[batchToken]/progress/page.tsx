import { notFound } from 'next/navigation'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { getBatchByToken } from '@/lib/territory-management-system/modules/assignment/queries'
import PartnershipList from '@/components/territory-management-system/PartnershipList'
import AssignmentEndedNotice from '@/components/territory-management-system/publisher/AssignmentEndedNotice'

export const dynamic = 'force-dynamic'

export default async function ProgressPage({ params }: { params: Promise<{ batchToken: string }> }) {
  const { batchToken } = await params
  const supabase = createAdminSupabase()
  const batch = await getBatchByToken(supabase, batchToken)
  if (!batch) notFound()
  if (batch.expired) return <AssignmentEndedNotice />

  return (
    <div className="min-h-dvh bg-[#C9D8EE] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-center text-xl font-bold text-[#0B1B33]">Today&apos;s Assignment Progress</h1>
        <p className="mt-1 text-center text-sm text-slate-700">{batch.assignment_date}</p>
        <div className="mt-6">
          <PartnershipList partnerships={batch.partnerships} />
        </div>
      </div>
    </div>
  )
}
