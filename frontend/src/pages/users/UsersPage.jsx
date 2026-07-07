import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Search, Shield, UserCog, Briefcase,
  Edit2, Trash2, ToggleLeft, ToggleRight, X, Eye, EyeOff,
  CheckCircle, AlertOctagon,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axiosInstance from '@/api/axiosInstance'
import { formatRelativeTime, getInitials } from '@/utils'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'

const ROLES = [
  { value: 'admin',             label: 'Administrator',     icon: Shield,    color: '#EF4444', bg: 'rgba(239,68,68,.12)' },
  { value: 'inventory_manager', label: 'Inventory Manager', icon: UserCog,   color: '#8B5CF6', bg: 'rgba(139,92,246,.12)' },
  { value: 'staff',             label: 'Staff',             icon: Briefcase, color: '#3B82F6', bg: 'rgba(59,130,246,.12)' },
]

const createSchema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  email:    z.string().email('Valid email required'),
  password: z.string().min(8, 'Password must be ≥8 chars').regex(/\d/, 'Must contain a number'),
  role:     z.enum(['admin', 'inventory_manager', 'staff']).default('staff'),
  phone:    z.string().optional(),
})

const editSchema = z.object({
  fullName: z.string().min(2).optional(),
  email:    z.string().email().optional(),
  role:     z.enum(['admin', 'inventory_manager', 'staff']).optional(),
  phone:    z.string().optional(),
})

function Field({ label, error, children }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5"
        style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {error && <p className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}

function FormInput({ error, ...props }) {
  return (
    <input
      className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
      style={{
        background: 'var(--surface-muted)',
        border: `1.5px solid ${error ? 'var(--error)' : 'var(--border)'}`,
        color: 'var(--text-primary)',
      }}
      onFocus={e => { if (!error) e.target.style.borderColor = 'var(--brand)' }}
      onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border)' }}
      {...props}
    />
  )
}

function RoleBadge({ role }) {
  const r = ROLES.find(x => x.value === role) || ROLES[2]
  const Icon = r.icon
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: r.bg, color: r.color }}>
      <Icon className="h-3 w-3" />{r.label}
    </span>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(4px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: .95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: .95, y: 12 }}
        className="w-full max-w-md rounded-2xl p-6"
        style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} className="h-7 w-7 rounded-md flex items-center justify-center"
            style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)' }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function CreateUserModal({ onClose }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [showPw, setShowPw] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'staff' },
  })

  const mutation = useMutation({
    mutationFn: (data) => axiosInstance.post('/users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'User created successfully', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed to create user', variant: 'error' }),
  })

  return (
    <Modal title="Create User" onClose={onClose}>
      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name" error={errors.fullName?.message}>
            <FormInput placeholder="Rajesh Shrestha" error={!!errors.fullName} {...register('fullName')} />
          </Field>
          <Field label="Phone">
            <FormInput placeholder="+977-98..." {...register('phone')} />
          </Field>
        </div>
        <Field label="Email" error={errors.email?.message}>
          <FormInput type="email" placeholder="email@company.com" error={!!errors.email} {...register('email')} />
        </Field>
        <Field label="Password" error={errors.password?.message}>
          <div className="relative">
            <FormInput type={showPw ? 'text' : 'password'} placeholder="Min 8 chars, 1 number"
              error={!!errors.password} {...register('password')} />
            <button type="button" onClick={() => setShowPw(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-muted)' }}>
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field label="Role" error={errors.role?.message}>
          <select className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}
            {...register('role')}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={mutation.isPending}
          className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white"
          style={{ background: '#03045e', opacity: mutation.isPending ? .7 : 1 }}>
          {mutation.isPending ? 'Creating…' : 'Create User'}
        </button>
      </form>
    </Modal>
  )
}

