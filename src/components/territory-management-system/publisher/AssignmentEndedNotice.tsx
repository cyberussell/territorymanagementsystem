import { CalendarX } from 'lucide-react'

// Shown on every public assignment route (landing, partnership workspace, progress) once the
// batch's assignment_date has passed — the QR/claim links only ever work for the day they were
// generated for. Nothing is deleted when this triggers; a Group Leader would just generate a
// fresh assignment for today, which gets its own new tokens.
export default function AssignmentEndedNotice() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#C9D8EE] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-300 bg-white p-8 text-center shadow-[0_0_18px_-3px_rgba(148,163,184,0.6)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <CalendarX className="h-6 w-6" />
        </div>
        <h1 className="font-semibold text-[#0B1B33]">This assignment has ended</h1>
        <p className="mt-2 text-sm text-slate-500">
          This link was only valid for the day it was generated. Ask your Territory Group Leader for today&apos;s assignment.
        </p>
      </div>
    </div>
  )
}
