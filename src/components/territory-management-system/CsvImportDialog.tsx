'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Papa from 'papaparse'
import { Upload, X } from 'lucide-react'
import { importRecordsAction, type ImportSummary } from '@/app/tms/actions/records'
import {
  type HeaderMap,
  type ImportField,
  IMPORT_FIELD_LABELS,
  OPTIONAL_IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  guessHeaderMap,
} from '@/lib/territory-management-system/modules/records/csvShared'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'

type Step = 'pick' | 'map' | 'importing' | 'done'

// territoryId is set when launched from a specific Territory's page (rows skip the Territory
// Name column) and omitted when launched from the global Records page (every row must name
// its own territory).
export default function CsvImportDialog({ territoryId }: { territoryId?: string }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('pick')
  const [pending, startTransition] = useTransition()
  const [csvText, setCsvText] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [headerMap, setHeaderMap] = useState<HeaderMap>({})
  const [mapError, setMapError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const requiredFields: ImportField[] = territoryId ? [...REQUIRED_IMPORT_FIELDS] : [...REQUIRED_IMPORT_FIELDS, 'territoryName']

  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    }
  }, [])

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, preview: 1 })
    const detectedHeaders = parsed.meta.fields ?? []
    setCsvText(text)
    setHeaders(detectedHeaders)
    setHeaderMap(guessHeaderMap(detectedHeaders))
    setMapError(null)
    setStep('map')
  }

  function handleAcceptMapping() {
    const missing = requiredFields.filter((f) => !headerMap[f])
    if (missing.length > 0) {
      setMapError(`Please map: ${missing.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}.`)
      return
    }
    setMapError(null)
    setStep('importing')
    setProgress(8)
    // Server Actions don't expose real upload-byte progress, so this is a smooth animated
    // approximation that eases toward 90% while the import runs and only reaches 100% once the
    // action actually resolves — never claims to be done before the data is really imported.
    progressTimerRef.current = setInterval(() => {
      setProgress((p) => (p < 90 ? Math.min(90, p + Math.random() * 12) : p))
    }, 250)
    startTransition(async () => {
      const summary = await importRecordsAction(territoryId ?? null, csvText, headerMap)
      if (progressTimerRef.current) clearInterval(progressTimerRef.current)
      setProgress(100)
      setTimeout(() => {
        setResult(summary)
        setStep('done')
      }, 300)
    })
  }

  function handleClose() {
    setOpen(false)
    setStep('pick')
    setCsvText('')
    setHeaders([])
    setHeaderMap({})
    setMapError(null)
    setProgress(0)
    setResult(null)
    if (progressTimerRef.current) clearInterval(progressTimerRef.current)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-sm font-medium text-[#2563EB] hover:border-[#38BDF8]/40"
      >
        <Upload className="h-4 w-4" />
        Import CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleClose}>
          <div
            className="w-full max-w-lg rounded-2xl border border-gray-300 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_0_18px_-3px_rgba(148,163,184,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-[#0B1B33]">Import Contact Records from CSV</h2>
              <button onClick={handleClose} aria-label="Close" className="text-slate-600 hover:text-slate-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {step === 'pick' && (
              <>
                <p className="mb-3 text-sm text-slate-500">
                  Required columns: <strong>{requiredFields.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}</strong>. Optional:{' '}
                  {OPTIONAL_IMPORT_FIELDS.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}. Territory/Section/Block must match
                  existing labels exactly (case-insensitive). You&apos;ll be asked to match each column on the next step.
                  Imported rows land as <strong>Pending</strong> for review.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileSelected}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#F0F6FF] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#2563EB]"
                />
              </>
            )}

            {step === 'map' && (
              <>
                <p className="mb-3 text-sm text-slate-500">
                  Match each field to a column from your file, then accept the mapping to import.
                </p>
                <div className="mb-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                  {requiredFields.map((field) => (
                    <FormField key={field} label={IMPORT_FIELD_LABELS[field]}>
                      <select
                        value={headerMap[field] ?? ''}
                        onChange={(e) => setHeaderMap((m) => ({ ...m, [field]: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="" disabled>
                          Select a column…
                        </option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ))}
                  {OPTIONAL_IMPORT_FIELDS.map((field) => (
                    <FormField key={field} label={IMPORT_FIELD_LABELS[field]} optional>
                      <select
                        value={headerMap[field] ?? ''}
                        onChange={(e) => setHeaderMap((m) => ({ ...m, [field]: e.target.value }))}
                        className={inputClass}
                      >
                        <option value="">Not mapped</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  ))}
                </div>
                {mapError && <p className="mb-3 text-sm text-red-500">{mapError}</p>}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('pick')}
                    className="flex-1 rounded-lg border border-blue-100 bg-white py-2.5 text-sm font-medium text-slate-500 hover:border-[#38BDF8]/40"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptMapping}
                    className="flex-1 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
                  >
                    Accept Mapping &amp; Import
                  </button>
                </div>
              </>
            )}

            {step === 'importing' && (
              <div className="py-4">
                <p className="mb-3 text-sm text-slate-500">Importing your contact records…</p>
                <div className="h-2.5 w-full overflow-hidden rounded-full border border-blue-100 bg-[#F8FBFF]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#38BDF8] transition-[width] duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {step === 'done' && result && (
              <>
                <div className="mb-4 space-y-2 rounded-lg border border-blue-100 bg-[#F8FBFF] p-3 text-sm">
                  <p className="font-medium text-[#0B1B33]">{result.imported} contact record(s) imported as pending.</p>
                  {result.errors.length > 0 && (
                    <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-red-500">
                      {result.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={pending}
                  className="w-full rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
