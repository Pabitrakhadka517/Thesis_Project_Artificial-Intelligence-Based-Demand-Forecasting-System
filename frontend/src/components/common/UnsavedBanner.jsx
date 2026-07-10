import { AlertCircle } from 'lucide-react'

// Surfaced inline on settings-style forms so edits made then abandoned
// (switching tabs, navigating away) aren't silently lost with no warning.
export function UnsavedBanner() {
  return (
    <div className="flex items-center gap-2 text-[12px] mt-3" style={{ color: '#B45309' }}>
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      You have unsaved changes.
    </div>
  )
}
