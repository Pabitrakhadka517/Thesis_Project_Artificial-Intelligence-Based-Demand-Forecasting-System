import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export function SortableTH({ label, sortKey, sortBy, sortDir, onSort, className = '', ...props }) {
  const active = sortBy === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`text-left px-4 py-3 font-semibold text-[11px] uppercase tracking-wider select-none cursor-pointer ${className}`}
      style={{ color: active ? 'var(--text-secondary)' : 'var(--text-muted)' }}
      {...props}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)
          : <ChevronsUpDown className="h-3 w-3 opacity-30" />}
      </span>
    </th>
  )
}
