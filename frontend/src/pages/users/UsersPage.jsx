import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'framer-motion'
import {
  Users, UserPlus, Search, Shield, UserCog, Briefcase,
  Edit2, Trash2, ToggleLeft, ToggleRight, Eye, EyeOff,
  CheckCircle, AlertOctagon,
} from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import axiosInstance from '@/api/axiosInstance'
import { formatRelativeTime, getInitials } from '@/utils'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { ErrorState } from '@/components/common/ErrorState'
import { EmptyState } from '@/components/common/EmptyState'
import { Modal, ConfirmDialog } from '@/components/common/Modal'
import { Input } from '@/components/common/Input'
import { Select } from '@/components/common/Select'
import { Button } from '@/components/common/Button'
import { Pagination } from '@/components/common/Pagination'
import { PageHeader } from '@/components/common/PageHeader'
import { RolePermissionsPanel } from '@/components/users/RolePermissionsPanel'
import { passwordSchema } from '@/schemas/password'
import { useDebounce } from '@/hooks/useDebounce'

const ROLES = [
  { value: 'admin',             label: 'Administrator',     icon: Shield,    color: '#EF4444', bg: 'rgba(239,68,68,.12)' },
  { value: 'inventory_manager', label: 'Inventory Manager', icon: UserCog,   color: '#8B5CF6', bg: 'rgba(139,92,246,.12)' },
  { value: 'staff',             label: 'Staff',             icon: Briefcase, color: '#3B82F6', bg: 'rgba(59,130,246,.12)' },
]

const createSchema = z.object({
  fullName: z.string().min(2, 'Full name required'),
  email:    z.string().email('Valid email required'),
  password: passwordSchema,
  role:     z.enum(['admin', 'inventory_manager', 'staff']).default('staff'),
  phone:    z.string().optional(),
})

const editSchema = z.object({
  fullName: z.string().min(2).optional(),
  email:    z.string().email().optional(),
  role:     z.enum(['admin', 'inventory_manager', 'staff']).optional(),
  phone:    z.string().optional(),
})

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
      qc.invalidateQueries({ queryKey: ['users-stats'] })
      toast({ title: 'User created successfully', variant: 'success' })
      onClose()
    },
    onError: (e) => {
      const firstFieldError = e.response?.data?.errors?.[0]?.msg
      toast({ title: firstFieldError || e.response?.data?.message || 'Failed to create user', variant: 'error' })
    },
  })

  const formId = 'create-user-form'

  return (
    <Modal
      open
      onClose={onClose}
      title="Create User"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create User'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Full Name" placeholder="Rajesh Shrestha" error={errors.fullName?.message} {...register('fullName')} />
          <Input label="Phone" placeholder="+977-98..." error={errors.phone?.message} {...register('phone')} />
        </div>
        <Input label="Email" type="email" placeholder="email@company.com" error={errors.email?.message} {...register('email')} />
        <Input
          label="Password"
          type={showPw ? 'text' : 'password'}
          placeholder="8+ chars, upper, lower, number, symbol"
          error={errors.password?.message}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPw(p => !p)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              aria-pressed={showPw}
              style={{ color: 'var(--text-muted)' }}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
          {...register('password')}
        />
        <Select label="Role" error={errors.role?.message} options={ROLES.map(r => ({ value: r.value, label: r.label }))} {...register('role')} />
      </form>
    </Modal>
  )
}

