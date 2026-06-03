import { useEffect, type RefObject } from 'react'

/**
 * Hook that triggers a callback when a click occurs outside the referenced element.
 * @param ref - React ref to the element to watch
 * @param isOpen - Whether the dropdown/popup is open
 * @param onClose - Callback to close the dropdown/popup
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  isOpen: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!isOpen) { return }

    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, onClose, ref])
}
