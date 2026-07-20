import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Palette, Upload, Type, Monitor, Eye, RotateCcw,
  Save, CheckCircle, Image, Code, Flame, Star
} from 'lucide-react';
import api from '../api';
import { PageHeader, Card, Button } from '../components/ui';
import { useBrandStore, BrandSettings } from '../store/brandStore';
import { cn } from '../utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const PRESET_PALETTES = [
  { name: 'Gas Orange',   primary: '#f48a1a', primaryDark: '#c0560c', sidebar: '#0f172a' },
  { name: 'Ocean Blue',   primary: '#2563eb', primaryDark: '#1d4ed8', sidebar: '#0c1526' },
  { name: 'Forest Green', primary: '#16a34a', primaryDark: '#15803d', sidebar: '#0a1a10' },
  { name: 'Royal Purple', primary: '#7c3aed', primaryDark: '#6d28d9', sidebar: '#0f0a1a' },
  { name: 'Cherry Red',   primary: '#dc2626', primaryDark: '#b91c1c', sidebar: '#1a0a0a' },
  { name: 'Slate Pro',    primary: '#475569', primaryDark: '#334155', sidebar: '#020617' },
  { name: 'Teal Fresh',   primary: '#0d9488', primaryDark: '#0f766e', sidebar: '#0a1a1a' },
  { name: 'Amber Warm',   primary: '#d97706', primaryDark: '#b45309', sidebar: '#1a1000' },
];

const GRADIENT_PRESETS = [
  { label: 'Dunkel Slate',  value: 'from-slate-900 via-slate-800 to-slate-900' },
  { label: 'Tief Blau',     value: 'from-blue-950 via-blue-900 to-slate-900' },
  { label: 'Nacht',         value: 'from-gray-950 via-gray-900 to-gray-950' },
  { label: 'Waldgrün',      value: 'from-green-950 via-green-900 to-slate-900' },
  { label: 'Tiefviolett',   value: 'from-violet-950 via-violet-900 to-slate-900' },
  { label: 'Rot-Dunkel',    value: 'from-red-950 via-red-900 to-slate-900' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-orange-600" />
      </div>
      <span className="font-bold text-slate-800">{label}</span>
    </div>
  );
}

function ColorPicker({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-9 rounded-lg border border-slate-200 cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="flex-1 px-2.5 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function LogoUpload({
  label, type, currentSrc, onUpload, onClear, hint,
}: {
  label: string; type: string; currentSrc: string | null | undefined;
  onUpload: (type: string, data: string) => void;
  onClear: (type: string) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_500_000) { alert('Bild zu groß (max. 1,5 MB)'); return; }
    onUpload(type, await fileToBase64(file));
    e.target.value = '';
  };

  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      <div className="flex items-center gap-3">
        <div
          className="w-24 h-16 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden cursor-pointer hover:border-orange-300 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {currentSrc
            ? <img src={currentSrc} alt={label} className="w-full h-full object-contain p-1" />
            : <Image className="w-6 h-6 text-slate-300" />}
        </div>
        <div className="space-y-1.5">
          <button
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 border border-orange-200 hover:border-orange-300 px-2.5 py-1.5 rounded-lg transition-all"
          >
            <Upload className="w-3 h-3" /> Hochladen
          </button>
          {currentSrc && (
            <button onClick={() => onClear(type)} className="text-xs text-slate-400 hover:text-slate-600">
              Entfernen
            </button>
          )}
        </div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  );
}

// ── Live App Preview ──────────────────────────────────────────────────────────

