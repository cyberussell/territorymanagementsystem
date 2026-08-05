export interface FilterPillOption<V> {
  label: string
  value: V
}

export default function FilterPills<V>({
  options,
  active,
  onChange,
}: {
  options: FilterPillOption<V>[]
  active: V
  onChange: (value: V) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.label}
          onClick={() => onChange(option.value)}
          aria-pressed={option.value === active}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            option.value === active
              ? 'bg-gradient-to-r from-[#2563EB] to-[#38BDF8] text-white'
              : 'border border-blue-100 bg-white text-slate-500 hover:border-[#38BDF8]/40'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
