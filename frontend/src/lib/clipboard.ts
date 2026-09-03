/**
 * Copy text to the clipboard.
 *
 * `navigator.clipboard` only exists in secure contexts, so on a plain-HTTP LAN
 * deployment it is `undefined` and calling `.writeText()` throws. Fall back to
 * the legacy `execCommand('copy')` path in that case.
 */
export async function copyToClipboard(value: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // Permission denied or the API is unavailable — try the legacy path.
    }
  }
  return legacyCopy(value)
}

function legacyCopy(value: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = value
  // Keep it off-screen and out of the tab order so the page doesn't jump.
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  const previous = document.activeElement as HTMLElement | null
  try {
    textarea.select()
    textarea.setSelectionRange(0, value.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
    previous?.focus?.()
  }
}
