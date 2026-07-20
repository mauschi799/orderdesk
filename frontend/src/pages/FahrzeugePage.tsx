import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Car, AlertTriangle, X, Paperclip, FileText, ImageIcon, Upload, Download, Eye } from 'lucide-react';
import { vehicleApi } from '../api';
import { Vehicle, FahrzeugTyp, VehicleDocument } from '../types';
import AutocompleteInput, { saveSuggestion } from '../components/AutocompleteInput';
import { useAuthStore } from '../store/authStore';

const TYP_LABELS: Record<FahrzeugTyp, string> = {
  lkw: 'LKW',
  transporter: 'Transporter',
  pkw: 'PKW',
  anhaenger: 'Anhänger',
  sonstige: 'Sonstiges',
};

const TYP_COLORS: Record<FahrzeugTyp, string> = {
  lkw: '#3b82f6',
  transporter: '#8b5cf6',
  pkw: '#10b981',
  anhaenger: '#f59e0b',
  sonstige: '#6b7280',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '–';
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysDiff(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function DateCell({ iso }: { iso: string | null | undefined }) {
  const diff = daysDiff(iso);
  if (diff === null) return <span className="text-gray-400">–</span>;
  let color = '#16a34a', bg = '#dcfce7';
  if (diff <= 10) { color = '#dc2626'; bg = '#fee2e2'; }
  else if (diff <= 60) { color = '#d97706'; bg = '#fef3c7'; }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ color, background: bg }}>
      {diff <= 10 && <AlertTriangle className="w-3 h-3" />}
      {formatDate(iso)}
    </span>
  );
}

// ─── Autocomplete helpers ────────────────────────────────────────────────────

const KEYS = { hersteller: 'fahrzeug_hersteller', modell: 'fahrzeug_modell', standort: 'fahrzeug_standort', dokname: 'fahrzeug_dokname' };

// ─── Form helpers ────────────────────────────────────────────────────────────

const EMPTY_FORM: Record<string, any> = {
  nummernschild: '', hersteller: '', modell: '', typ: 'lkw', standort: '',
  baujahr: '', zugelasseneGesamtmasse: '', leergewicht: '',
  tuevFaellig: '',
  aktiv: true, notiz: '',
};

function toInput(v: Vehicle | null): Record<string, any> {
  if (!v) return { ...EMPTY_FORM };
  return {
    nummernschild: v.nummernschild,
    hersteller: v.hersteller || '',
    modell: v.modell || '',
    typ: v.typ,
    standort: v.standort || '',
    baujahr: v.baujahr ?? '',
    zugelasseneGesamtmasse: v.zugelasseneGesamtmasse ?? '',
    leergewicht: v.leergewicht ?? '',
    tuevFaellig: v.tuevFaellig ? v.tuevFaellig.slice(0, 10) : '',
    aktiv: v.aktiv,
    notiz: v.notiz || '',
  };
}

