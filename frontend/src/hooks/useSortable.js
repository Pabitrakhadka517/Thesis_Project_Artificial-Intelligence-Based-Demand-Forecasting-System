import { useState } from 'react'

// Shared column-sort state — was previously a one-off pattern only built
// correctly on the Models page metrics table; every other list page had no
// sort affordance at all.
export function useSortable(defaultKey, defaultDir = 'desc') {
  const [sortBy, setSortBy]   = useState(defaultKey)
  const [sortDir, setSortDir] = useState(defaultDir)

  const toggle = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(key); setSortDir('asc') }
  }

  return { sortBy, sortDir, toggle }
}
