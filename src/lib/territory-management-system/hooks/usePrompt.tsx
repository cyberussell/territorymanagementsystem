'use client'

import { useCallback, useRef, useState } from 'react'
import PromptModal from '@/components/territory-management-system/PromptModal'

interface PromptOptions {
  title?: string
  message: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

// Promise-based replacement for window.prompt() — resolves the entered string, or null if
// cancelled, exactly matching window.prompt()'s own return shape so an existing call site only
// needs `await` added. Render `{PromptDialog}` once, anywhere in the component's JSX.
export function usePrompt() {
  const [options, setOptions] = useState<PromptOptions | null>(null)
  const resolveRef = useRef<((value: string | null) => void) | null>(null)

  const prompt = useCallback((opts: PromptOptions) => {
    setOptions(opts)
    return new Promise<string | null>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  function settle(value: string | null) {
    resolveRef.current?.(value)
    resolveRef.current = null
    setOptions(null)
  }

  const PromptDialog = (
    <PromptModal
      open={options !== null}
      title={options?.title ?? 'Please provide a value'}
      message={options?.message ?? ''}
      placeholder={options?.placeholder}
      confirmLabel={options?.confirmLabel}
      cancelLabel={options?.cancelLabel}
      onConfirm={(value) => settle(value)}
      onCancel={() => settle(null)}
    />
  )

  return { prompt, PromptDialog }
}
