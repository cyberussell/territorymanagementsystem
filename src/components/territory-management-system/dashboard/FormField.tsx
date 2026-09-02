// Deliberately just a class string, not a full input-kit component: React Hook Form's
// register() already handles wiring a plain <input>/<select>/<textarea> to form state.
// text-base (16px) is required, not cosmetic — iOS Safari auto-zooms the whole page on focus
// for any text input rendering below 16px, which is exactly what was happening here (no
// explicit size class meant it inherited whatever smaller size the surrounding layout set),
// forcing the user to manually pinch back out every time they tapped a field.
export const inputClass =
  'w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] placeholder:text-slate-400 focus:border-[#38BDF8] focus:outline-none'

// Shown directly above any notes textarea that captures information about a resident — keeps
// publishers/admins from drifting into recording sensitive personal information (religion,
// health, ethnicity, etc.) the Data Privacy Act notice on the login page (/tms/privacy) already
// asks them not to collect. Deliberately smaller than the app's regular text-sm/text-base scale
// so it reads as a passive reminder, not a form label.
export function PrivacyReminder() {
  return (
    <p className="text-[11px] leading-relaxed text-slate-500">
      <span className="font-semibold">Privacy Reminder:</span> Keep notes brief and ministry-related. Do not record
      sensitive or unnecessary personal information, such as religion, health or medical information, political
      views, financial circumstances, ethnicity, private family matters, or personal judgments. Record only what is
      reasonably necessary for a courteous return visit.
    </p>
  )
}

export default function FormField({
  label,
  optional,
  error,
  children,
}: {
  label: string
  optional?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-600">
        {label}
        {optional && ' (optional)'}
      </span>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </label>
  )
}
