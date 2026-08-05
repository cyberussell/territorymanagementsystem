'use client'

import { ClipboardList, ClipboardPlus, Home, Search, Users, type LucideIcon } from 'lucide-react'

// Fixed bottom navigation for the publisher workspace, like a native app tab bar — easier to
// reach one-handed than a top bar while out in ministry. Download/Sync live in a top bar
// instead (see PublisherWorkspaceApp) — every other action lives here. No contextual "Record a
// Visit" item on a record's detail view — that form is already directly on the page, a
// dedicated nav icon just for jumping to it was redundant. Every item here is an in-memory view
// change (onClick), never a real page navigation — "All Partners" used to link back to the
// server-rendered batch-landing page, which hard-failed with a blank browser page the moment a
// publisher tapped it while offline (see PartnerStatusList).
export default function PublisherBottomMenu({
  view,
  onGoToHome,
  onGoToPartners,
  onGoToRecords,
  onGoToAddedRecords,
  onGoToSearch,
  showAddedRecords,
  incomingRequestCount,
}: {
  view:
    | 'home'
    | 'list'
    | 'detail'
    | 'addRecord'
    | 'addQuickNote'
    | 'addedRecords'
    | 'addedRecordDetail'
    | 'editAddedRecord'
    | 'partners'
    | 'search'
  onGoToHome: () => void
  onGoToPartners: () => void
  onGoToRecords: () => void
  // Hidden while readOnly (viewing another Ministry Partner's assignment) — a publisher-added
  // record only ever belongs to the partnership that added it, same as "Add a New Contact
  // Record" itself, which is also readOnly-gated.
  onGoToAddedRecords: () => void
  // Hidden while readOnly too — a read-only viewer has no real partnership of their own to ask
  // for records with, or to receive incoming requests as.
  onGoToSearch: () => void
  showAddedRecords: boolean
  // Pending "Ask" requests for records this partnership currently holds — shown as a badge on
  // the Search tab so there's some chance of noticing one without navigating there first (no
  // push notifications in this offline-first app).
  incomingRequestCount?: number
}) {
  const items: {
    key: string
    label: string
    icon: LucideIcon
    active: boolean
    disabled?: boolean
    spin?: boolean
    badge?: number | null
    onClick?: () => void
  }[] = []

  items.push(
    { key: 'home', label: 'Home', icon: Home, active: view === 'home', onClick: onGoToHome },
    { key: 'partners', label: 'Partners', icon: Users, active: view === 'partners', onClick: onGoToPartners },
    { key: 'records', label: 'List', icon: ClipboardList, active: view === 'list', onClick: onGoToRecords }
  )
  if (showAddedRecords) {
    items.push({
      key: 'addedRecords',
      label: 'Record',
      icon: ClipboardPlus,
      active: view === 'addedRecords' || view === 'addedRecordDetail' || view === 'editAddedRecord',
      onClick: onGoToAddedRecords,
    })
    items.push({
      key: 'search',
      label: 'Search',
      icon: Search,
      active: view === 'search',
      onClick: onGoToSearch,
      badge: incomingRequestCount,
    })
  }
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t border-blue-100/60 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_8px_rgba(15,23,42,0.06)] backdrop-blur"
      aria-label="Workspace navigation"
    >
      {items.map((item) => {
        const Icon = item.icon
        // Active item gets a filled pill behind a visibly larger, bolder icon — on top of the
        // color change below — so the current section reads at a glance on a one-handed,
        // out-in-ministry tap target, not just a subtle color shift.
        const content = (
          <span className={`relative flex items-center justify-center rounded-full p-1 transition ${item.active ? 'bg-blue-50' : ''}`}>
            <Icon
              className={`${item.active ? 'h-8 w-8' : 'h-7 w-7'} ${item.spin ? 'animate-spin' : ''}`}
              strokeWidth={item.active ? 2.75 : 2}
              aria-hidden
            />
            {!!item.badge && (
              <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold leading-none text-white">
                {item.badge}
              </span>
            )}
          </span>
        )
        const className = `flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition disabled:opacity-40 ${
          item.active ? 'text-[#2563EB]' : 'text-slate-400'
        }`
        return (
          <button
            key={item.key}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            className={className}
            aria-label={item.label}
            title={item.label}
            aria-current={item.active ? 'page' : undefined}
          >
            {content}
            <span className={`text-[11px] leading-none ${item.active ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
