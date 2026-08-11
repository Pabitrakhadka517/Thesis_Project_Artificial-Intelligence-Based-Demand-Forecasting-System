import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PAGINATION_PAGE_SIZES } from '@/constants'

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange }) {
  const totalPages = Math.ceil(total / pageSize)
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  const pages = []
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i)
  }

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
        <span>Rows per page:</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
          className="rounded-md px-2 py-1 text-sm outline-none"
          style={{
            border: '1px solid var(--border)',
            background: 'var(--surface-card)',
            color: 'var(--text-secondary)',
          }}
        >
          {PAGINATION_PAGE_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span>{start}–{end} of {total}</span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange?.(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className="p-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--surface-muted)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages[0] > 1 && (
          <>
            <PageBtn n={1} active={page === 1} onClick={onPageChange} />
            {pages[0] > 2 && <span className="px-1" style={{ color: 'var(--text-muted)' }}>…</span>}
          </>
        )}

        {pages.map((n) => (
          <PageBtn key={n} n={n} active={page === n} onClick={onPageChange} />
        ))}

        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && (
              <span className="px-1" style={{ color: 'var(--text-muted)' }}>…</span>
            )}
            <PageBtn n={totalPages} active={page === totalPages} onClick={onPageChange} />
          </>
        )}

        <button
          onClick={() => onPageChange?.(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className="p-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--surface-muted)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function PageBtn({ n, active, onClick }) {
  return (
    <button
      onClick={() => onClick?.(n)}
      aria-label={`Page ${n}`}
      aria-current={active ? 'page' : undefined}
      className="h-8 w-8 rounded-lg text-sm font-medium"
      style={{
        background: active ? 'var(--brand-blue)' : 'transparent',
        color: active ? '#fff' : 'var(--text-secondary)',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      {n}
    </button>
  )
}
