import { useEffect, useId, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { MOTION } from '@/constants'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export function Modal({ open, onClose, title, children, width = 520, footer }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Move focus into the dialog on open, and back to whatever triggered it on close.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      const first = dialogRef.current?.querySelector(FOCUSABLE)
      first ? first.focus() : dialogRef.current?.focus()
    } else {
      triggerRef.current?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll(FOCUSABLE)
      if (!focusable.length) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: MOTION.fast }}
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(6px)' }}
            onClick={onClose}
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: MOTION.base, ease: MOTION.ease }}
            className="relative w-full flex flex-col"
            style={{
              maxWidth: width,
              maxHeight: '90vh',
              background: 'var(--surface-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-xl)',
              boxShadow: '0 30px 60px rgba(0,0,0,.25)',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: '1px solid var(--border)' }}
            >
              <h2 id={titleId} className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="h-7 w-7 rounded-lg flex items-center justify-center transition-colors"
                style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--border)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-muted)'}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {children}
            </div>

            {/* Optional footer */}
            {footer && (
              <div
                className="px-6 py-4 flex justify-end gap-2 shrink-0"
                style={{ borderTop: '1px solid var(--border)' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = 'Delete', loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={420}>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {description}
      </p>
      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors"
          style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg,#B91C1C,#EF4444)', boxShadow: '0 2px 8px rgba(239,68,68,.3)' }}
        >
          {loading ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
