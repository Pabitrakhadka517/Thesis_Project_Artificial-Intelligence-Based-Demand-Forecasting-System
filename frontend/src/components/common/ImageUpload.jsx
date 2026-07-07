/**
 * ImageUpload
 *
 * Reusable image-upload widget used across Products, Profile, Settings, Suppliers.
 *
 * Props:
 *   value         {string|null}   Current image URL (shows preview / thumbnail)
 *   onFileSelect  {(File) => void} Called when a valid file is chosen (NOT yet uploaded)
 *   onRemove      {() => void}    Called when the user clicks "Remove"
 *   uploading     {boolean}       Show loading spinner (parent controls upload state)
 *   error         {string|null}   Error message to display under the widget
 *   accept        {string}        MIME types (default: image/jpeg,image/png,image/webp)
 *   maxSizeMB     {number}        Max file size in MB (default: 5)
 *   label         {string}        Aria label / heading (default: 'Image')
 *   shape         {'square'|'circle'}  Preview shape (default: 'square')
 *   size          {'sm'|'md'|'lg'}    Widget size (default: 'md')
 *   disabled      {boolean}
 *   className     {string}
 */

import { useRef, useState, useCallback } from 'react'
import { Upload, X, ImageIcon, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'

const SIZE_MAP = {
  sm:  { outer: 'h-20 w-20',  text: 'text-[10px]', icon: 'h-5 w-5' },
  md:  { outer: 'h-28 w-28',  text: 'text-[11px]', icon: 'h-6 w-6' },
  lg:  { outer: 'h-36 w-36',  text: 'text-[12px]', icon: 'h-7 w-7' },
}

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export function ImageUpload({
  value        = null,
  onFileSelect,
  onRemove,
  uploading    = false,
  error        = null,
  accept       = 'image/jpeg,image/jpg,image/png,image/webp',
  maxSizeMB    = 5,
  label        = 'Image',
  shape        = 'square',
  size         = 'md',
  disabled     = false,
  className    = '',
}) {
  const inputRef             = useRef(null)
  const [preview, setPreview] = useState(null)
  const [localError, setLocalError] = useState(null)
  const [isDragging, setDragging]   = useState(false)

  const displayUrl = preview || value

  const validate = useCallback((file) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setLocalError('Invalid format. Please upload a JPEG, PNG, or WebP image.')
      return false
    }
    if (file.size > maxSizeMB * 1024 * 1024) {
      setLocalError(`File too large. Maximum size is ${maxSizeMB} MB.`)
      return false
    }
    setLocalError(null)
    return true
  }, [maxSizeMB])

  const handleFile = useCallback((file) => {
    if (!file) return
    if (!validate(file)) return
    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)
    onFileSelect?.(file)
  }, [validate, onFileSelect])

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    // Reset so selecting same file again triggers onChange
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled || uploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleRemove = (e) => {
    e.stopPropagation()
    setPreview(null)
    setLocalError(null)
    onRemove?.()
  }

  const sz      = SIZE_MAP[size] || SIZE_MAP.md
  const radius  = shape === 'circle' ? 'rounded-full' : 'rounded-xl'
  const isError = !!(error || localError)

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      {/* ── Drop zone / preview ── */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`Upload ${label}`}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !disabled && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={[
          sz.outer, radius,
          'relative overflow-hidden flex items-center justify-center shrink-0',
          'cursor-pointer select-none transition-all duration-150',
          isDragging ? 'scale-105 ring-2 ring-offset-2' : '',
          disabled || uploading ? 'cursor-not-allowed opacity-60' : 'hover:opacity-90',
        ].join(' ')}
        style={{
          background:  displayUrl ? 'transparent' : 'var(--surface-muted)',
          border:      `2px dashed ${isError ? 'var(--error, #EF4444)' : isDragging ? '#2563EB' : 'var(--border)'}`,
          outline:     'none',
        }}
      >
        {/* Image preview */}
        {displayUrl && (
          <img
            src={displayUrl}
            alt={label}
            className={`absolute inset-0 w-full h-full object-cover ${radius}`}
            onError={() => setPreview(null)}
          />
        )}

        {/* Overlay shown on hover when an image exists */}
        {displayUrl && !uploading && (
          <div className={`absolute inset-0 ${radius} flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity`}
            style={{ background: 'rgba(0,0,0,.45)' }}>
            <Upload className="h-5 w-5 text-white" />
          </div>
        )}

        {/* Placeholder (no image) */}
        {!displayUrl && !uploading && (
          <div className="flex flex-col items-center gap-1 px-2 text-center">
            <ImageIcon className={`${sz.icon} opacity-30`} style={{ color: 'var(--text-muted)' }} />
            <span className={`${sz.text} font-medium leading-tight`} style={{ color: 'var(--text-muted)' }}>
              Click or drag
            </span>
          </div>
        )}

        {/* Upload spinner */}
        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,.35)', borderRadius: 'inherit' }}>
            <Loader2 className="h-6 w-6 text-white animate-spin" />
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          disabled={disabled || uploading}
          className="sr-only"
          aria-hidden
        />
      </div>

      {/* ── Action row ── */}
      <div className="flex items-center gap-2">
        {/* Upload button */}
        <button
          type="button"
          onClick={() => !disabled && !uploading && inputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40"
          style={{
            background: 'var(--surface-muted)',
            border:     '1px solid var(--border)',
            color:      'var(--text-secondary)',
          }}
        >
          {uploading
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Uploading…</>
            : <><Upload className="h-3 w-3" /> {displayUrl ? 'Change' : 'Upload'}</>
          }
        </button>

        {/* Remove button */}
        {(displayUrl || preview) && !uploading && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors disabled:opacity-40"
            style={{
              background: 'rgba(239,68,68,.08)',
              border:     '1px solid rgba(239,68,68,.2)',
              color:      '#EF4444',
            }}
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>

      {/* ── Hint ── */}
      {!isError && (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          JPEG, PNG, WebP · max {maxSizeMB} MB
        </p>
      )}

      {/* ── Error message ── */}
      {isError && (
        <p className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--error, #EF4444)' }}>
          <AlertCircle className="h-3 w-3 shrink-0" />
          {error || localError}
        </p>
      )}

      {/* ── Success indicator (when preview is set and not uploading) ── */}
      {preview && !uploading && !isError && (
        <p className="flex items-center gap-1 text-[10px]" style={{ color: '#10B981' }}>
          <CheckCircle2 className="h-3 w-3" /> Ready to upload
        </p>
      )}
    </div>
  )
}

export default ImageUpload
