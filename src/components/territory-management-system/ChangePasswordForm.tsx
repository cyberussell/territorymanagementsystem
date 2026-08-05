'use client'

import { useActionState } from 'react'
import { changePasswordAction } from '@/app/tms/actions/auth'
import type { ActionResult } from '@/app/tms/actions/shared'

// Reached only via a forced redirect (must_change_password) — the account was just created or
// reset with a temp password an Admin relayed directly, replacing the emailed invite/reset-link
// flow this session (see the invite-flow checkpoint for the full root-cause writeup on why).
// No token/link to verify here — the user already has a real session by the time they land on
// this page, just one flagged as needing a real password before it can be used anywhere else.
export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(changePasswordAction, {})

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#C9D8EE] px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#38BDF8] text-2xl font-bold text-white">
            T
          </div>
          <span className="text-2xl font-bold text-[#0B1B33]">
            Territory <span className="text-[#2563EB]">Management System</span>
          </span>
          <p className="mt-2 text-sm text-slate-700">Set a new password to continue.</p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]"
        >
          <label className="block">
            <span className="text-sm font-medium text-slate-600">New password</span>
            <input
              type="password"
              name="password"
              required
              minLength={8}
              placeholder="8+ characters"
              className="mt-1 w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] placeholder:text-slate-400 focus:border-[#38BDF8] focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-600">Confirm new password</span>
            <input
              type="password"
              name="confirm"
              required
              minLength={8}
              className="mt-1 w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] focus:border-[#38BDF8] focus:outline-none"
            />
          </label>
          {state.error && <p className="text-sm text-red-500">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
          >
            {pending ? 'Saving…' : 'Set Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
