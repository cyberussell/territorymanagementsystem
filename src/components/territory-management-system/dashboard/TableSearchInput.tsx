import { Search } from 'lucide-react'

export default function TableSearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="relative max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-blue-100 bg-white py-2 pl-9 pr-3 text-sm text-[#0B1B33] placeholder:text-slate-400 focus:border-[#38BDF8] focus:outline-none"
      />
    </div>
  )
}
