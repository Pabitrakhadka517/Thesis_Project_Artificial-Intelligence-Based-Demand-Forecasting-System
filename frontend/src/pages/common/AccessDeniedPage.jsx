import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react'
import { useRole } from '@/hooks/useRole'

export default function AccessDeniedPage() {
  const { role, prefix } = useRole()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex items-center justify-center p-6"
      style={{ background: 'var(--surface-page)' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md"
      >
        <div className="h-20 w-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
          style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)' }}>
          <ShieldAlert className="h-10 w-10" style={{ color: 'var(--brand-red)' }} />
        </div>

        <h1 className="text-[28px] font-bold tracking-tight mb-2"
          style={{ color: 'var(--text-primary)' }}>
          Access Denied
        </h1>
        <p className="text-[14px] leading-relaxed mb-2" style={{ color: 'var(--text-muted)' }}>
          Your current role <span className="font-semibold px-2 py-0.5 rounded-full text-[12px]"
            style={{ background: 'rgba(239,68,68,.1)', color: 'var(--brand-red)' }}>
            {role}
          </span> does not have permission to access this page.
        </p>
        <p className="text-[13px] mb-8" style={{ color: 'var(--text-muted)' }}>
          Contact your administrator to request access.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link to={`${prefix}/dashboard`}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all"
            style={{ background: 'var(--brand-blue)', color: '#fff' }}
            onMouseEnter={e => e.currentTarget.style.opacity = '.9'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            <Home className="h-4 w-4" />
            Go to Dashboard
          </Link>
          <button onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold"
            style={{ background: 'var(--surface-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            <ArrowLeft className="h-4 w-4" />
            Go Back
          </button>
        </div>
      </motion.div>
    </div>
  )
}
