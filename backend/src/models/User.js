const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name ist erforderlich'],
    trim: true,
    maxlength: 100
  },
  username: {
    type: String,
    required: [true, 'Benutzername ist erforderlich'],
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: 50
  },
  pin: {
    type: String,
    required: [true, 'PIN ist erforderlich'],
    minlength: 4,
    select: false
  },
  role: {
    type: String,
    enum: ['administrator', 'disponent', 'lagerist', 'viewer', 'filialen'],
    default: 'viewer'
  },
  filiale: {
    type: String,
    trim: true,
    default: null,
  },
  // Individuelle Lager-Zusatzberechtigungen (unabhängig von der Rolle)
  lagerMelden: {
    aktiv:    { type: Boolean, default: false },
    filialen: [{ type: String, trim: true }], // leer = alle, befüllt = nur diese
  },
  lagerLesen: {
    aktiv:    { type: Boolean, default: false },
    filialen: [{ type: String, trim: true }], // leer = alle, befüllt = nur diese
  },
  depot: {
    type: String,
    enum: ['frei', 'bengel', 'trier', null],
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  lastActivity: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Hash PIN before save
userSchema.pre('save', async function(next) {
  if (!this.isModified('pin')) return next();
  this.pin = await bcrypt.hash(this.pin, 12);
  next();
});

userSchema.methods.comparePin = async function(candidatePin) {
  return bcrypt.compare(candidatePin, this.pin);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.pin;
  return obj;
};

// Role permissions
userSchema.statics.getRolePermissions = function(role) {
  const permissions = {
    administrator: ['read', 'write', 'delete', 'manage_users', 'manage_settings', 'import', 'lager_lesen'],
    disponent: ['read', 'write', 'import', 'assign', 'print'],
    lagerist: ['read', 'write_status', 'print', 'lager_lesen'],
    viewer: ['read'],
    filialen: ['lager_melden']
  };
  return permissions[role] || [];
};

module.exports = mongoose.model('User', userSchema);
