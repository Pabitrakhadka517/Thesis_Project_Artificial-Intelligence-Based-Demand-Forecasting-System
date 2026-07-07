const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')
const crypto   = require('crypto')

const MAX_LOGIN_ATTEMPTS = 5
const LOCK_TIME_MS       = 30 * 60 * 1000 // 30 minutes

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type:      String,
      required:  [true, 'Full name is required'],
      trim:      true,
      minlength: [2,   'Full name must be at least 2 characters'],
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [8,   'Password must be at least 8 characters'],
      select:    false,
    },
    role: {
      type: String,
      enum: {
        values:  ['admin', 'inventory_manager', 'staff'],
        message: 'Role must be admin, inventory_manager, or staff',
      },
      default: 'staff',
    },
    phone: {
      type:      String,
      trim:      true,
      maxlength: [30, 'Phone number cannot exceed 30 characters'],
      default:   null,
    },
    avatar: {
      type:      String,
      default:   null,
      maxlength: [4096, 'Avatar URL too long'],
    },
    avatarPublicId: { type: String, default: null },
    avatarAssetId:  { type: String, default: null },
    avatarFormat:   { type: String, default: null },
    isActive: {
      type:    Boolean,
      default: true,
    },
    mustChangePassword: {
      type:    Boolean,
      default: false,
    },
    lastLogin: {
      type:    Date,
      default: null,
    },
    loginAttempts: {
      type:    Number,
      default: 0,
      select:  false,
    },
    lockUntil: {
      type:    Date,
      default: null,
      select:  false,
    },
    resetPasswordToken: {
      type:   String,
      select: false,
    },
    resetPasswordExpire: {
      type:   Date,
      select: false,
    },
    refreshTokens: {
      type:    [String],
      select:  false,
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON:  { virtuals: true },
    toObject: { virtuals: true },
  }
)

// ── Indexes ────────────────────────────────────────────────────────────────────

// Primary user list query: filter by isActive, then by role
userSchema.index({ isActive: 1, role: 1 })

// Password reset lookup — sparse because only set during reset flow
userSchema.index({ resetPasswordToken: 1 }, { sparse: true })

// ── Hooks ─────────────────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next()
  this.password = await bcrypt.hash(this.password, 12)
  next()
})

// ── Instance methods ──────────────────────────────────────────────────────────

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password)
}

userSchema.methods.getResetPasswordToken = function () {
  const token = crypto.randomBytes(32).toString('hex')
  this.resetPasswordToken  = crypto.createHash('sha256').update(token).digest('hex')
  this.resetPasswordExpire = Date.now() + parseInt(process.env.RESET_TOKEN_EXPIRE_MINUTES || 60) * 60 * 1000
  return token
}

userSchema.methods.incLoginAttempts = function () {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } })
  }
  const update = { $inc: { loginAttempts: 1 } }
  if (this.loginAttempts + 1 >= MAX_LOGIN_ATTEMPTS && !this.lockUntil) {
    update.$set = { lockUntil: new Date(Date.now() + LOCK_TIME_MS) }
  }
  return this.updateOne(update)
}

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({ $set: { loginAttempts: 0 }, $unset: { lockUntil: 1 } })
}

// ── Virtuals ──────────────────────────────────────────────────────────────────

userSchema.virtual('roleLabel').get(function () {
  const labels = {
    admin:             'Administrator',
    inventory_manager: 'Inventory Manager',
    staff:             'Staff',
  }
  return labels[this.role] || this.role
})

module.exports = mongoose.model('User', userSchema)
