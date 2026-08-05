'use client'

import { useCallback, useRef, useState } from 'react'
import ConfirmModal, { type ConfirmVariant } from '@/components/territory-management-system/ConfirmModal'

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

// Promise-based replacement for `if (!window.confirm(msg)) return` — `confirm()` resolves true/
// false exactly like the browser API did, so an existing call site only needs `await` added and
// its surrounding function marked async. Render `{ConfirmDialog}` once, anywhere in the
// component's JSX (it renders null until a confirmation is in flight).
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  function settle(value: boolean) {
    resolveRef.current?.(value)
    resolveRef.current = null
    setOptions(null)
  }

  const ConfirmDialog = (
    <ConfirmModal
      open={options !== null}
      title={options?.title ?? (options?.variant === 'info' ? 'Please confirm' : 'Are you sure?')}
      message={options?.message ?? ''}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      variant={options?.variant}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  )

  return { confirm, ConfirmDialog }
}
