'use client'

import { AlertTriangle } from 'lucide-react'
import Card from './Card'

// Route-level error.tsx boundaries render this instead of Next's generic error page — keeps an
// uncaught exception anywhere in a TMS dashboard route inside the product's own branding with a
// working retry, rather than dumping the visitor onto an unstyled crash screen.
export default function DashboardErrorFallback({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="font-semibold text-[#0B1B33]">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-500">{error.message || 'An unexpected error occurred.'}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
        >
          Try again
        </button>
      </Card>
    </div>
  )
}
