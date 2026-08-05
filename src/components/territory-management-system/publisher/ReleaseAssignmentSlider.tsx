'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { PartnershipWithProgress } from '@/lib/territory-management-system/modules/assignment/types'
import { getClaimedPartnershipToken, clearClaimedPartnershipToken } from '@/lib/territory-management-system/modules/offline/claim'
import { releasePartnershipAction } from '@/app/tms/actions/publisher'
import SlideToConfirm from './SlideToConfirm'

// Lives on the batch-landing "Select your Partner" page (moved here from the workspace's own
// Home tab, per Russell's ask) — a change of mind before any real work, so it needs to know
// which partnership THIS device has already claimed. That's local-only state (see claim.ts),
// hence the client component reading it in an effect rather than the server-rendered page
// knowing it directly.
export default function ReleaseAssignmentSlider({ batchToken, partnerships }: { batchToken: string; partnerships: PartnershipWithProgress[] }) {
  const router = useRouter()
  const [claimedToken, setClaimedToken] = useState<string | null>(null)

  useEffect(() => {
    setClaimedToken(getClaimedPartnershipToken(batchToken))
  }, [batchToken])

  const claimed = claimedToken ? partnerships.find((p) => p.claim_token === claimedToken) : undefined
  // Same eligibility rule releasePartnershipAction re-checks server-side: claimed, session not
  // already ended, and zero visits logged yet (a real "no work happened" gate, not just "not
  // finished").
  const canRelease = Boolean(claimed?.claimed_at) && !claimed?.finished_at && !claimed?.ended_early_at && claimed?.completedCount === 0
  if (!claimed || !canRelease) return null

  async function handleRelease() {
    const formData = new FormData()
    formData.set('partnershipToken', claimedToken as string)
    const result = await releasePartnershipAction({}, formData)
    if (result.error && result.error !== 'SAVED') {
      toast.error(result.error)
      return
    }
    clearClaimedPartnershipToken(batchToken)
    toast.success('Partnership released.')
    setClaimedToken(null)
    router.refresh()
  }

  return (
    <div className="mt-4">
      <SlideToConfirm label={`Slide to Release "${claimed.name}"`} confirmingLabel="Releasing…" tone="primary" onConfirm={handleRelease} />
    </div>
  )
}
