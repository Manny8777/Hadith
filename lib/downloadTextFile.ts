export function downloadUtf8TextFile(filename: string, text: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Text downloads are not available in this browser.')
  }
  if (!text.trim()) {
    throw new Error('Cannot download an empty text report.')
  }

  const safeFilename = filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || 'report'
  const filenameWithExtension = safeFilename.toLowerCase().endsWith('.txt') ? safeFilename : `${safeFilename}.txt`
  // The BOM keeps Arabic UTF-8 text readable when opened directly in Windows Notepad.
  const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filenameWithExtension
  anchor.hidden = true
  document.body.appendChild(anchor)

  try {
    anchor.click()
  } finally {
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
  }
}
