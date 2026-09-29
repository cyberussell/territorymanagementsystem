'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Mail, Pencil, Trash2 } from 'lucide-react'
import type { PlatformCongregation } from '@/lib/territory-management-system/modules/platform/queries'
import { createCongregationAction, deleteCongregationAction, resendAdminInviteAction } from '@/app/tms/actions/platform'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import { usePrompt } from '@/lib/territory-management-system/hooks/usePrompt'
import EditCongregationModal from './EditCongregationModal'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'
import DataTable from '@/components/territory-management-system/dashboard/DataTable'

export default function PlatformCongregationsManager({ congregations }: { congregations: PlatformCongregation[] }) {
  const router = useRouter()
  const { dispatch, pending, error, successMessage, state } = useServerAction(createCongregationAction, ['SAVED'], 'Congregation added — invite sent.')
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<PlatformCongregation | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const { prompt, PromptDialog } = usePrompt()

  useEffect(() => {
    if (successMessage) router.refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  function resendInvite(profileId: string, email: string | null) {
    setResendingId(profileId)
    startTransition(async () => {
      const result = await resendAdminInviteAction(profileId)
      setResendingId(null)
      if (result.error) toast.error(result.error)
      else toast.success(`Invite re-sent to ${email ?? 'the Administrator'}.`)
    })
  }

  // Typed confirmation rather than a yes/no: this wipes every record, visit and assignment the
  // congregation has, plus its Administrator and Group Leader logins, and can't be undone.
  // The server re-checks the typed number (deleteCongregationPermanently).
  async function deleteCongregation(c: PlatformCongregation) {
    const typed = await prompt({
      title: `Delete ${c.name}?`,
      message: `This permanently deletes the congregation, its ${c.territoryCount} territories and ${c.recordCount} records, all visit history and assignments, and the Administrator and Group Leader logins. It cannot be undone. Type the congregation number (${c.congregationNumber}) to confirm.`,
      placeholder: c.congregationNumber,
      confirmLabel: 'Delete permanently',
      variant: 'danger',
    })
    if (typed === null) return
    if (typed.trim() !== c.congregationNumber) {
      toast.error('The congregation number you typed does not match. Nothing was deleted.')
      return
    }
    setDeletingId(c.id)
    startTransition(async () => {
      const result = await deleteCongregationAction(c.id, typed)
      setDeletingId(null)
      if (result.error) toast.error(result.error)
      else toast.success(`${c.name} was deleted.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {PromptDialog}
      {editing && <EditCongregationModal key={editing.id} congregation={editing} onClose={() => setEditing(null)} />}
      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Add Congregation</h2>
        {/* Keyed on state so a successful submit remounts the form empty. */}
        <form action={dispatch} key={successMessage ? JSON.stringify(state) : 'create-form'} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Congregation name">
            <input name="name" required maxLength={120} className={inputClass} />
          </FormField>
          <FormField label="Congregation number">
            <input name="congregationNumber" required maxLength={20} inputMode="numeric" className={inputClass} />
          </FormField>
          <FormField label="Administrator email">
            <input name="adminEmail" type="email" required className={inputClass} />
          </FormField>
          <FormField label="Administrator name" optional>
            <input name="adminName" maxLength={120} className={inputClass} />
          </FormField>
          <FormField label="Time zone">
            <input name="timezone" required defaultValue="Asia/Manila" className={inputClass} />
          </FormField>
          <p className="text-xs text-slate-500 sm:self-center">
            The Administrator gets an email with a link to set their password, then signs in at /tms/login.
          </p>
          {error && <p className="text-sm text-red-500 sm:col-span-2">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 sm:col-span-2"
          >
            <Building2 className="h-4 w-4" aria-hidden />
            {pending ? 'Adding…' : 'Add Congregation & Send Invite'}
          </button>
        </form>
      </Card>

      <DataTable
        columns={[
          {
            header: 'Congregation',
            cell: (c) => (
              <div>
                <p className="font-medium text-[#0B1B33]">{c.name}</p>
                <p className="text-xs text-slate-500">
                  No. {c.congregationNumber} · {c.timezone}
                </p>
              </div>
            ),
            sortValue: (c) => c.name,
          },
          {
            header: 'Administrator',
            cell: (c) =>
              c.admins.length === 0 ? (
                <span className="text-sm text-slate-400">None</span>
              ) : (
                <ul className="space-y-1">
                  {c.admins.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-[#0B1B33]">{a.email ?? a.fullName ?? '—'}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          a.hasSignedIn ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {a.hasSignedIn ? 'Active' : 'Invite pending'}
                      </span>
                      {!a.hasSignedIn && a.email && (
                        <button
                          type="button"
                          disabled={resendingId === a.id}
                          onClick={() => resendInvite(a.id, a.email)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline disabled:opacity-50"
                        >
                          <Mail className="h-3 w-3" aria-hidden />
                          {resendingId === a.id ? 'Sending…' : 'Resend'}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ),
          },
          { header: 'Group Leaders', cell: (c) => c.groupLeaderCount, sortValue: (c) => c.groupLeaderCount },
          { header: 'Territories', cell: (c) => c.territoryCount, sortValue: (c) => c.territoryCount },
          { header: 'Records', cell: (c) => c.recordCount, sortValue: (c) => c.recordCount },
          {
            header: 'Added',
            cell: (c) => new Date(c.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }),
            sortValue: (c) => c.createdAt,
          },
          {
            header: 'Actions',
            cell: (c) => (
              <div className="flex items-center gap-3 whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setEditing(c)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] hover:underline"
                >
                  <Pencil className="h-3 w-3" aria-hidden />
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deletingId === c.id}
                  onClick={() => deleteCongregation(c)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  {deletingId === c.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ),
          },
        ]}
        rows={congregations}
        emptyMessage="No congregations yet."
      />
    </div>
  )
}
