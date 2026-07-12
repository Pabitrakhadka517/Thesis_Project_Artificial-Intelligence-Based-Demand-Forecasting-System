import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { authService } from '@/services/authService'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/common/Card'
import { Button } from '@/components/common/Button'
import { Input } from '@/components/common/Input'
import { ImageUpload } from '@/components/common/ImageUpload'
import { ChangePasswordForm } from '@/components/common/ChangePasswordForm'
import { getInitials, formatDate } from '@/utils'
import { useToast } from '@/hooks/useToast'
import { LogOut, User, Lock, Shield, Camera } from 'lucide-react'

const profileSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone:    z.string().optional(),
})

const ROLE_LABELS = {
  admin:             'Administrator',
  inventory_manager: 'Inventory Manager',
  staff:             'Staff',
}
const ROLE_COLORS = {
  admin:             { bg: 'rgba(239,68,68,.12)',   color: '#EF4444' },
  inventory_manager: { bg: 'rgba(37,99,235,.12)',   color: '#2563EB' },
  staff:             { bg: 'rgba(34,197,94,.12)',   color: '#22C55E' },
}

export default function ProfilePage() {
  const { user, logout, refreshProfile } = useAuth()
  const { toast }   = useToast()
  const qc          = useQueryClient()
  const [pendingAvatar, setPendingAvatar] = useState(null)  // File | null
  const [uploadError, setUploadError]     = useState(null)

  const profileForm = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { fullName: '', phone: '' },
  })

  useEffect(() => {
    if (user) {
      profileForm.reset({ fullName: user.fullName || '', phone: user.phone || '' })
    }
  }, [user])

  const updateProfileMutation = useMutation({
    mutationFn: authService.updateProfile,
    onSuccess: () => {
      refreshProfile()
      toast({ title: 'Profile updated successfully', variant: 'success' })
    },
    onError: (e) =>
      toast({ title: 'Update failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const avatarUploadMutation = useMutation({
    mutationFn: (file) => authService.uploadAvatar(file),
    onSuccess: () => {
      refreshProfile()
      setPendingAvatar(null)
      setUploadError(null)
      toast({ title: 'Profile picture updated', variant: 'success' })
    },
    onError: (e) => {
      setUploadError(e.response?.data?.message || 'Upload failed. Please try again.')
      toast({ title: 'Avatar upload failed', description: e.response?.data?.message, variant: 'error' })
    },
  })

  const avatarDeleteMutation = useMutation({
    mutationFn: authService.deleteAvatar,
    onSuccess: () => {
      refreshProfile()
      setPendingAvatar(null)
      toast({ title: 'Profile picture removed', variant: 'success' })
    },
    onError: (e) =>
      toast({ title: 'Remove failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const changePasswordMutation = useMutation({
    mutationFn: authService.changePassword,
    onError: (e) =>
      toast({ title: 'Password change failed', description: e.response?.data?.message, variant: 'error' }),
  })

  const handleChangePassword = (values, { reset }) => {
    changePasswordMutation.mutate(values, {
      onSuccess: () => {
        reset()
        toast({ title: 'Password changed successfully', variant: 'success' })
      },
    })
  }

  const role = user?.role || 'admin'
  const roleStyle = ROLE_COLORS[role] || ROLE_COLORS.admin

  return (
    <div className="space-y-5 pb-6 max-w-2xl">
      {/* ── Header ── */}
      <div>
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Profile
        </h1>
        <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Manage your account information and security settings
        </p>
      </div>

      {/* ── Avatar card ── */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-start gap-5">
            {/* Avatar upload widget */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <ImageUpload
                value={user?.avatar || null}
                onFileSelect={(file) => {
                  setPendingAvatar(file)
                  setUploadError(null)
                }}
                onRemove={() => {
                  if (user?.avatar) {
                    avatarDeleteMutation.mutate()
                  } else {
                    setPendingAvatar(null)
                  }
                }}
                uploading={avatarUploadMutation.isPending || avatarDeleteMutation.isPending}
                error={uploadError}
                label="Profile Picture"
                shape="circle"
                size="md"
              />

              {/* Save button — shown when a new file is staged */}
              {pendingAvatar && !avatarUploadMutation.isPending && (
                <button
                  type="button"
                  onClick={() => avatarUploadMutation.mutate(pendingAvatar)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white"
                  style={{ background: 'var(--brand-primary)' }}
                >
                  <Camera className="h-3 w-3" /> Save Picture
                </button>
              )}
            </div>

            {/* User info */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[17px] font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                  {user?.fullName || 'User'}
                </h2>
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: roleStyle.bg, color: roleStyle.color }}
                >
                  {ROLE_LABELS[role] || role}
                </span>
              </div>
              <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
              {user?.phone && (
                <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{user.phone}</p>
              )}
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Member since {user?.createdAt ? formatDate(user.createdAt) : '—'}
              </p>
              <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                Click the widget or drag a photo to update your picture.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Edit Profile ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(37,99,235,.1)' }}>
              <User className="h-3.5 w-3.5" style={{ color: '#2563EB' }} />
            </div>
            <CardTitle>Edit Profile</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={profileForm.handleSubmit((d) => updateProfileMutation.mutate(d))}
            className="space-y-4"
          >
            <div>
              <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Email Address
              </label>
              <div
                className="w-full px-3 py-2.5 rounded-lg text-[13px]"
                style={{
                  background: 'var(--surface-muted)',
                  border: '1px solid var(--border)',
                  color: 'var(--text-muted)',
                }}
              >
                {user?.email || '—'}
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Email cannot be changed
              </p>
            </div>
            <Input
              label="Full Name"
              placeholder="Your name"
              error={profileForm.formState.errors.fullName?.message}
              {...profileForm.register('fullName')}
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+977 98XXXXXXXX"
              error={profileForm.formState.errors.phone?.message}
              {...profileForm.register('phone')}
            />
            <Button type="submit" loading={updateProfileMutation.isPending}>
              Save Changes
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Change Password ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(139,92,246,.1)' }}>
              <Lock className="h-3.5 w-3.5" style={{ color: '#8B5CF6' }} />
            </div>
            <CardTitle>Change Password</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm
            onSubmit={handleChangePassword}
            loading={changePasswordMutation.isPending}
          />
        </CardContent>
      </Card>

      {/* ── Account Security ── */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(239,68,68,.1)' }}>
                <Shield className="h-4 w-4" style={{ color: '#EF4444' }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Sign Out</p>
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Log out of your account on this device</p>
              </div>
            </div>
            <Button variant="outline" size="sm" icon={LogOut} onClick={logout}>
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
