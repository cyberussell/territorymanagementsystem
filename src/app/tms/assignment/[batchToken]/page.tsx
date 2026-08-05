import { notFound } from 'next/navigation'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { getBatchByToken } from '@/lib/territory-management-system/modules/assignment/queries'
import PartnershipCard from '@/components/territory-management-system/publisher/PartnershipCard'
import AssignmentEndedNotice from '@/components/territory-management-system/publisher/AssignmentEndedNotice'
import ReleaseAssignmentSlider from '@/components/territory-management-system/publisher/ReleaseAssignmentSlider'
import BatchLandingBottomMenu from '@/components/territory-management-system/publisher/BatchLandingBottomMenu'

export const dynamic = 'force-dynamic'

export default async function BatchLandingPage({ params }: { params: Promise<{ batchToken: string }> }) {
  const { batchToken } = await params
  const supabase = createAdminSupabase()
  const batch = await getBatchByToken(supabase, batchToken)
  if (!batch) notFound()
  if (batch.expired) return <AssignmentEndedNotice />

  return (
    <div className="min-h-dvh bg-[#C9D8EE] px-4 pb-24 pt-8">
      <div className="mx-auto max-w-lg">
        <h1 className="text-center text-xl font-bold text-[#0B1B33]">
          {batch.is_overflow ? 'Searching Assignment' : 'House To House Ministry'}
        </h1>
        <p className="mt-1 text-center text-sm text-slate-700">
          {batch.assignment_date} — {batch.territories.map((t) => t.name).join(', ') || '—'}
        </p>
        <p className="mt-4 text-center text-sm text-slate-700">Select Ministry Partner Number</p>
        <div className="mt-4 space-y-3">
          {batch.partnerships.map((p) => (
            <PartnershipCard key={p.id} partnership={p} batchToken={batchToken} />
          ))}
        </div>

        <ReleaseAssignmentSlider batchToken={batchToken} partnerships={batch.partnerships} />
      </div>

      <BatchLandingBottomMenu batchToken={batchToken} />
    </div>
  )
}
