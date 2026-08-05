import { notFound } from 'next/navigation'
import { createAdminSupabase } from '@/lib/territory-management-system/supabase-server'
import { getPartnershipByToken } from '@/lib/territory-management-system/modules/assignment/queries'
import { getTerritoryStructure } from '@/lib/territory-management-system/modules/territory/queries'
import type { TerritoryStructure } from '@/lib/territory-management-system/modules/territory/types'
import PublisherWorkspaceApp from '@/components/territory-management-system/publisher/PublisherWorkspaceApp'
import AssignmentEndedNotice from '@/components/territory-management-system/publisher/AssignmentEndedNotice'

export const dynamic = 'force-dynamic'

const VALID_INITIAL_VIEWS = ['home', 'list', 'addedRecords'] as const
type InitialView = (typeof VALID_INITIAL_VIEWS)[number]

export default async function PartnershipWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ batchToken: string; partnershipToken: string }>
  searchParams: Promise<{ view?: string }>
}) {
  const { batchToken, partnershipToken } = await params
  const { view } = await searchParams
  const supabase = createAdminSupabase()
  const partnership = await getPartnershipByToken(supabase, partnershipToken)
  if (!partnership || partnership.batch.access_token !== batchToken) notFound()
  if (partnership.expired) return <AssignmentEndedNotice />

  const territoryStructures = await Promise.all(
    partnership.territories.map((t) => getTerritoryStructure(supabase, partnership.congregation_id, t.id))
  )
  const validStructures = territoryStructures.filter((s): s is TerritoryStructure => s !== null)
  // From BatchLandingBottomMenu, which links straight into a specific tab (the workspace has no
  // route per tab otherwise, so this ?view= param is the only way to land somewhere other than
  // Home on first mount) — anything else falls back to the normal Home default.
  const initialView: InitialView = (VALID_INITIAL_VIEWS as readonly string[]).includes(view ?? '') ? (view as InitialView) : 'home'

  return (
    <PublisherWorkspaceApp
      batchToken={batchToken}
      partnershipToken={partnershipToken}
      initialWorkspace={partnership}
      territoryStructures={validStructures}
      initialView={initialView}
    />
  )
}
