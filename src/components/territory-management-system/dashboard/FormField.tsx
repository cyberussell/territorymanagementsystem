// Deliberately just a class string, not a full input-kit component: React Hook Form's
// register() already handles wiring a plain <input>/<select>/<textarea> to form state.
// text-base (16px) is required, not cosmetic — iOS Safari auto-zooms the whole page on focus
// for any text input rendering below 16px, which is exactly what was happening here (no
// explicit size class meant it inherited whatever smaller size the surrounding layout set),
// forcing the user to manually pinch back out every time they tapped a field.
export const inputClass =
  'w-full rounded-lg border border-blue-100 bg-[#F8FBFF] px-3 py-2 text-base text-[#0B1B33] placeholder:text-slate-400 focus:border-[#38BDF8] focus:outline-none'

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
