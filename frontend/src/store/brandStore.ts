import { create } from 'zustand';
import api from '../api';

export interface BrandColors {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  sidebar: string;
  sidebarText: string;
  sidebarActive: string;
}

export interface BrandLogos {
  sidebar: string | null;
  login: string | null;
  icon: string | null;
  print: string | null;
}

export interface BrandLogin {
  background: string | null;
  backgroundGradient: string;
  tagline: string;
  showDemoHint: boolean;
}

export interface BrandFeatures {
  showMapView: boolean;
  showTourPlanning: boolean;
  showAuditLog: boolean;
  showAutoImport: boolean;
}

export interface BrandSettings {
  appName: string;
  appSubtitle: string;
  companyName: string;
  colors: BrandColors;
  logos: BrandLogos;
  favicon: string | null;
  login: BrandLogin;
  customCss: string;
  footer: { text: string; url: string };
  features: BrandFeatures;
}

const DEFAULTS: BrandSettings = {
  appName: 'GasDispo',
  appSubtitle: 'Lieferschein Disposition',
  companyName: '',
  colors: {
    primary: '#f48a1a',
    primaryDark: '#c0560c',
    primaryLight: '#fef3e2',
    sidebar: '#0f172a',
    sidebarText: '#94a3b8',
    sidebarActive: '#f48a1a',
  },
  logos: { sidebar: null, login: null, icon: null, print: null },
  favicon: null,
  login: {
    background: null,
    backgroundGradient: 'from-slate-900 via-slate-800 to-slate-900',
    tagline: 'Lieferschein Disposition',
    showDemoHint: true,
  },
  customCss: '',
  footer: { text: '', url: '' },
  features: {
    showMapView: true,
    showTourPlanning: true,
    showAuditLog: true,
    showAutoImport: true,
  },
};

interface BrandStore {
  settings: BrandSettings;
  loaded: boolean;
  load: () => Promise<void>;
  applyToDom: (settings: BrandSettings) => void;
}

// Apply brand CSS variables to :root
const applyToDom = (settings: BrandSettings) => {
  const root = document.documentElement;
  const c = settings.colors;
  root.style.setProperty('--brand-primary',       c.primary);
  root.style.setProperty('--brand-primary-dark',  c.primaryDark);
  root.style.setProperty('--brand-primary-light', c.primaryLight);
  root.style.setProperty('--brand-sidebar',       c.sidebar);
  root.style.setProperty('--brand-sidebar-text',  c.sidebarText);
  root.style.setProperty('--brand-sidebar-active',c.sidebarActive);

  // Page title
  document.title = settings.appName || 'GasDispo';

  // Favicon
  if (settings.favicon) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = settings.favicon;
  }

  // Custom CSS
  let styleEl = document.getElementById('brand-custom-css');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'brand-custom-css';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = settings.customCss || '';
};

export const useBrandStore = create<BrandStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,

  load: async () => {
    try {
      const data = await api.get('/brand/public').then(r => r.data);
      const merged = { ...DEFAULTS, ...data, colors: { ...DEFAULTS.colors, ...data.colors } };
      set({ settings: merged, loaded: true });
      applyToDom(merged);
    } catch {
      // Use defaults silently
      applyToDom(DEFAULTS);
      set({ loaded: true });
    }
  },

  applyToDom: (settings) => {
    applyToDom(settings);
    set({ settings });
  },
}));
