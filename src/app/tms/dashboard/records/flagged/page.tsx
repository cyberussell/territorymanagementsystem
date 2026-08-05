import Link from 'next/link'
import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import { listFlaggedForCorrection, listFlaggedForMove, listFlaggedForRemoval } from '@/lib/territory-management-system/modules/records/queries'
import {
  applyRecordCorrectionAction,
  applyRecordMoveAction,
  deleteRecordAction,
  dismissCorrectionRecommendationAction,
  dismissMoveRecommendationAction,
  dismissRemovalRecommendationAction,
  markRecordPendingAction,
} from '@/app/tms/actions/records'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import Card from '@/components/territory-management-system/dashboard/Card'
import ConfirmDeleteButton from '@/components/territory-management-system/dashboard/ConfirmDeleteButton'

export const dynamic = 'force-dynamic'

// Three independent publisher-flagged review queues on one page: records marked "Moved" and
// recommended for removal, records where the current resident knows where the person who used
// to live there moved to, and records where a Ministry Partner tapped "Update" to recommend a
// corrected Plus Code (or other wrong info). All three follow the same review-gated shape — the
// Admin applies or dismisses each one, nothing changes on the record until then.
export default async function FlaggedForRemovalPage() {
  const { supabase, congregation } = await requireAdmin()
  const [removalRecords, moveRecords, correctionRecords] = await Promise.all([
    listFlaggedForRemoval(supabase, congregation.id),
    listFlaggedForMove(supabase, congregation.id),
    listFlaggedForCorrection(supabase, congregation.id),
  ])

  return (
    <div className="space-y-8">
      <div>
        <PageHeader title="Flagged for Removal" subtitle="Contact records Ministry Partners have recommended the Admin remove." />
        {removalRecords.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">No records are currently flagged.</Card>
        ) : (
          <div className="space-y-3">
            {removalRecords.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tms/dashboard/records/${r.id}`}
                      className="font-medium text-[#0B1B33] hover:underline"
                    >
                      {r.address || r.plus_code || 'Unlabeled record'}
                      {r.unit ? `, ${r.unit}` : ''}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {r.territory?.name ?? '—'} / Section {r.section?.label ?? '—'} / Block {r.block?.label ?? '—'}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{r.removal_recommended_reason}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Recommended by {r.removal_recommended_by ?? 'Unknown'}
                      {r.removal_recommended_at &&
                        ` · ${new Date(r.removal_recommended_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <form action={dismissRemovalRecommendationAction.bind(null, r.id)}>
                      <button type="submit" className="text-sm font-medium text-slate-500 hover:underline">
                        Dismiss
                      </button>
                    </form>
                    <ConfirmDeleteButton
                      action={deleteRecordAction.bind(null, r.id)}
                      confirmMessage="Delete this contact record? This cannot be undone."
                      label="Delete"
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <PageHeader
          title="Flagged for Move"
          subtitle="Contact records where a Ministry Partner learned the new location the resident moved to."
        />
        {moveRecords.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">No records are currently flagged.</Card>
        ) : (
          <div className="space-y-3">
            {moveRecords.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tms/dashboard/records/${r.id}`}
                      className="font-medium text-[#0B1B33] hover:underline"
                    >
                      {r.address || r.plus_code || 'Unlabeled record'}
                      {r.unit ? `, ${r.unit}` : ''}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {r.territory?.name ?? '—'} / Section {r.section?.label ?? '—'} / Block {r.block?.label ?? '—'}
                      {r.status === 'pending' && <span className="ml-2 font-medium text-amber-600">Pending — excluded from generation</span>}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Current Address:{' '}
                      <span className="font-medium text-[#0B1B33]">
                        {r.address || '—'}
                        {r.unit ? `, ${r.unit}` : ''}
                      </span>
                      {' → Recommended: '}
                      <span className="font-medium text-[#0B1B33]">
                        {r.move_recommended_address}
                        {r.move_recommended_unit ? `, ${r.move_recommended_unit}` : ''}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Current Barangay/Section/Block:{' '}
                      <span className="font-medium text-[#0B1B33]">
                        {r.territory?.description ?? r.territory?.name ?? '—'} / Section {r.section?.label ?? '—'} / Block{' '}
                        {r.block?.label ?? '—'}
                      </span>
                      {' → Recommended: '}
                      <span className="font-medium text-[#0B1B33]">
                        {r.move_territory?.description ?? r.move_territory?.name ?? '—'} / Section {r.move_section?.label ?? '—'} / Block{' '}
                        {r.move_block?.label ?? '—'}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Current Plus Code: <span className="font-medium text-[#0B1B33]">{r.plus_code || '—'}</span>
                      {' → Recommended: '}
                      <span className="font-medium text-[#0B1B33]">{r.move_recommended_plus_code || '—'}</span>
                    </p>
                    {r.move_recommended_household_members != null && (
                      <p className="mt-1 text-sm text-slate-600">
                        Current Household Members: <span className="font-medium text-[#0B1B33]">{r.household_members ?? '—'}</span>
                        {' → Recommended: '}
                        <span className="font-medium text-[#0B1B33]">{r.move_recommended_household_members}</span>
                      </p>
                    )}
                    {r.move_recommended_notes && <p className="mt-1 text-sm text-slate-600">{r.move_recommended_notes}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      Recommended by {r.move_recommended_by ?? 'Unknown'}
                      {r.move_recommended_at &&
                        ` · ${new Date(r.move_recommended_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {r.status === 'approved' && (
                      <form action={markRecordPendingAction.bind(null, r.id)}>
                        <button type="submit" className="text-sm font-medium text-amber-600 hover:underline">
                          Mark as Pending
                        </button>
                      </form>
                    )}
                    <form action={dismissMoveRecommendationAction.bind(null, r.id)}>
                      <button type="submit" className="text-sm font-medium text-slate-500 hover:underline">
                        Dismiss
                      </button>
                    </form>
                    <form action={applyRecordMoveAction.bind(null, r.id)}>
                      <button
                        type="submit"
                        className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Apply Move
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <PageHeader
          title="Flagged for Correction"
          subtitle="Contact records a Ministry Partner has recommended a Plus Code (or other) correction for."
        />
        {correctionRecords.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-400">No records are currently flagged.</Card>
        ) : (
          <div className="space-y-3">
            {correctionRecords.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/tms/dashboard/records/${r.id}`}
                      className="font-medium text-[#0B1B33] hover:underline"
                    >
                      {r.address || r.plus_code || 'Unlabeled record'}
                      {r.unit ? `, ${r.unit}` : ''}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {r.territory?.name ?? '—'} / Section {r.section?.label ?? '—'} / Block {r.block?.label ?? '—'}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Current Plus Code: <span className="font-medium text-[#0B1B33]">{r.plus_code || '—'}</span>
                      {' → Recommended: '}
                      <span className="font-medium text-[#0B1B33]">{r.correction_recommended_plus_code}</span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Current Barangay/Section/Block:{' '}
                      <span className="font-medium text-[#0B1B33]">
                        {r.territory?.description ?? r.territory?.name ?? '—'} / Section {r.section?.label ?? '—'} / Block{' '}
                        {r.block?.label ?? '—'}
                      </span>
                      {' → Recommended: '}
                      <span className="font-medium text-[#0B1B33]">
                        {r.correction_territory?.description ?? r.correction_territory?.name ?? '—'} / Section{' '}
                        {r.correction_section?.label ?? '—'} / Block {r.correction_block?.label ?? '—'}
                      </span>
                    </p>
                    {r.correction_recommended_household_members != null && (
                      <p className="mt-1 text-sm text-slate-600">
                        Current Household Members: <span className="font-medium text-[#0B1B33]">{r.household_members ?? '—'}</span>
                        {' → Recommended: '}
                        <span className="font-medium text-[#0B1B33]">{r.correction_recommended_household_members}</span>
                      </p>
                    )}
                    {r.correction_recommended_resident_name && (
                      <p className="mt-1 text-sm text-slate-600">
                        Current Resident Name: <span className="font-medium text-[#0B1B33]">{r.resident_name || '—'}</span>
                        {' → Recommended: '}
                        <span className="font-medium text-[#0B1B33]">{r.correction_recommended_resident_name}</span>
                      </p>
                    )}
                    <p className="mt-1 text-sm text-slate-600">{r.correction_recommended_reason}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      Recommended by {r.correction_recommended_by ?? 'Unknown'}
                      {r.correction_recommended_at &&
                        ` · ${new Date(r.correction_recommended_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <form action={dismissCorrectionRecommendationAction.bind(null, r.id)}>
                      <button type="submit" className="text-sm font-medium text-slate-500 hover:underline">
                        Dismiss
                      </button>
                    </form>
                    <form action={applyRecordCorrectionAction.bind(null, r.id)}>
                      <button
                        type="submit"
                        className="rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-3 py-1.5 text-sm font-semibold text-white transition hover:brightness-110"
                      >
                        Apply Correction
                      </button>
                    </form>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
