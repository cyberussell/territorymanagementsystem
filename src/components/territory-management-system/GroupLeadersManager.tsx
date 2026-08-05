'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { KeyRound, UserPlus } from 'lucide-react'
import type { GroupLeaderProfile } from '@/lib/territory-management-system/modules/groupLeaders/queries'
import {
  deleteGroupLeaderAction,
  inviteGroupLeaderAction,
  resetGroupLeaderPasswordAction,
  restoreGroupLeaderAccessAction,
  revokeGroupLeaderAccessAction,
  type InviteGroupLeaderResult,
} from '@/app/tms/actions/group-leaders'
import { useServerAction } from '@/lib/territory-management-system/hooks/useServerAction'
import { useConfirm } from '@/lib/territory-management-system/hooks/useConfirm'
import { usePrompt } from '@/lib/territory-management-system/hooks/usePrompt'
import type { ConfirmVariant } from '@/components/territory-management-system/ConfirmModal'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'
import DataTable from '@/components/territory-management-system/dashboard/DataTable'

// Rendered straight from the initialGroupLeaders prop (no local copy) — every mutation below
// calls router.refresh() on success, which re-runs the parent Server Component and passes a
// fresh array down, same as ConfirmDeleteButton's redirect-based pattern elsewhere in this
// product achieves, just without a full navigation.
export default function GroupLeadersManager({ initialGroupLeaders }: { initialGroupLeaders: GroupLeaderProfile[] }) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const { dispatch, pending: invitePending, error, successMessage, state } = useServerAction<InviteGroupLeaderResult>(
    inviteGroupLeaderAction,
    ['SAVED']
  )
  // Holds whichever temp password (invite or reset) needs to stay visible until the Admin
  // dismisses it — a toast would vanish before there's time to copy/relay it.
  const [revealedPassword, setRevealedPassword] = useState<{ name: string; password: string } | null>(null)
  const { confirm, ConfirmDialog } = useConfirm()
  const { prompt, PromptDialog } = usePrompt()

  useEffect(() => {
    if (successMessage) {
      router.refresh()
      if (state.tempPassword) setRevealedPassword({ name: 'the new Group Leader', password: state.tempPassword })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [successMessage])

  async function runAction(
    id: string,
    action: (id: string) => Promise<{ error?: string }>,
    confirmMessage: string,
    successToast: string,
    variant: ConfirmVariant
  ) {
    const ok = await confirm({ message: confirmMessage, variant })
    if (!ok) return
    setPendingId(id)
    startTransition(async () => {
      const result = await action(id)
      setPendingId(null)
      if (result.error) toast.error(result.error)
      else {
        toast.success(successToast)
        router.refresh()
      }
    })
  }

  async function runResetPassword(id: string, name: string) {
    // Same override as the invite form (a text field there, a prompt here since this is a
    // single-click row action with no form of its own) — leave blank to auto-generate.
    const custom = await prompt({
      title: 'Reset password',
      message: `Reset the password for ${name}? Optionally set a custom temporary password (at least 8 characters) — leave blank to auto-generate one.`,
      placeholder: 'Leave blank to auto-generate',
      confirmLabel: 'Reset',
    })
    if (custom === null) return // cancelled
    if (custom && custom.length < 8) {
      toast.error('Temporary password must be at least 8 characters.')
      return
    }
    setPendingId(id)
    startTransition(async () => {
      const result = await resetGroupLeaderPasswordAction(id, custom || undefined)
      setPendingId(null)
      if (result.error) toast.error(result.error)
      else if (result.tempPassword) {
        setRevealedPassword({ name, password: result.tempPassword })
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {ConfirmDialog}
      {PromptDialog}
      {revealedPassword && (
        <Card className="border-2 border-[#2563EB] p-6">
          <h2 className="font-semibold text-[#0B1B33]">Temporary password for {revealedPassword.name}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Share this with them directly — it won&apos;t be shown again. They&apos;ll be asked to set their own password the
            first time they log in.
          </p>
          <p className="mt-3 select-all rounded-lg border border-blue-100 bg-[#F8FBFF] px-4 py-3 text-center font-mono text-lg font-semibold tracking-wide text-[#0B1B33]">
            {revealedPassword.password}
          </p>
          <button
            type="button"
            onClick={() => setRevealedPassword(null)}
            className="mt-3 w-full rounded-lg border border-blue-100 bg-white py-2 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40"
          >
            Done — I&apos;ve shared it
          </button>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-4 font-semibold text-[#0B1B33]">Invite Group Leader</h2>
        <form action={dispatch} key={successMessage ?? 'invite-form'} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="First name">
            <input name="firstName" required maxLength={60} className={inputClass} />
          </FormField>
          <FormField label="Last name">
            <input name="lastName" required maxLength={60} className={inputClass} />
          </FormField>
          <FormField label="Email">
            <input name="email" type="email" required className={inputClass} />
          </FormField>
          <FormField label="Temporary password" optional>
            <input
              name="tempPassword"
              type="text"
              minLength={8}
              maxLength={72}
              placeholder="Leave blank to auto-generate"
              className={inputClass}
            />
          </FormField>
          <p className="text-xs text-slate-500 sm:col-span-2 sm:self-center">
            Auto-generated passwords can be hard to relay — set something easier to type if you&apos;d like. At least 8
            characters either way.
          </p>
          {error && <p className="text-sm text-red-500 sm:col-span-3">{error}</p>}
          <button
            type="submit"
            disabled={invitePending}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50 sm:col-span-3"
          >
            <UserPlus className="h-4 w-4" />
            {invitePending ? 'Sending Invite…' : 'Send Invite'}
          </button>
        </form>
      </Card>

      <DataTable
        columns={[
          { header: 'Name', cell: (g) => g.full_name || '—', sortValue: (g) => g.full_name },
          { header: 'Email', cell: (g) => g.email ?? '—' },
          {
            header: 'Invited',
            cell: (g) => new Date(g.created_at).toLocaleDateString('en-US', { dateStyle: 'medium' }),
            sortValue: (g) => g.created_at,
          },
          {
            header: 'Status',
            cell: (g) => (
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    g.revoked_at ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'
                  }`}
                >
                  {g.revoked_at ? 'Revoked' : 'Active'}
                </span>
              </div>
            ),
          },
          {
            header: 'Actions',
            cell: (g) => {
              const rowPending = isPending && pendingId === g.id
              return (
                <div className="flex flex-wrap items-center gap-3">
                  {g.revoked_at ? (
                    <button
                      type="button"
                      disabled={rowPending}
                      onClick={() =>
                        runAction(g.id, restoreGroupLeaderAccessAction, `Restore access for ${g.full_name}?`, 'Access restored.', 'info')
                      }
                      className="text-sm font-medium text-[#2563EB] hover:underline disabled:opacity-50"
                    >
                      Restore Access
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={rowPending}
                      onClick={() =>
                        runAction(
                          g.id,
                          revokeGroupLeaderAccessAction,
                          `Revoke access for ${g.full_name}? They will be immediately logged out and unable to log back in.`,
                          'Access revoked.',
                          'caution'
                        )
                      }
                      className="text-sm font-medium text-amber-600 hover:underline disabled:opacity-50"
                    >
                      Revoke Access
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={rowPending}
                    onClick={() => runResetPassword(g.id, g.full_name)}
                    className="inline-flex items-center gap-1 text-sm font-medium text-[#2563EB] hover:underline disabled:opacity-50"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Reset Password
                  </button>
                  <button
                    type="button"
                    disabled={rowPending}
                    onClick={() =>
                      runAction(
                        g.id,
                        deleteGroupLeaderAction,
                        `Permanently delete ${g.full_name} from Group Leader history? This cannot be undone.`,
                        'Deleted.',
                        'caution'
                      )
                    }
                    className="text-sm font-medium text-red-500 hover:underline disabled:opacity-40 disabled:hover:no-underline"
                  >
                    Delete
                  </button>
                </div>
              )
            },
          },
        ]}
        rows={initialGroupLeaders}
        emptyMessage="No Group Leaders invited yet."
      />
    </div>
  )
}
