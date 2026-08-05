'use client'

import { useEffect, useState } from 'react'

// Starts true and corrects in an effect (navigator doesn't exist during SSR) — avoids a
// hydration mismatch while still reflecting real connectivity within a tick of mount.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true)

  useEffect(() => {
    setOnline(navigator.onLine)
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return online
}