function LivePreview({ s }: { s: BrandSettings }) {
  const c = s.colors;
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-lg" style={{ height: 400 }}>
      <div className="flex h-full">
        <div className="w-40 flex flex-col" style={{ background: c.sidebar }}>
          <div className="flex items-center gap-2 px-3 py-3 border-b border-white/10">
            {s.logos?.sidebar
              ? <img src={s.logos.sidebar} alt="logo" className="h-6 w-auto object-contain" />
              : <div className="w-6 h-6 rounded flex items-center justify-center" style={{ background: c.primary }}>
                  <Flame className="w-3 h-3 text-white" />
                </div>}
            <div>
              <div className="font-bold leading-tight text-white" style={{ fontSize: 10 }}>{s.appName}</div>
              <div style={{ color: c.sidebarText, fontSize: 9 }}>{s.appSubtitle}</div>
            </div>
          </div>
          <nav className="flex-1 p-1.5 space-y-0.5">
            {['Dashboard', 'Kanban', 'Lieferscheine', 'Karte'].map((item, i) => (
              <div key={item} className="px-2 py-1.5 rounded text-[9px] font-medium" style={{
                background: i === 1 ? c.sidebarActive : 'transparent',
                color: i === 1 ? 'white' : c.sidebarText,
              }}>
                {item}
              </div>
            ))}
          </nav>
          <div className="px-2 py-2 border-t border-white/10 flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background: c.primary }}>A</div>
            <div style={{ color: c.sidebarText, fontSize: 9 }}>Admin</div>
          </div>
        </div>

        <div className="flex-1 bg-[#f8f9fb] flex flex-col overflow-hidden">
          <div className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-800 text-xs">Kanban-Board</div>
              <div className="text-slate-400" style={{ fontSize: 9 }}>Neu · Trier · Bengel · Erledigt</div>
            </div>
            <div className="text-white text-[9px] font-semibold px-2 py-1 rounded-lg" style={{ background: c.primary }}>+ Neu</div>
          </div>
          <div className="flex-1 flex gap-2 p-3 overflow-hidden">
            {[{ label: 'Neu', bg: '#f1f5f9', n: 2 }, { label: 'Trier', bg: '#e0f2fe', n: 3 }, { label: 'Bengel', bg: '#fff7ed', n: 1 }].map(col => (
              <div key={col.label} className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center justify-between px-2 py-1 rounded-lg text-[9px] font-semibold" style={{ background: col.bg, color: '#475569' }}>
                  <span>{col.label}</span><span>{col.n}</span>
                </div>
                {Array.from({ length: col.n }).map((_, i) => (
                  <div key={i} className="bg-white rounded-lg p-2 border border-slate-100 shadow-sm">
                    <div className="text-[8px] font-mono text-slate-400">LS-2024-000{i + 1}</div>
                    <div className="text-[9px] font-semibold text-slate-700 truncate">Musterkunde GmbH</div>
                    <div className="mt-1 text-[7px] px-1 py-0.5 rounded-full border w-fit"
                      style={{ background: c.primaryLight, color: c.primary, borderColor: c.primary + '50' }}>
                      {col.label}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Login Preview ─────────────────────────────────────────────────────────────

function LoginPreview({ s }: { s: BrandSettings }) {
  const c = s.colors;
  return (
    <div className={`rounded-2xl overflow-hidden bg-gradient-to-br ${s.login?.backgroundGradient || 'from-slate-900 via-slate-800 to-slate-900'} flex items-center justify-center`} style={{ height: 280 }}>
      <div className="bg-white rounded-xl shadow-2xl p-5 w-44">
        <div className="text-center mb-4">
          {s.logos?.login
            ? <img src={s.logos.login} alt="logo" className="h-10 mx-auto object-contain mb-2" />
            : <div className="w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center shadow-lg" style={{ background: c.primary }}>
                <Flame className="w-5 h-5 text-white" />
              </div>}
          <div className="font-bold text-slate-900 text-xs">{s.appName}</div>
          <div className="text-slate-400" style={{ fontSize: 9 }}>{s.login?.tagline}</div>
        </div>
        <div className="text-[9px] text-slate-500 mb-1.5 font-medium">Benutzername</div>
        <div className="h-6 border border-slate-200 rounded-lg mb-3 bg-slate-50" />
        <div className="flex justify-center gap-1.5 mb-3">
          {[1,2,3,4].map(i => (
            <div key={i} className="w-2.5 h-2.5 rounded-full border-2"
              style={{ borderColor: i <= 2 ? c.primary : '#d1d5db', background: i <= 2 ? c.primary : 'transparent' }} />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            k ? <div key={i} className="h-5 text-[8px] font-semibold border border-slate-200 rounded flex items-center justify-center text-slate-600 bg-slate-50">{k}</div>
              : <div key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function WhitelabelPage() {
  const queryClient = useQueryClient();
  const brandStore = useBrandStore();
  const [activeTab, setActiveTab] = useState<'identity' | 'colors' | 'logos' | 'login' | 'advanced'>('identity');
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState<'app' | 'login'>('app');

  // Local working copy – starts from current store values so page is never blank
  const [local, setLocal] = useState<BrandSettings>(() => brandStore.settings);

  // Fetch full server settings (needs auth)
  const { data: serverSettings, isLoading } = useQuery({
    queryKey: ['brand-settings-admin'],
    queryFn: () => api.get('/brand/settings').then(r => r.data),
  });

  // Once server data arrives, sync into local state
  useEffect(() => {
    if (serverSettings) setLocal(serverSettings);
  }, [serverSettings]);

  // Helper: patch top-level field
  const setField = <K extends keyof BrandSettings>(key: K, value: BrandSettings[K]) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  // Helper: patch nested object field
  const setNested = <K extends keyof BrandSettings>(key: K, patch: Partial<BrandSettings[K]>) => {
    setLocal(prev => ({
      ...prev,
      [key]: { ...(prev[key] as any), ...(patch as any) },
    }));
  };

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: (data: BrandSettings) =>
      api.patch('/brand/settings', data).then(r => r.data),
    onSuccess: (updated: BrandSettings) => {
      queryClient.invalidateQueries({ queryKey: ['brand-settings-admin'] });
      setLocal(updated);
      // Apply to running app immediately
      brandStore.applyToDom(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const uploadLogoMutation = useMutation({
    mutationFn: ({ type, data }: { type: string; data: string }) =>
      api.post('/brand/upload-logo', { type, data }).then(r => r.data),
    onSuccess: (_, { type, data }) => {
      // Update local preview immediately
      setLocal(prev => ({
        ...prev,
        logos: { ...prev.logos, [type]: data },
      }));
      queryClient.invalidateQueries({ queryKey: ['brand-settings-admin'] });
    },
  });

  const uploadFaviconMutation = useMutation({
    mutationFn: (data: string) =>
      api.post('/brand/upload-favicon', { data }).then(r => r.data),
    onSuccess: (_, data) => {
      setLocal(prev => ({ ...prev, favicon: data }));
      queryClient.invalidateQueries({ queryKey: ['brand-settings-admin'] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: () => api.post('/brand/reset').then(r => r.data),
    onSuccess: (fresh: BrandSettings) => {
      setLocal(fresh);
      brandStore.applyToDom(fresh);
      queryClient.invalidateQueries({ queryKey: ['brand-settings-admin'] });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSave = () => {
    // Strip logos/favicon from main save - they are saved via dedicated upload endpoints
    // to avoid sending large base64 payloads through the general settings route
    const { logos, favicon, ...rest } = local;
    saveMutation.mutate(rest as BrandSettings);
  };

  const handleLogoUpload = (type: string, data: string) => {
    uploadLogoMutation.mutate({ type, data });
  };

  const handleLogoClear = (type: string) => {
    setLocal(prev => ({ ...prev, logos: { ...prev.logos, [type]: null } }));
    api.patch('/brand/settings', { logos: { ...local.logos, [type]: null } })
      .catch(err => console.error('Logo löschen fehlgeschlagen:', err));
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadFaviconMutation.mutate(await fileToBase64(file));
    e.target.value = '';
  };

  const applyPalette = (preset: typeof PRESET_PALETTES[0]) => {
    setNested('colors', {
      primary: preset.primary,
      primaryDark: preset.primaryDark,
      sidebar: preset.sidebar,
      sidebarActive: preset.primary,
    });
  };

  // Loading state – show spinner only if we have nothing yet
  if (isLoading && !serverSettings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const TABS = [
    { id: 'identity', label: 'Identität',   icon: Type },
    { id: 'colors',   label: 'Farben',      icon: Palette },
    { id: 'logos',    label: 'Logos',       icon: Image },
    { id: 'login',    label: 'Login-Seite', icon: Monitor },
    { id: 'advanced', label: 'Erweitert',   icon: Code },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Whitelabel"
        subtitle="Erscheinungsbild der Anwendung anpassen"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-50 transition-all disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Zurücksetzen
            </button>
            <Button onClick={handleSave} loading={saveMutation.isPending}>
              {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? 'Gespeichert!' : 'Speichern & anwenden'}
            </Button>
          </div>
        }
      />

      {saveMutation.isError && (
        <div className="mx-6 mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          {(saveMutation.error as any)?.response?.data?.message || 'Fehler beim Speichern'}
        </div>
      )}

      <div className="flex h-[calc(100vh-65px)] overflow-hidden">
        {/* ── Editor panel ── */}
        <div className="w-[420px] flex-shrink-0 border-r border-slate-200 flex flex-col bg-white">
          {/* Tabs */}
          <div className="flex border-b border-slate-100 px-2 pt-2 gap-0.5 overflow-x-auto flex-shrink-0">
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-all whitespace-nowrap',
                    activeTab === tab.id
                      ? 'border-orange-500 text-orange-600 bg-orange-50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* ── IDENTITY ── */}
            {activeTab === 'identity' && (
              <>
                <SectionHeader icon={Type} label="App-Identität" />
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">App-Name *</label>
                    <input
                      value={local.appName}
                      onChange={e => setField('appName', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Orderdesk"
                      maxLength={60}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Untertitel</label>
                    <input
                      value={local.appSubtitle}
                      onChange={e => setField('appSubtitle', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Lieferschein Disposition"
                      maxLength={100}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Firmenname (optional)</label>
                    <input
                      value={local.companyName}
                      onChange={e => setField('companyName', e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Muster GmbH"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <SectionHeader icon={Star} label="Funktionen ein-/ausblenden" />
                  <div className="space-y-3">
                    {([
                      ['showMapView',      'Kartenansicht'],
                      ['showTourPlanning', 'Tourenplanung'],
                      ['showAuditLog',     'Audit-Log'],
                      ['showAutoImport',   'Auto-Import'],
                    ] as [keyof BrandSettings['features'], string][]).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">{label}</span>
                        <button
                          type="button"
                          onClick={() => setNested('features', { [key]: !local.features?.[key] })}
                          className={cn('w-9 h-5 rounded-full transition-colors relative flex-shrink-0',
                            local.features?.[key] ? 'bg-orange-500' : 'bg-slate-200')}
                        >
                          <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                            local.features?.[key] ? 'left-[17px]' : 'left-[2px]')} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <SectionHeader icon={Type} label="Footer" />
                  <div className="space-y-2">
                    <input
                      value={local.footer?.text || ''}
                      onChange={e => setNested('footer', { text: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="© 2024 Muster GmbH"
                    />
                    <input
                      value={local.footer?.url || ''}
                      onChange={e => setNested('footer', { url: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── COLORS ── */}
            {activeTab === 'colors' && (
              <>
                <SectionHeader icon={Palette} label="Farbschema" />
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-2">Schnell-Paletten</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PRESET_PALETTES.map(preset => (
                      <button
                        key={preset.name}
                        onClick={() => applyPalette(preset)}
                        title={preset.name}
                        className={cn(
                          'h-10 rounded-xl border-2 overflow-hidden flex transition-all hover:scale-105',
                          local.colors?.primary === preset.primary
                            ? 'border-orange-500 ring-2 ring-orange-200'
                            : 'border-slate-200',
                        )}
                      >
                        <div className="w-1/2 h-full" style={{ background: preset.sidebar }} />
                        <div className="w-1/2 h-full" style={{ background: preset.primary }} />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-3 pt-2">
                  <ColorPicker label="Primärfarbe (Akzent)" value={local.colors?.primary || '#f48a1a'}
                    onChange={v => setNested('colors', { primary: v, sidebarActive: v })} />
                  <ColorPicker label="Primärfarbe Dunkel (Hover)" value={local.colors?.primaryDark || '#c0560c'}
                    onChange={v => setNested('colors', { primaryDark: v })} />
                  <ColorPicker label="Primärfarbe Hell (Badges)" value={local.colors?.primaryLight || '#fef3e2'}
                    onChange={v => setNested('colors', { primaryLight: v })} />
                </div>
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sidebar</p>
                  <ColorPicker label="Sidebar Hintergrund" value={local.colors?.sidebar || '#0f172a'}
                    onChange={v => setNested('colors', { sidebar: v })} />
                  <ColorPicker label="Sidebar Schrift" value={local.colors?.sidebarText || '#94a3b8'}
                    onChange={v => setNested('colors', { sidebarText: v })} />
                  <ColorPicker label="Aktiver Nav-Eintrag" value={local.colors?.sidebarActive || '#f48a1a'}
                    onChange={v => setNested('colors', { sidebarActive: v })} />
                </div>
              </>
            )}

            {/* ── LOGOS ── */}
            {activeTab === 'logos' && (
              <>
                <SectionHeader icon={Image} label="Logos & Icons" />
                <div className="space-y-5">
                  <LogoUpload label="Sidebar-Logo" type="sidebar" currentSrc={local.logos?.sidebar}
                    onUpload={handleLogoUpload} onClear={handleLogoClear}
                    hint="Erscheint in der Navigation. SVG/PNG, max. 1,5 MB." />
                  <LogoUpload label="Login-Logo" type="login" currentSrc={local.logos?.login}
                    onUpload={handleLogoUpload} onClear={handleLogoClear}
                    hint="Erscheint auf der Anmeldeseite." />
                  <LogoUpload label="App-Icon" type="icon" currentSrc={local.logos?.icon}
                    onUpload={handleLogoUpload} onClear={handleLogoClear}
                    hint="Quadratisch, min. 64×64 px." />
                  <LogoUpload label="Druck-Logo" type="print" currentSrc={local.logos?.print}
                    onUpload={handleLogoUpload} onClear={handleLogoClear}
                    hint="Erscheint auf gedruckten Lieferscheinen." />

                  <div className="border-t border-slate-100 pt-4">
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Favicon</label>
                    <p className="text-xs text-slate-400 mb-2">ICO, PNG oder SVG. Browser-Tab-Icon.</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg border border-slate-200 flex items-center justify-center bg-slate-50 overflow-hidden">
                        {local.favicon
                          ? <img src={local.favicon} alt="favicon" className="w-full h-full object-contain" />
                          : <Flame className="w-5 h-5 text-orange-400" />}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-orange-500 hover:text-orange-600 border border-orange-200 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all">
                        <Upload className="w-3 h-3" /> Hochladen
                        <input type="file" accept="image/*,.ico" className="hidden" onChange={handleFaviconUpload} />
                      </label>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── LOGIN ── */}
            {activeTab === 'login' && (
              <>
                <SectionHeader icon={Monitor} label="Login-Seite" />
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Tagline / Slogan</label>
                    <input
                      value={local.login?.tagline || ''}
                      onChange={e => setNested('login', { tagline: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                      placeholder="Lieferschein Disposition"
                      maxLength={120}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-2">Hintergrund-Gradient</label>
                    <div className="grid grid-cols-2 gap-2">
                      {GRADIENT_PRESETS.map(g => (
                        <button
                          key={g.value}
                          onClick={() => setNested('login', { backgroundGradient: g.value })}
                          className={cn(
                            'h-10 rounded-xl border-2 bg-gradient-to-br text-[9px] font-medium text-white/80 transition-all',
                            g.value,
                            local.login?.backgroundGradient === g.value
                              ? 'border-orange-500 ring-2 ring-orange-200'
                              : 'border-slate-200',
                          )}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm font-medium text-slate-700">Demo-Hinweis anzeigen</div>
                      <div className="text-xs text-slate-400">Zeigt Testzugangsdaten auf der Login-Seite</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNested('login', { showDemoHint: !local.login?.showDemoHint })}
                      className={cn('w-9 h-5 rounded-full transition-colors relative',
                        local.login?.showDemoHint ? 'bg-orange-500' : 'bg-slate-200')}
                    >
                      <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                        local.login?.showDemoHint ? 'left-[17px]' : 'left-[2px]')} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── ADVANCED ── */}
            {activeTab === 'advanced' && (
              <>
                <SectionHeader icon={Code} label="Custom CSS" />
                <p className="text-xs text-slate-500 mb-2">
                  Wird global in der App injiziert. Verfügbare CSS-Variablen:
                </p>
                <div className="grid grid-cols-2 gap-1 mb-3">
                  {['--brand-primary', '--brand-primary-dark', '--brand-primary-light', '--brand-sidebar', '--brand-sidebar-text', '--brand-sidebar-active'].map(v => (
                    <div key={v} className="text-xs font-mono text-slate-400 bg-slate-50 px-2 py-0.5 rounded">{v}</div>
                  ))}
                </div>
                <textarea
                  value={local.customCss || ''}
                  onChange={e => setField('customCss', e.target.value)}
                  rows={12}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                  placeholder={`/* Beispiel */\n.kanban-card {\n  border-radius: 16px;\n}`}
                  maxLength={8000}
                />
                <p className="text-xs text-slate-400 text-right">{(local.customCss || '').length}/8000</p>
              </>
            )}
          </div>

          {/* Save hint */}
          <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400 text-center">
              Änderungen werden erst nach <strong>„Speichern & anwenden"</strong> übernommen
            </p>
          </div>
        </div>

        {/* ── Preview panel ── */}
        <div className="flex-1 bg-slate-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Live-Vorschau</span>
              <span className="text-xs text-slate-400">(Farben werden live angezeigt – Speichern für globale Wirkung)</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
              {(['app', 'login'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-all',
                    previewMode === mode ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500')}
                >
                  {mode === 'app' ? 'App' : 'Login'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-8 flex items-start justify-center">
            <div className="w-full max-w-2xl space-y-6">
              {previewMode === 'app'
                ? <LivePreview s={local} />
                : <LoginPreview s={local} />}

              {/* Color swatches */}
              <div className="grid grid-cols-6 gap-2">
                {Object.entries(local.colors || {}).map(([key, val]) => (
                  <div key={key} className="text-center">
                    <div className="h-8 rounded-lg border border-slate-200 mb-1" style={{ background: val as string }} />
                    <div className="text-[9px] text-slate-400 font-mono leading-tight">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
