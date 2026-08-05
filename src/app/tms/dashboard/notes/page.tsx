import { requireAdmin } from '@/lib/territory-management-system/modules/auth/queries'
import {
  listPartnershipNotesForCongregation,
  listPartnershipQuickNotesForCongregation,
} from '@/lib/territory-management-system/modules/assignment/queries'
import PageHeader from '@/components/territory-management-system/dashboard/PageHeader'
import Card from '@/components/territory-management-system/dashboard/Card'

export const dynamic = 'force-dynamic'

type Entry =
  | { kind: 'endOfMinistry'; id: string; partnershipName: string; body: string; at: string; assignmentDate: string }
  | { kind: 'quickNote'; id: string; partnershipName: string; name: string; phone: string | null; body: string; at: string }

// Admin-only — merges two sources, newest first: the single optional note a Ministry Partner can
// leave at the end of their ministry, and any number of quick notes (Name/Phone/Notes) sent
// throughout the day as the unstructured alternative to Add Record / Recommend New Location.
// Deliberately not surfaced anywhere in the Group Leader dashboard.
export default async function NotesPage() {
  const { supabase, congregation } = await requireAdmin()
  const [notes, quickNotes] = await Promise.all([
    listPartnershipNotesForCongregation(supabase, congregation.id),
    listPartnershipQuickNotesForCongregation(supabase, congregation.id),
  ])

  const entries: Entry[] = [
    ...notes.map(
      (n): Entry => ({
        kind: 'endOfMinistry',
        id: n.id,
        partnershipName: n.name,
        body: n.admin_note,
        at: n.admin_note_at,
        assignmentDate: n.assignment_date,
      })
    ),
    ...quickNotes.map(
      (n): Entry => ({ kind: 'quickNote', id: n.id, partnershipName: n.partnershipName, name: n.name, phone: n.phone, body: n.notes, at: n.created_at })
    ),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <div>
      <PageHeader title="Notes" subtitle="End-of-ministry notes and quick notes Ministry Partners have sent." />
      {entries.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">No notes have been submitted yet.</Card>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <Card key={`${e.kind}-${e.id}`} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-[#0B1B33]">{e.kind === 'quickNote' ? e.name : e.partnershipName}</p>
                  {e.kind === 'quickNote' && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#2563EB]">Quick Note</span>
                  )}
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(e.at).toLocaleDateString('en-US', { dateStyle: 'medium' })} ·{' '}
                  {new Date(e.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
              {e.kind === 'quickNote' ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  From {e.partnershipName}
                  {e.phone ? ` · ${e.phone}` : ''}
                </p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{e.body}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
