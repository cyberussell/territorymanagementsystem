'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { MailCheck } from 'lucide-react'
import { requestPasswordResetAction } from '@/app/tms/actions/password'
import type { ActionResult } from '@/app/tms/actions/shared'

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(requestPasswordResetAction, {})
  const sent = state.error === 'SAVED'

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
          <p className="mt-2 text-sm text-slate-700">Reset your password.</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-gray-300 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]">
            <MailCheck className="mx-auto mb-2 h-8 w-8 text-[#2563EB]" aria-hidden />
            <p className="font-medium text-[#0B1B33]">Check your email</p>
            <p className="mt-2 text-sm text-slate-500">
              If an account exists for that address, we&apos;ve sent a password reset link.{' '}
              <Link href="/tms/login" className="text-[#2563EB] hover:underline">
                Back to login
              </Link>
              .
            </p>
          </div>
        ) : (
          <form
            action={formAction}
            className="space-y-4 rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]"
          >
            <label className="block">
              <span className="text-sm font-medium text-slate-600">Email</span>
              <input
                name="email"
                type="email"
                required
                className="mt-1 w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] focus:border-[#38BDF8] focus:outline-none"
              />
            </label>
            {state.error && !sent && <p className="text-sm text-red-500">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? 'Sending…' : 'Send Reset Link'}
            </button>
            <p className="text-center text-sm text-slate-500">
              <Link href="/tms/login" className="text-[#2563EB] hover:underline">
                Back to login
              </Link>
            </p>
            {/* Shown to everyone regardless of what was typed — doesn't reveal whether a given
                email belongs to a Group Leader account. */}
            <p className="text-center text-xs text-slate-400">
              Group Leaders: ask your Administrator to reset your password from the Group Leaders page instead.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
