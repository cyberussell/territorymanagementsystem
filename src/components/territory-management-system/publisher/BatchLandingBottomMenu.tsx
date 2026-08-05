'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ClipboardList, ClipboardPlus, Home, Users, type LucideIcon } from 'lucide-react'
import { getClaimedPartnershipToken } from '@/lib/territory-management-system/modules/offline/claim'

// Mirrors PublisherBottomMenu's icon set for visual/navigational consistency, but this page
// (the batch-level "Select your Partner" landing) has no per-partnership view state of its own
// — every item besides "All Partners" (this page) just links into whichever partnership this
// device has already claimed, which always opens on its own Home tab. Only rendered once a
// claim exists: before that (fresh off the QR scan, nothing picked yet) there's nothing for
// Home/Assigned Records/My Added Records to point at, so the nav bar stays hidden entirely
// rather than showing dead links.
export default function BatchLandingBottomMenu({ batchToken }: { batchToken: string }) {
  const [claimedToken, setClaimedToken] = useState<string | null>(null)

  useEffect(() => {
    setClaimedToken(getClaimedPartnershipToken(batchToken))
  }, [batchToken])

  if (!claimedToken) return null

  const workspaceHref = `/tms/assignment/${batchToken}/${claimedToken}`

  // The workspace always mounts fresh from this page (it's a real navigation, not a client-side
  // view-state change) — without a hint it always lands on its default Home tab regardless of
  // which icon was tapped. `view` here is only ever read once, on that initial mount (see
  // PublisherWorkspaceApp's initialView prop) — it doesn't affect in-workspace navigation
  // afterward.
  const items: { key: string; label: string; icon: LucideIcon; active: boolean; href: string | null }[] = [
    { key: 'home', label: 'Home', icon: Home, active: false, href: workspaceHref },
    { key: 'partners', label: 'All Partners', icon: Users, active: true, href: null },
    { key: 'records', label: 'Assigned Records', icon: ClipboardList, active: false, href: `${workspaceHref}?view=list` },
    { key: 'addedRecords', label: 'My Added Records', icon: ClipboardPlus, active: false, href: `${workspaceHref}?view=addedRecords` },
  ]

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-blue-100/60 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur"
      aria-label="Workspace navigation"
    >
      {items.map((item) => {
        const Icon = item.icon
        const content = (
          <span className={`relative flex items-center justify-center rounded-full p-1.5 transition ${item.active ? 'bg-blue-50' : ''}`}>
            <Icon className={item.active ? 'h-6 w-6' : 'h-5 w-5'} strokeWidth={item.active ? 2.75 : 2} aria-hidden />
          </span>
        )
        const className = `flex flex-1 items-center justify-center py-3.5 transition ${item.active ? 'text-[#2563EB]' : 'text-slate-400'}`
        return item.href ? (
          <Link key={item.key} href={item.href} className={className} aria-label={item.label} title={item.label}>
            {content}
          </Link>
        ) : (
          <span key={item.key} className={className} aria-label={item.label} title={item.label} aria-current="page">
            {content}
          </span>
        )
      })}
    </nav>
  )
}
