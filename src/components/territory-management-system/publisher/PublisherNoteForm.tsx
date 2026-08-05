'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import FormField, { inputClass } from '@/components/territory-management-system/dashboard/FormField'
import Card from '@/components/territory-management-system/dashboard/Card'

// Shown once, right before Sync & Finish — entirely optional, so Skip proceeds with no write
// at all rather than submitting an empty note.
export default function PublisherNoteForm({
  sending,
  onSend,
  onSkip,
}: {
  sending: boolean
  onSend: (note: string) => void
  onSkip: () => void
}) {
  const [note, setNote] = useState('')

  return (
    <Card className="p-6">
      <h2 className="font-semibold text-[#0B1B33]">Leave a Note for the Admin?</h2>
      <p className="mt-1 text-sm text-slate-500">Anything about today&apos;s records or the app you&apos;d like the Admin to know.</p>
      <div className="mt-4">
        <FormField label="Note" optional>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={4}
            disabled={sending}
            className={inputClass}
            placeholder="e.g. web app is lagging in 4G."
          />
        </FormField>
      </div>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onSkip}
          disabled={sending}
          className="flex-1 rounded-lg border border-blue-100 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-[#38BDF8]/40 disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          // Same workflow as Skip either way — an empty note here just finishes with nothing to
          // send, instead of the button silently doing nothing (it was previously disabled
          // whenever the optional field was left blank, the one case Skip exists to cover).
          onClick={() => (note.trim() ? onSend(note) : onSkip())}
          disabled={sending}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#2563EB] to-[#38BDF8] py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {sending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            'Send & Finish'
          )}
        </button>
      </div>
    </Card>
  )
}