function EditUserModal({ user, onClose }) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(editSchema),
    defaultValues: { fullName: user.fullName, email: user.email, role: user.role, phone: user.phone || '' },
  })

  const mutation = useMutation({
    mutationFn: (data) => axiosInstance.patch(`/users/${user._id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['users-stats'] })
      toast({ title: 'User updated', variant: 'success' })
      onClose()
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Update failed', variant: 'error' }),
  })

  const formId = `edit-user-form-${user._id}`

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit User"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} loading={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Full Name" error={errors.fullName?.message} {...register('fullName')} />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
        </div>
        <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
        <Select label="Role" error={errors.role?.message} options={ROLES.map(r => ({ value: r.value, label: r.label }))} {...register('role')} />
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
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [page, setPage]       = useState(1)
  const [pageSize, setPageSize] = useState(15)
  const debouncedSearch = useDebounce(search, 300)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['users', page, pageSize, debouncedSearch, roleFilter],
    queryFn: () => axiosInstance.get(`/users?page=${page}&limit=${pageSize}&search=${encodeURIComponent(debouncedSearch)}&role=${roleFilter}`)
      .then(r => r.data),
    staleTime: 30_000,
  })

  // Server-side aggregate — independent of the current page/filter, unlike
  // counting only the visible (paginated) rows.
  const { data: statsData } = useQuery({
    queryKey: ['users-stats'],
    queryFn: () => axiosInstance.get('/users/stats').then(r => r.data),
    staleTime: 30_000,
  })

  const users      = data?.data || []
  const total      = data?.pagination?.total || 0

  const toggleActive = useMutation({
    mutationFn: (id) => axiosInstance.patch(`/users/${id}/toggle-active`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast({ title: 'Status updated', variant: 'success' }) },
    onError: (e) => toast({ title: e.response?.data?.message || 'Failed', variant: 'error' }),
  })

  const deleteUser = useMutation({
    mutationFn: (id) => axiosInstance.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] })
      qc.invalidateQueries({ queryKey: ['users-stats'] })
      toast({ title: 'User deleted', variant: 'success' })
      setDeleteTarget(null)
    },
    onError: (e) => toast({ title: e.response?.data?.message || 'Delete failed', variant: 'error' }),
  })

  const handleDelete = (u) => {
    if (u._id === (me?._id || me?.id)) return toast({ title: 'Cannot delete your own account', variant: 'error' })
    setDeleteTarget(u)
  }

  const stats = statsData?.data
  const counts = {
    admin:             stats?.admins  ?? 0,
    inventory_manager: stats?.managers ?? 0,
    staff:             stats?.staff   ?? 0,
  }

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        icon={Users}
        eyebrow="Administration"
        title="Users & Roles"
        subtitle={`${total} users · 3 role types`}
        actions={
          <button onClick={() => setCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
            style={{ background: 'var(--brand-primary)' }}>
            <UserPlus className="h-4 w-4" /> Add User
          </button>
        }
      />

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

      <RolePermissionsPanel />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 h-9 rounded-lg flex-1 min-w-48"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)' }}>
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--text-muted)' }} />
          <input type="text" placeholder="Search by name or email…" aria-label="Search users by name or email" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none" style={{ color: 'var(--text-primary)' }} />
        </div>
        <select value={roleFilter} onChange={e => { setRole(e.target.value); setPage(1) }}
          aria-label="Filter by role"
          className="h-9 px-3 rounded-lg text-[13px] outline-none"
          style={{ background: 'var(--surface-card)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All Roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Table */}
      {isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
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
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Users}
                      title={search || roleFilter ? 'No matching users' : 'No users yet'}
                      description={search || roleFilter ? 'Try a different search term or clear the role filter.' : 'Add your first team member to get started.'}
                    />
                  </td>
                </tr>
              )}
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
                            style={{ background: 'var(--brand-primary)' }}>
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
                          <button onClick={() => setEdit(u)} title="Edit" aria-label={`Edit ${u.fullName || u.email}`}
                            className="h-7 w-7 rounded-md flex items-center justify-center"
                            style={{ color: 'var(--text-muted)' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => !isMe && toggleActive.mutate(u._id)}
                            disabled={isMe} title={u.isActive ? 'Deactivate' : 'Activate'}
                            aria-label={`${u.isActive ? 'Deactivate' : 'Activate'} ${u.fullName || u.email}`}
                            className="h-7 w-7 rounded-md flex items-center justify-center disabled:opacity-40"
                            style={{ color: u.isActive ? '#F59E0B' : '#10B981' }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-muted)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {u.isActive ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button onClick={() => handleDelete(u)} disabled={isMe} title="Delete"
                            aria-label={`Delete ${u.fullName || u.email}`}
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

        {total > 0 && (
          <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1) }}
            />
          </div>
        )}
      </div>
      )}

      <AnimatePresence>
        {creating && <CreateUserModal onClose={() => setCreate(false)} />}
        {editing  && <EditUserModal user={editing} onClose={() => setEdit(null)} />}
      </AnimatePresence>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteUser.mutate(deleteTarget._id)}
        title="Delete user?"
        description={`This permanently deletes "${deleteTarget?.fullName}". This action cannot be undone.`}
        loading={deleteUser.isPending}
      />
    </div>
  )
}
