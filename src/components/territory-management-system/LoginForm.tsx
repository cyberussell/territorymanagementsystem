'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useActionState, useState } from 'react'
import { Building2, Eye, EyeOff, House, MapPin, Store, Warehouse } from 'lucide-react'
import { signIn } from '@/app/tms/actions/auth'
import type { ActionResult } from '@/app/tms/actions/shared'

const inputClass =
  'mt-1 w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] outline-none transition focus:border-[#38BDF8] focus:ring-2 focus:ring-[#38BDF8]/40'

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38BDF8] focus-visible:ring-offset-2'

export default function LoginForm({ notice }: { notice?: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(signIn, {})
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-[#EAF2FB] via-[#DCE9FA] to-[#C9D8EE] px-4 py-10">
      <MapBackdrop />

      {/* Phone mockup */}
      <div className="relative z-10 mx-auto w-full max-w-[380px] motion-safe:animate-[tms-phone-in_0.7s_ease-out]">
        <div className="relative rounded-[2rem] bg-[#0B1B33] p-2 shadow-[0_30px_60px_-15px_rgba(11,27,51,0.45)] sm:rounded-[3rem] sm:p-3 sm:ring-1 sm:ring-black/10">
          {/* Side buttons — dropped below `sm` to keep the frame from eating into the form on narrow screens */}
          <span aria-hidden="true" className="absolute -left-px top-24 hidden h-10 w-[3px] rounded-l-sm bg-[#0B1B33] sm:block" />
          <span aria-hidden="true" className="absolute -left-px top-40 hidden h-16 w-[3px] rounded-l-sm bg-[#0B1B33] sm:block" />
          <span aria-hidden="true" className="absolute -right-px top-32 hidden h-20 w-[3px] rounded-r-sm bg-[#0B1B33] sm:block" />

          <div className="relative overflow-hidden rounded-[1.5rem] bg-[#F8FBFF] sm:rounded-[2.25rem]">
            {/* Notch */}
            <div aria-hidden="true" className="absolute left-1/2 top-0 z-20 hidden h-6 w-32 -translate-x-1/2 rounded-b-2xl bg-[#0B1B33] sm:block" />

            <div className="flex min-h-[600px] flex-col justify-center px-5 py-10 sm:min-h-[660px] sm:px-6 sm:pt-12">
              <div className="mb-5 flex flex-col items-center text-center">
                <Image src="/tms-logo.png" alt="" width={48} height={48} className="mb-3 rounded-2xl" priority />
                <span className="text-xl font-bold text-[#0B1B33]">Territory Management System</span>
                {/* Single-congregation deployment today — hardcode until a second congregation is
                    actually onboarded, at which point this login page needs to stop assuming one. */}
                <span className="mt-1 text-sm font-semibold text-slate-700">Mallig Tagalog Congregation</span>
                <span className="text-xs text-slate-600">Mallig, Isabela</span>
              </div>

              <div className="mb-5 text-center">
                <h1 className="text-lg font-bold text-[#0B1B33]">Territory Group Leader</h1>
                <p className="text-sm text-slate-600">Sign in to continue</p>
              </div>

              <form action={formAction} className="space-y-4">
                {/* Honeypot: invisible to real users (off-screen, unreachable by Tab, no autofill
                    hook), but a basic credential-stuffing bot that blindly fills every input on the
                    form usually fills this too — see signIn()'s check in actions/auth.ts. */}
                <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }}>
                  <label htmlFor="tms-website">Website</label>
                  <input id="tms-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <label className="block" htmlFor="tms-email">
                  <span className="text-sm font-medium text-slate-600">Email</span>
                  <input id="tms-email" name="email" type="email" autoComplete="email" required className={inputClass} />
                </label>

                <label className="block" htmlFor="tms-password">
                  <span className="text-sm font-medium text-slate-600">Password</span>
                  <div className="relative mt-1">
                    <input
                      id="tms-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      className={`${inputClass} mt-0 pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      aria-pressed={showPassword}
                      className={`absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-slate-500 hover:text-[#2563EB] ${focusRing}`}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                    </button>
                  </div>
                </label>

                <div className="flex items-center justify-between text-sm">
                  <label htmlFor="tms-remember" className="flex items-center gap-2 text-slate-600">
                    <input
                      id="tms-remember"
                      name="remember"
                      type="checkbox"
                      defaultChecked
                      className={`h-4 w-4 rounded border-blue-200 text-[#2563EB] ${focusRing}`}
                    />
                    Remember me
                  </label>
                  <Link href="/tms/forgot-password" className={`rounded text-[#2563EB] hover:underline ${focusRing}`}>
                    Forgot password?
                  </Link>
                </div>

                {notice && !state.error && (
                  <p className="text-sm text-amber-600" role="status">
                    {notice}
                  </p>
                )}
                {state.error && (
                  <p className="text-sm text-red-500" role="alert">
                    {state.error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={pending}
                  className={`w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 font-semibold text-white transition hover:brightness-110 disabled:opacity-50 ${focusRing}`}
                >
                  {pending ? 'Logging in…' : 'Log in'}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-600">Owned and managed by Cyberussell.com</p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-slate-600">
          <Link href="/tms/privacy" className={`rounded text-[#2563EB] hover:underline ${focusRing}`}>
            Data Privacy &amp; Confidentiality Notice
          </Link>
        </p>
      </div>
    </div>
  )
}

// Decorative territory-map backdrop: road grid, blurred "region" blobs, and a few floating
// pins. Purely presentational (aria-hidden, pointer-events-none) — pins are hidden below `sm`
// so they don't crowd the form on small screens.
function MapBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg className="absolute inset-0 h-full w-full opacity-[0.35]">
        <defs>
          <pattern id="tms-roads" width="120" height="120" patternUnits="userSpaceOnUse" patternTransform="rotate(20)">
            <line x1="0" y1="60" x2="120" y2="60" stroke="#8FB3E0" strokeWidth="2" />
            <line x1="60" y1="0" x2="60" y2="120" stroke="#8FB3E0" strokeWidth="2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tms-roads)" />
      </svg>

      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-[#93C5FD] opacity-30 blur-3xl" />
      <div className="absolute top-1/3 -right-20 h-80 w-80 rounded-full bg-[#60A5FA] opacity-20 blur-3xl" />
      <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-[#2563EB] opacity-10 blur-3xl" />

      <PinMarker icon={House} top="16%" left="10%" size={40} color="#EF4444" duration="4s" delay="0s" />
      <PinMarker icon={Building2} top="20%" right="13%" size={34} color="#2563EB" duration="5s" delay="0.6s" />
      <PinMarker icon={Store} bottom="14%" left="18%" size={34} color="#16A34A" duration="4.5s" delay="1.1s" />
      <PinMarker icon={Warehouse} bottom="18%" right="16%" size={44} color="#EAB308" duration="5.5s" delay="1.6s" />
      <HouseCluster top="46%" left="4%" />
    </div>
  )
}

// A small building glyph with a colored location pin badged on its corner — pairs a "territory"
// (the building) with the pin marking it, echoing how map apps flag points of interest.
function PinMarker({
  icon: Icon,
  top,
  left,
  right,
  bottom,
  size,
  color,
  duration,
  delay,
}: {
  icon: typeof House
  top?: string
  left?: string
  right?: string
  bottom?: string
  size: number
  color: string
  duration: string
  delay: string
}) {
  return (
    <div
      className="absolute hidden sm:block motion-safe:animate-[tms-pin-float_1s_ease-in-out_infinite]"
      style={{ top, left, right, bottom, animationDuration: duration, animationDelay: delay }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <Icon className="h-full w-full text-[#5B7DB1]/60" strokeWidth={1.75} />
        <MapPin
          className="absolute -top-1.5 -right-1.5 drop-shadow"
          style={{ width: size * 0.6, height: size * 0.6, color }}
          strokeWidth={2}
        />
      </div>
    </div>
  )
}

// A small cluster of neighboring houses sharing a couple of pins — a residential block within
// one territory, distinct from the single-building markers scattered elsewhere on the backdrop.
function HouseCluster({ top, left, right, bottom }: { top?: string; left?: string; right?: string; bottom?: string }) {
  return (
    <div
      className="absolute hidden sm:block motion-safe:animate-[tms-pin-float_6s_ease-in-out_infinite]"
      style={{ top, left, right, bottom }}
    >
      <div className="relative h-20 w-28">
        <House className="absolute top-3 left-0 h-6 w-6 text-[#5B7DB1]/50" strokeWidth={1.75} />
        <House className="absolute top-8 left-8 h-7 w-7 text-[#5B7DB1]/60" strokeWidth={1.75} />
        <House className="absolute top-1 left-16 h-5 w-5 text-[#5B7DB1]/45" strokeWidth={1.75} />
        <House className="absolute top-10 left-[4.75rem] h-6 w-6 text-[#5B7DB1]/55" strokeWidth={1.75} />
        <MapPin className="absolute top-0 left-6 h-5 w-5 text-[#EF4444] drop-shadow" strokeWidth={2} />
        <MapPin className="absolute top-3 left-[5.25rem] h-4 w-4 text-[#16A34A] drop-shadow" strokeWidth={2} />
      </div>
    </div>
  )
}
