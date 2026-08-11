import { useEffect, useCallback, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { motion, AnimatePresence } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { Navbar } from './Navbar'
import { ToastContainer } from '@/components/common/ToastContainer'
import { CommandPalette } from '@/components/common/CommandPalette'
import { setUnreadCount } from '@/store/slices/alertSlice'
import { alertService } from '@/services/alertService'
import { MOTION } from '@/constants'

export function DashboardLayout() {
  const dispatch   = useDispatch()
  const location   = useLocation()
  const [cmdOpen, setCmdOpen] = useState(false)

  const fetchAlertCount = useCallback(async () => {
    try {
      const { data } = await alertService.getUnreadCount()
      dispatch(setUnreadCount(data.unread ?? 0))
    } catch {
      // Silent – badge stays at last known count
    }
  }, [dispatch])

  useEffect(() => {
    fetchAlertCount()
    const interval = setInterval(fetchAlertCount, 60_000)
    return () => clearInterval(interval)
  }, [fetchAlertCount])

  // Cmd+K / Ctrl+K opens command palette
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--surface-page)' }}>
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Navbar onOpenCommandPalette={() => setCmdOpen(true)} />
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: 'var(--surface-page)' }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: MOTION.base, ease: MOTION.ease }}
              style={{ padding: 'clamp(12px, 4vw, 24px)', minHeight: '100%' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      <ToastContainer />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}
