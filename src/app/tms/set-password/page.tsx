'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CircleCheck } from 'lucide-react'
import { createBrowserSupabase } from '@/lib/territory-management-system/supabase'

// Reached from the Admin's own "forgot password" email link (Group Leader accounts no longer
// route through here at all — invites and Admin-triggered resets both use a temp password the
// Admin relays directly instead, see GroupLeadersManager.tsx and the invite-flow checkpoint).
// The reset link is `?code=...` (real PKCE, generated server-side by resetPasswordForEmail).
// @supabase/ssr's browser client auto-detects and exchanges this on its own in the common case,
// but that auto-detection depends on a code_verifier cookie set at request time actually
// surviving to when the link is opened (same browser, matching cookie domain) — if it doesn't,
// the exchange fails silently inside the client's own init path with no event ever firing. The
// manual exchangeCodeForSession() call below is a direct fallback that doesn't depend on that
// same fragile auto-detection succeeding.
//
// (This page also still handles the old hash-based `#access_token=...` shape defensively, in
// case any stale invite link is still floating around from before the temp-password switch.)
export default function SetPasswordPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [expired, setExpired] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [success, setSuccess] = useState(false)
  const readyRef = useRef(false)

  useEffect(() => {
    // Read the raw URL before creating the Supabase client — the client's own (possibly failed)
    // attempt to auto-process this same URL shouldn't be relied on to leave it untouched.
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = hashParams.get('access_token')
    const refreshToken = hashParams.get('refresh_token')
    const code = new URLSearchParams(window.location.search).get('code')

    const supabase = createBrowserSupabase()

    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error: sessionError }) => {
        if (!sessionError) {
          readyRef.current = true
          setReady(true)
          // Drop the tokens from the visible URL/browser history now that they're consumed.
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
    } else if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error: sessionError }) => {
        if (!sessionError) {
          readyRef.current = true
          setReady(true)
          window.history.replaceState(null, '', window.location.pathname)
        }
      })
    }

    // An invite link authenticates the browser the same way a password-recovery link does —
    // Supabase fires PASSWORD_RECOVERY or SIGNED_IN depending on version, so both are treated
    // as a valid arrival here (an existing session from being already logged in elsewhere in
    // this browser looks identical to a real recovery session if checked via getSession()
    // alone, which is why this listens for the actual auth event instead).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        readyRef.current = true
        setReady(true)
      }
    })
    // 8s, not 4 — a slow connection's auth event can genuinely take a few seconds to arrive,
    // and 4s was long enough to flash a scary "invalid or expired" message for a link that was
    // actually still fine (the UI self-corrects once `ready` does fire, but that flicker alone
    // could make someone abandon a working invite). Same fix already proven in the LMS's
    // sibling accept-invite page.
    const timeout = setTimeout(() => {
      if (!readyRef.current) setExpired(true)
    }, 8000)
    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setPending(true)
    const supabase = createBrowserSupabase()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setPending(false)
    if (updateError) return setError('Could not update your password — please try the link again.')
    setSuccess(true)
    setTimeout(() => router.push('/tms/login'), 2000)
  }

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
          <p className="mt-2 text-sm text-slate-700">Set your password.</p>
        </div>

        {success ? (
          <div className="rounded-2xl border border-gray-300 bg-white p-6 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]">
            <CircleCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" aria-hidden />
            <p className="font-medium text-[#0B1B33]">Password set</p>
            <p className="mt-2 text-sm text-slate-500">Redirecting you to log in…</p>
          </div>
        ) : expired && !ready ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="font-medium text-amber-700">This link is invalid or has expired.</p>
            <p className="mt-2 text-sm text-slate-500">
              <Link href="/tms/forgot-password" className="text-[#2563EB] hover:underline">
                Request a new one
              </Link>
              .
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="space-y-4 rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]"
          >
            <label className="block">
              <span className="text-sm font-medium text-slate-600">New password</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8+ characters"
                className="mt-1 w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] placeholder:text-slate-400 focus:border-[#38BDF8] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-600">Confirm new password</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="mt-1 w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] focus:border-[#38BDF8] focus:outline-none"
              />
            </label>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={pending || !ready}
              className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {!ready ? 'Verifying link…' : pending ? 'Updating…' : 'Set Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
