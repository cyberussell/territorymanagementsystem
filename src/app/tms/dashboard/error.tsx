'use client'

import DashboardErrorFallback from '@/components/territory-management-system/dashboard/DashboardErrorFallback'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <DashboardErrorFallback error={error} reset={reset} />
}