function toPayload(form: Record<string, any>) {
  return {
    ...form,
    baujahr: form.baujahr !== '' ? Number(form.baujahr) : null,
    zugelasseneGesamtmasse: form.zugelasseneGesamtmasse !== '' ? Number(form.zugelasseneGesamtmasse) : null,
    leergewicht: form.leergewicht !== '' ? Number(form.leergewicht) : null,
    tuevFaellig: form.tuevFaellig || null,
  };
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

function FahrzeugModal({ vehicle, alleFahrzeuge, onClose }: { vehicle: Vehicle | null; alleFahrzeuge: Vehicle[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>(toInput(vehicle));
  const [error, setError] = useState('');

  // Derive existing values from DB for autocomplete
  const dbHersteller = useMemo(() => Array.from(new Set(alleFahrzeuge.map(f => f.hersteller).filter(Boolean))), [alleFahrzeuge]);
  const dbModell = useMemo(() => Array.from(new Set(alleFahrzeuge.map(f => f.modell).filter(Boolean))), [alleFahrzeuge]);
  const dbStandort = useMemo(() => Array.from(new Set(alleFahrzeuge.map(f => f.standort).filter(Boolean))), [alleFahrzeuge]);

  const nutzlast = useMemo(() => {
    const zgm = Number(form.zugelasseneGesamtmasse), leer = Number(form.leergewicht);
    return zgm > 0 && leer > 0 && zgm > leer ? zgm - leer : null;
  }, [form.zugelasseneGesamtmasse, form.leergewicht]);

  const createMut = useMutation({
    mutationFn: (d: any) => vehicleApi.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrzeuge'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.message || 'Fehler beim Speichern'),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => vehicleApi.update(vehicle!._id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrzeuge'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.message || 'Fehler beim Speichern'),
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nummernschild.trim()) { setError('Nummernschild ist erforderlich'); return; }
    setError('');
    // Save to autocomplete
    if (form.hersteller.trim()) saveSuggestion(KEYS.hersteller, form.hersteller.trim());
    if (form.modell.trim()) saveSuggestion(KEYS.modell, form.modell.trim());
    if (form.standort.trim()) saveSuggestion(KEYS.standort, form.standort.trim());
    const payload = toPayload(form);
    vehicle ? updateMut.mutate(payload) : createMut.mutate(payload);
  }

  const busy = createMut.isPending || updateMut.isPending;
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';
  const sectionCls = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-3';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{vehicle ? 'Fahrzeug bearbeiten' : 'Fahrzeug anlegen'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Allgemein */}
          <div>
            <div className={sectionCls}>Allgemein</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Nummernschild *</label>
                <input className={inputCls} value={form.nummernschild} onChange={e => set('nummernschild', e.target.value.toUpperCase())} placeholder="z.B. TR-AB 1234" />
              </div>
              <div>
                <label className={labelCls}>Fahrzeugtyp</label>
                <select className={inputCls} value={form.typ} onChange={e => set('typ', e.target.value)}>
                  {(Object.keys(TYP_LABELS) as FahrzeugTyp[]).map(t => <option key={t} value={t}>{TYP_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Standort</label>
                <AutocompleteInput className={inputCls} value={form.standort} onChange={v => set('standort', v)} storageKey={KEYS.standort} placeholder="z.B. Trier" extraSuggestions={dbStandort} />
              </div>
              <div>
                <label className={labelCls}>Baujahr</label>
                <input className={inputCls} type="number" min={1950} max={2099} value={form.baujahr} onChange={e => set('baujahr', e.target.value)} placeholder="z.B. 2019" />
              </div>
            </div>
          </div>
          {/* Fahrzeug */}
          <div>
            <div className={sectionCls}>Fahrzeug</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Hersteller</label>
                <AutocompleteInput className={inputCls} value={form.hersteller} onChange={v => set('hersteller', v)} storageKey={KEYS.hersteller} placeholder="z.B. Mercedes-Benz" extraSuggestions={dbHersteller} />
              </div>
              <div>
                <label className={labelCls}>Modell</label>
                <AutocompleteInput className={inputCls} value={form.modell} onChange={v => set('modell', v)} storageKey={KEYS.modell} placeholder="z.B. Actros 1845" extraSuggestions={dbModell} />
              </div>
            </div>
          </div>
          {/* Gewichte */}
          <div>
            <div className={sectionCls}>Gewichte</div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Zul. Gesamtmasse (kg)</label>
                <input className={inputCls} type="number" min={0} value={form.zugelasseneGesamtmasse} onChange={e => set('zugelasseneGesamtmasse', e.target.value)} placeholder="kg" />
              </div>
              <div>
                <label className={labelCls}>Leergewicht (kg)</label>
                <input className={inputCls} type="number" min={0} value={form.leergewicht} onChange={e => set('leergewicht', e.target.value)} placeholder="kg" />
              </div>
              <div>
                <label className={labelCls}>Nutzlast (berechnet)</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600 h-[38px] flex items-center">
                  {nutzlast !== null ? `${nutzlast.toLocaleString('de-DE')} kg` : '–'}
                </div>
              </div>
            </div>
          </div>
          {/* Pflichttermine */}
          <div>
            <div className={sectionCls}>Pflichttermine</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>TÜV fällig</label>
                <input className={inputCls} type="date" value={form.tuevFaellig} onChange={e => set('tuevFaellig', e.target.value)} />
              </div>
            </div>
          </div>
          {/* Sonstiges */}
          <div>
            <div className={sectionCls}>Sonstiges</div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Notiz</label>
                <textarea className={inputCls} rows={2} value={form.notiz} onChange={e => set('notiz', e.target.value)} placeholder="Interne Anmerkungen..." />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.aktiv} onChange={e => set('aktiv', e.target.checked)} className="w-4 h-4 rounded accent-blue-600" />
                <span className="text-sm font-medium text-gray-700">Fahrzeug aktiv</span>
              </label>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </form>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Abbrechen</button>
          <button type="button" disabled={busy} onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Speichern...' : vehicle ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dokumente Modal ─────────────────────────────────────────────────────────

function DokumenteModal({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const isAdmin = hasRole('administrator');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dokName, setDokName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: dokumente = [], isLoading } = useQuery<VehicleDocument[]>({
    queryKey: ['fahrzeuge-dokumente', vehicle._id],
    queryFn: () => vehicleApi.dokumenteLaden(vehicle._id),
  });

  const uploadMut = useMutation({
    mutationFn: () => vehicleApi.dokumentHochladen(vehicle._id, dokName.trim() || selectedFile!.name, selectedFile!),
    onSuccess: () => {
      if (dokName.trim()) saveSuggestion(KEYS.dokname, dokName.trim());
      queryClient.invalidateQueries({ queryKey: ['fahrzeuge-dokumente', vehicle._id] });
      setDokName('');
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setUploadError('');
    },
    onError: (e: any) => setUploadError(e.response?.data?.message || 'Fehler beim Hochladen'),
  });

  const deleteMut = useMutation({
    mutationFn: (docId: string) => vehicleApi.dokumentLoeschen(vehicle._id, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fahrzeuge-dokumente', vehicle._id] });
      setDeleteTarget(null);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setSelectedFile(f);
    if (f && !dokName) {
      const nameWithout = f.name.replace(/\.[^.]+$/, '');
      setDokName(nameWithout);
    }
  }

  function openDoc(doc: VehicleDocument) {
    const token = localStorage.getItem('orderdesk_token');
    const url = vehicleApi.dokumentUrl(doc.filename);
    // Fetch the file with auth header and open in new tab
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const objUrl = URL.createObjectURL(blob);
        window.open(objUrl, '_blank');
      });
  }

  function downloadDoc(doc: VehicleDocument) {
    const token = localStorage.getItem('orderdesk_token');
    const url = vehicleApi.dokumentUrl(doc.filename);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = doc.originalname || doc.name;
        a.click();
      });
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Dokumente</h2>
            <p className="text-xs text-gray-500 mt-0.5">{vehicle.nummernschild}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Upload-Bereich (nur Admin) */}
          {isAdmin && (
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Dokument hochladen</div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Name des Dokuments</label>
                  <AutocompleteInput
                    className={inputCls}
                    value={dokName}
                    onChange={setDokName}
                    storageKey={KEYS.dokname}
                    placeholder="z.B. Fahrzeugschein, TÜV-Bericht 2024..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Datei (PDF oder Bild)</label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,image/*"
                      onChange={handleFileChange}
                      className="hidden"
                      id="dok-file-input"
                    />
                    <label
                      htmlFor="dok-file-input"
                      className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors flex-1"
                    >
                      <Upload className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{selectedFile ? selectedFile.name : 'Datei auswählen...'}</span>
                    </label>
                    <button
                      type="button"
                      disabled={!selectedFile || uploadMut.isPending}
                      onClick={() => { setUploadError(''); uploadMut.mutate(); }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 flex-shrink-0"
                    >
                      {uploadMut.isPending ? 'Lädt...' : 'Hochladen'}
                    </button>
                  </div>
                  {selectedFile && (
                    <p className="text-xs text-gray-400 mt-1">{formatSize(selectedFile.size)}</p>
                  )}
                  {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                </div>
              </div>
            </div>
          )}

          {/* Dokumentenliste */}
          <div className="px-6 py-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-400 text-sm">Laden...</div>
            ) : dokumente.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-2 text-gray-400">
                <Paperclip className="w-8 h-8 opacity-40" />
                <span className="text-sm">Keine Dokumente vorhanden</span>
              </div>
            ) : (
              <div className="space-y-2">
                {dokumente.map(doc => {
                  const isPdf = doc.mimetype === 'application/pdf';
                  const isImage = doc.mimetype?.startsWith('image/');
                  const uploadedBy = doc.hochgeladenVon && typeof doc.hochgeladenVon === 'object' ? doc.hochgeladenVon.name : '';
                  return (
                    <div key={doc._id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white group">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isPdf ? '#fee2e2' : '#dbeafe' }}>
                        {isPdf ? <FileText className="w-4 h-4 text-red-600" /> : <ImageIcon className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{doc.name}</div>
                        <div className="text-xs text-gray-400">
                          {formatDate(doc.hochgeladenAm)}
                          {uploadedBy && ` · ${uploadedBy}`}
                          {' · '}{formatSize(doc.size)}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openDoc(doc)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Öffnen">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => downloadDoc(doc)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-green-600" title="Herunterladen">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        {isAdmin && (
                          <button onClick={() => setDeleteTarget(doc._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">Dokument löschen?</div>
                <div className="text-sm text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</div>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Abbrechen</button>
              <button onClick={() => deleteMut.mutate(deleteTarget)} disabled={deleteMut.isPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? 'Löschen...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hauptseite ──────────────────────────────────────────────────────────────

export default function FahrzeugePage() {
  const queryClient = useQueryClient();
  const [filterStandort, setFilterStandort] = useState('');
  const [filterAktiv, setFilterAktiv] = useState<'alle' | 'aktiv' | 'inaktiv'>('aktiv');
  const [modalVehicle, setModalVehicle] = useState<Vehicle | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dokkTarget, setDokkTarget] = useState<Vehicle | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const { data: fahrzeuge = [], isLoading } = useQuery<Vehicle[]>({
    queryKey: ['fahrzeuge'],
    queryFn: () => vehicleApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => vehicleApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrzeuge'] }); setDeleteTarget(null); },
    onError: (e: any) => setDeleteError(e.response?.data?.message || 'Fehler beim Löschen'),
  });

  const standorte = useMemo(() => Array.from(new Set(fahrzeuge.map(f => f.standort).filter(Boolean))).sort(), [fahrzeuge]);

  const filtered = useMemo(() => fahrzeuge.filter(f => {
    if (filterStandort && f.standort !== filterStandort) return false;
    if (filterAktiv === 'aktiv' && !f.aktiv) return false;
    if (filterAktiv === 'inaktiv' && f.aktiv) return false;
    return true;
  }), [fahrzeuge, filterStandort, filterAktiv]);

  function openCreate() { setModalVehicle(null); setShowEditModal(true); }
  function openEdit(v: Vehicle) { setModalVehicle(v); setShowEditModal(true); }
  function closeModal() { setShowEditModal(false); }

  const selectCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fahrzeugverwaltung</h1>
            <p className="text-sm text-gray-500">{fahrzeuge.length} Fahrzeug{fahrzeuge.length !== 1 ? 'e' : ''} gesamt</p>
          </div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700">
          <Plus className="w-4 h-4" />
          Fahrzeug anlegen
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 mb-4">
        <select className={selectCls} value={filterStandort} onChange={e => setFilterStandort(e.target.value)}>
          <option value="">Alle Standorte</option>
          {standorte.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className={selectCls} value={filterAktiv} onChange={e => setFilterAktiv(e.target.value as any)}>
          <option value="aktiv">Nur aktive</option>
          <option value="inaktiv">Nur inaktive</option>
          <option value="alle">Alle</option>
        </select>
        <span className="text-sm text-gray-500">{filtered.length} Ergebnis{filtered.length !== 1 ? 'se' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Laden...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <Car className="w-8 h-8 opacity-40" />
            <span className="text-sm">Keine Fahrzeuge gefunden</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Nummernschild</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Fahrzeug</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Standort</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">zGM</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Leergewicht</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Nutzlast</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">TÜV fällig</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Dok.</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(f => {
                  const nutzlast = f.zugelasseneGesamtmasse && f.leergewicht && f.zugelasseneGesamtmasse > f.leergewicht
                    ? f.zugelasseneGesamtmasse - f.leergewicht : null;
                  const docCount = (f.dokumente || []).length;
                  return (
                    <tr key={f._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-gray-900">{f.nummernschild}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white" style={{ background: TYP_COLORS[f.typ] }}>
                            {TYP_LABELS[f.typ]}
                          </span>
                          <span className="text-gray-700">{[f.hersteller, f.modell].filter(Boolean).join(' ') || <span className="text-gray-400">–</span>}</span>
                        </div>
                        {f.baujahr && <div className="text-xs text-gray-400 mt-0.5">Bj. {f.baujahr}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{f.standort || <span className="text-gray-400">–</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{f.zugelasseneGesamtmasse ? `${f.zugelasseneGesamtmasse.toLocaleString('de-DE')} kg` : <span className="text-gray-400">–</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{f.leergewicht ? `${f.leergewicht.toLocaleString('de-DE')} kg` : <span className="text-gray-400">–</span>}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">{nutzlast ? `${nutzlast.toLocaleString('de-DE')} kg` : <span className="text-gray-400">–</span>}</td>
                      <td className="px-4 py-3"><DateCell iso={f.tuevFaellig} /></td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setDokkTarget(f)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:bg-blue-100"
                          style={{ color: docCount > 0 ? '#2563eb' : '#9ca3af', background: docCount > 0 ? '#dbeafe' : '#f3f4f6' }}
                          title="Dokumente"
                        >
                          <Paperclip className="w-3 h-3" />
                          {docCount}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${f.aktiv ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.aktiv ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEdit(f)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="Bearbeiten">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { setDeleteTarget(f); setDeleteError(''); }} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Löschen">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legende */}
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-green-100 border border-green-300" /> &gt; 60 Tage</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-yellow-100 border border-yellow-300" /> ≤ 60 Tage</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-red-100 border border-red-300" /> ≤ 10 Tage</span>
      </div>

      {/* Fahrzeug anlegen/bearbeiten */}
      {showEditModal && (
        <FahrzeugModal
          vehicle={modalVehicle}
          alleFahrzeuge={fahrzeuge}
          onClose={closeModal}
        />
      )}

      {/* Dokumente */}
      {dokkTarget && <DokumenteModal vehicle={dokkTarget} onClose={() => setDokkTarget(null)} />}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <div className="font-bold text-gray-900">Fahrzeug löschen?</div>
                <div className="text-sm text-gray-500">{deleteTarget.nummernschild} — alle Dokumente werden ebenfalls gelöscht.</div>
              </div>
            </div>
            {deleteError && <div className="text-red-600 text-sm mb-3">{deleteError}</div>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Abbrechen</button>
              <button onClick={() => deleteMut.mutate(deleteTarget._id)} disabled={deleteMut.isPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? 'Löschen...' : 'Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
