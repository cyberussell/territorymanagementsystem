'use client'

import { AlertTriangle } from 'lucide-react'

// A branded fallback for the publisher-facing public routes (QR landing, partnership
// workspace, progress) instead of Next's generic crash screen — these are reached from a
// scanned QR code, often on a shared/borrowed phone, where a bare stack trace is especially
// unhelpful.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#C9D8EE] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-300 bg-white p-8 text-center shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-semibold text-[#0B1B33]">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">Check your connection and try again.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
