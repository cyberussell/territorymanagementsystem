import { Download } from 'lucide-react'

export default function CsvExportButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-sm font-medium text-[#2563EB] hover:border-[#38BDF8]/40"
    >
      <Download className="h-4 w-4" />
      Export CSV
    </a>
  )
}
