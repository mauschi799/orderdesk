const mongoose = require('mongoose');

const brandSettingsSchema = new mongoose.Schema({
  // Only one document ever exists (singleton)
  _singleton: { type: Boolean, default: true, unique: true },

  // Identity
  appName: { type: String, default: 'GasDispo', trim: true, maxlength: 60 },
  appSubtitle: { type: String, default: 'Lieferschein Disposition', trim: true, maxlength: 100 },
  companyName: { type: String, default: '', trim: true, maxlength: 100 },

  // Colors (hex or CSS)
  colors: {
    primary: { type: String, default: '#f48a1a' },      // main accent
    primaryDark: { type: String, default: '#c0560c' },   // hover/dark variant
    primaryLight: { type: String, default: '#fef3e2' },  // backgrounds
    sidebar: { type: String, default: '#0f172a' },        // sidebar bg
    sidebarText: { type: String, default: '#94a3b8' },    // sidebar text
    sidebarActive: { type: String, default: '#f48a1a' },  // active nav item
  },

  // Logos – stored as base64 data URLs or external URLs
  logos: {
    // Main logo shown in sidebar (SVG or PNG, ideally)
    sidebar: { type: String, default: null },    // base64 or URL
    // Logo on login screen
    login: { type: String, default: null },
    // Small icon / favicon base (square, ≥32px)
    icon: { type: String, default: null },
    // Print header logo
    print: { type: String, default: null },
  },

  // Favicon – base64 encoded .ico or .png (delivered as /api/brand/favicon)
  favicon: { type: String, default: null },

  // Login page customization
  login: {
    background: { type: String, default: null },         // CSS background value or base64 image
    backgroundGradient: {
      type: String,
      default: 'from-slate-900 via-slate-800 to-slate-900'
    },
    tagline: { type: String, default: 'Lieferschein Disposition', maxlength: 120 },
    showDemoHint: { type: Boolean, default: true },
  },

  // Custom CSS injected into the app (advanced)
  customCss: { type: String, default: '', maxlength: 8000 },

  // Footer / legal
  footer: {
    text: { type: String, default: '' },
    url: { type: String, default: '' },
  },

  // Feature flags
  features: {
    showMapView: { type: Boolean, default: true },
    showTourPlanning: { type: Boolean, default: true },
    showAuditLog: { type: Boolean, default: true },
    showAutoImport: { type: Boolean, default: true },
  },

  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, {
  timestamps: true
});

// Static helper: always get or create the singleton
brandSettingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne({ _singleton: true });
  if (!settings) {
    settings = await this.create({ _singleton: true });
  }
  return settings;
};

module.exports = mongoose.model('BrandSettings', brandSettingsSchema);
