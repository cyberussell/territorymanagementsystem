'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Mail } from 'lucide-react'
import type { PlatformCongregation } from '@/lib/territory-management-system/modules/platform/queries'
import { createCongregationAction, resendAdminInviteAction } from '@/app/tms/actions/platform'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'
import DataTable from '@/components/territory-management-system/dashboard/DataTable'

export default function PlatformCongregationsManager({ congregations }: { congregations: PlatformCongregation[] }) {
  const router = useRouter()
  const { dispatch, pending, error, successMessage, state } = useServerAction(createCongregationAction, ['SAVED'], 'Congregation added — invite sent.')
  const [resendingId, setResendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

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

  return (
    <div className="space-y-6">
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
        ]}
        rows={congregations}
        emptyMessage="No congregations yet."
      />
    </div>
  )
}
