'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import Card from '@/components/territory-management-system/dashboard/Card'

// Same hardcoded origin used by the batch-level QR (assignment/qr.ts) — that module is
// `server-only` and only builds the batch URL, not a per-partnership one, so this is a small
// client-safe duplicate rather than a shared import.
const APP_ORIGIN = 'https://www.cyberussell.com'

function getPartnershipUrl(batchToken: string, partnershipToken: string): string {
  return `${APP_ORIGIN}/territory-management-system/assignment/${batchToken}/${partnershipToken}`
}

// A partner opening this exact link on their own phone lands on the same already-claimed
// partnership and silently joins it with full write access (see PublisherWorkspaceApp's
// deviceClaim effect) — no separate/overlapping partnership gets created, unlike picking a
// (possibly different, unclaimed) card from the batch's "Select your Partner" list.
export default function SharePartnershipCard({ batchToken, partnershipToken }: { batchToken: string; partnershipToken: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const url = getPartnershipUrl(batchToken, partnershipToken)

  useEffect(() => {
    let cancelled = false
    // Black panel + yellow ink, same inverted pattern as the Group Leader's Auxiliary Group QR
    // (see dashboard/page.tsx's getAssignmentBatchQrDataUrl call) so both "extra QR" cards read
    // consistently at a glance.
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#FACC15', light: '#000000' } }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy the link — long-press it to copy manually.')
    }
  }

  return (
    // Panel forced black to match the QR's own black background (same "!" override pattern as
    // the Group Leader's Auxiliary Group QR card — Card's default panelClass is bg-white/
    // border-gray-300, which a plain bg-black/border-black loses the cascade fight against).
    <Card className="!border-black !bg-black p-4">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-[#60A5FA]" />
        <p className="text-sm font-semibold text-white">Share with Partner</p>
      </div>
      <p className="mt-1 text-xs text-white/70">
        Share this with your Ministry Partner so they can work this same list on their own phone.
      </p>

      {qrDataUrl && (
        <div className="mt-3 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, next/image can't optimize it */}
          <img src={qrDataUrl} alt="QR code to this partnership" className="h-72 w-72 rounded-lg border border-white/20" />
        </div>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2 text-sm font-semibold text-black transition hover:brightness-110"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? 'Copied' : 'Copy Link'}
      </button>
    </Card>
  )
}