function EditUserModal({ user, onClose }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const { register, handleSubmit } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: user.fullName, email: user.email, role: user.role, phone: user.phone || '' },
  })

  const mutation = useMutation({
    mutationFn: (data) => axiosInstance.patch(`/users/${user._id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      toast({ title: 'User updated', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Update failed', variant: 'error' }),
  })

  return (
    <Modal title="Edit User" onClose={onClose}>
      <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full Name"><FormInput {...register('fullName')} /></Field>
          <Field label="Phone"><FormInput {...register('phone')} /></Field>
        </div>
        <Field label="Email"><FormInput type="email" {...register('email')} /></Field>
        <Field label="Role">
          <select className="w-full px-3 py-2.5 rounded-lg text-[13px] outline-none"
            style={{ background: 'var(--surface-muted)', border: '1.5px solid var(--border)', color: 'var(--text-primary)' }}
            {...register('role')}>
            {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <button type="submit" disabled={mutation.isPending}
          className="w-full py-2.5 rounded-xl text-[14px] font-bold text-white"
          style={{ background: '#03045e', opacity: mutation.isPending ? .7 : 1 }}>
          {mutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </Modal>
  )
}

export default function UsersPage() {
  const { user: me } = useAuth()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch]   = useState('')
  const [roleFilter, setRole] = useState('')
  const [creating, setCreate] = useState(false)
  const [editing, setEdit]    = useState(null)
  const [page, setPage]       = useState(1)
  const LIMIT = 15

  const { data, isLoading } = useQuery({
    queryKey: ['users', page, search, roleFilter],
    queryFn: () => axiosInstance.get(`/users?page=${page}&limit=${LIMIT}&search=${encodeURIComponent(search)}&role=${roleFilter}`)
      .then(r => r.data),
    staleTime: 30_000,
  })

  const users      = data?.data || []
  const total      = data?.pagination?.total || 0
  const totalPages = data?.pagination?.totalPages || 1

  const toggleActive = useMutation({
    mutationFn: (id) => axiosInstance.patch(`/users/${id}/toggle-active`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast({ title: 'Status updated', variant: 'success' }) },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const deleteUser = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/users/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast({ title: 'User deleted', variant: 'success' }) },
    onError: (e) => toast({ title: e.response?.data?.message || 'Delete failed', variant: 'error' }),
  })

  const handleDelete = (u) => {
    if (u._id === (me?._id || me?.id)) return toast({ title: 'Cannot delete your own account', variant: 'error' })
    if (!window.confirm(`Delete ${u.fullName}?`)) return
    deleteUser.mutate(u._id)
  }

  const counts = {
    admin:             users.filter(u => u.role === 'admin').length,
    inventory_manager: users.filter(u => u.role === 'inventory_manager').length,
    staff:             users.filter(u => u.role === 'staff').length,
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>Users & Roles</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {total} users · 3 role types
          </p>
        </div>
        <button onClick={() => setCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ background: '#03045e', boxShadow: '0 4px 16px rgba(3,4,94,.4)' }}>
          <UserPlus className="h-4 w-4" /> Add User
        </button>
      </div>

      {/* Role summary */}
      <div className="grid grid-cols-3 gap-4">
        {ROLES.map(r => {
          const Icon = r.icon
          return (
            <div key={r.value} className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: r.bg }}>
                <Icon className="h-5 w-5" style={{ color: r.color }} />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>{r.label}</p>
                <p className="text-[22px] font-bold" style={{ color: 'var(--text-primary)' }}>{counts[r.value]}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search by name or email…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={roleFilter} onChange={e => { setRole(e.target.value); setPage(1) }}
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['User', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest"
                    style={{ color: 'var(--text-muted)', background: 'var(--surface-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td colSpan={5} className="px-4 py-3">
                      <div className="h-8 rounded-md animate-pulse" style={{ background: 'var(--surface-muted)' }} />
                    </td>
                  </tr>
                ))
                : users.map(u => {
                  const isMe = u._id === (me?._id || me?.id)
                  return (
                    <tr key={u._id}
                      style={{ borderBottom: '1px solid var(--border-subtle)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                            style={{ background: '#03045e' }}>
                            {getInitials(u.fullName || u.email)}
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {u.fullName}
                              {isMe && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full"
                                style={{ background: 'rgba(37,99,235,.15)', color: '#60A5FA' }}>YOU</span>}
                            </p>
                            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{
                            background: u.isActive ? 'rgba(16,185,129,.12)' : 'rgba(100,116,139,.12)',
                            color: u.isActive ? '#10B981' : '#64748B',
                          }}>
                          {u.isActive ? <CheckCircle className="h-3 w-3" /> : <AlertOctagon className="h-3 w-3" />}
                          {u.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {u.lastLogin ? formatRelativeTime(u.lastLogin) : 'Never'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setEdit(u)} title="Edit"
                            className="h-7 w-7 rounded-md flex items-center justify-center"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => !isMe && toggleActive.mutate(u._id)}
                            disabled={isMe} title={u.isActive ? 'Deactivate' : 'Activate'}
                            className="h-7 w-7 rounded-md flex items-center justify-center disabled:opacity-40"
                            style={{ color: u.isActive ? '#F59E0B' : '#10B981' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {u.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button onClick={() => handleDelete(u)} disabled={isMe} title="Delete"
                            className="h-7 w-7 rounded-md flex items-center justify-center disabled:opacity-40"
                            style={{ color: '#EF4444' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,.1)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Page {page} of {totalPages} · {total} total
            </p>
            <div className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-40"
                style={{ background: 'var(--surface-muted)', color: 'var(--text-secondary)' }}>Next</button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {creating && <CreateUserModal onClose={() => setCreate(false)} />}
        {editing  && <EditUserModal user={editing} onClose={() => setEdit(null)} />}
      </AnimatePresence>
    </div>
  )
}
