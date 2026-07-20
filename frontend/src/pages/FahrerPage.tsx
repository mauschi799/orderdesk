import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Pencil, Trash2, UserCheck, AlertTriangle, X,
  Paperclip, FileText, ImageIcon, Upload, Download, Eye,
  Phone, Mail, ShieldCheck,
} from 'lucide-react';
import { driverApi } from '../api';
import { Driver, VehicleDocument } from '../types';
import AutocompleteInput, { saveSuggestion } from '../components/AutocompleteInput';
import { useAuthStore } from '../store/authStore';

// Führerscheinklassen zur Auswahl
const FS_KLASSEN = ['B', 'BE', 'C', 'CE', 'C1', 'C1E', 'D', 'DE', 'D1', 'D1E', 'L', 'T'];

const KEYS = { standort: 'fahrer_standort', dokname: 'fahrer_dokname' };

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

function DateBadge({ iso, label }: { iso: string | null | undefined; label?: string }) {
  const diff = daysDiff(iso);
  if (diff === null) return <span className="text-gray-400">–</span>;
  let color = '#16a34a', bg = '#dcfce7';
  if (diff <= 0) { color = '#dc2626'; bg = '#fee2e2'; }
  else if (diff <= 30) { color = '#d97706'; bg = '#fef3c7'; }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium" style={{ color, background: bg }}>
      {diff <= 0 && <AlertTriangle className="w-3 h-3" />}
      {label && <span className="font-bold mr-0.5">{label}</span>}
      {formatDate(iso)}
    </span>
  );
}

// ─── Form helpers ────────────────────────────────────────────────────────────

function toInput(d: Driver | null): Record<string, any> {
  if (!d) return {
    vorname: '', nachname: '', telefon: '', email: '',
    geburtsdatum: '', standort: '',
    fuehrerscheinNr: '', fuehrerscheinKlassen: [], fuehrerscheinAblauf: '',
    adrSchein: false, adrAblauf: '',
    aktiv: true, notiz: '',
  };
  return {
    vorname: d.vorname, nachname: d.nachname,
    telefon: d.telefon || '', email: d.email || '',
    geburtsdatum: d.geburtsdatum ? d.geburtsdatum.slice(0, 10) : '',
    standort: d.standort || '',
    fuehrerscheinNr: d.fuehrerscheinNr || '',
    fuehrerscheinKlassen: d.fuehrerscheinKlassen || [],
    fuehrerscheinAblauf: d.fuehrerscheinAblauf ? d.fuehrerscheinAblauf.slice(0, 10) : '',
    adrSchein: d.adrSchein,
    adrAblauf: d.adrAblauf ? d.adrAblauf.slice(0, 10) : '',
    aktiv: d.aktiv, notiz: d.notiz || '',
  };
}

function toPayload(f: Record<string, any>) {
  return {
    ...f,
    geburtsdatum: f.geburtsdatum || null,
    fuehrerscheinAblauf: f.fuehrerscheinAblauf || null,
    adrAblauf: f.adrAblauf || null,
  };
}

// ─── Edit Modal ──────────────────────────────────────────────────────────────

function FahrerModal({ driver, alleStandorte, onClose }: {
  driver: Driver | null;
  alleStandorte: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>(toInput(driver));
  const [error, setError] = useState('');

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  function toggleKlasse(k: string) {
    const cur: string[] = form.fuehrerscheinKlassen;
    set('fuehrerscheinKlassen', cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]);
  }

  const createMut = useMutation({
    mutationFn: (d: any) => driverApi.create(d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrer'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.message || 'Fehler beim Speichern'),
  });
  const updateMut = useMutation({
    mutationFn: (d: any) => driverApi.update(driver!._id, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrer'] }); onClose(); },
    onError: (e: any) => setError(e.response?.data?.message || 'Fehler beim Speichern'),
  });

  function handleSubmit() {
    if (!form.vorname.trim() || !form.nachname.trim()) { setError('Vor- und Nachname sind erforderlich'); return; }
    setError('');
    if (form.standort.trim()) saveSuggestion(KEYS.standort, form.standort.trim());
    const payload = toPayload(form);
    driver ? updateMut.mutate(payload) : createMut.mutate(payload);
  }

  const busy = createMut.isPending || updateMut.isPending;
  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelCls = 'block text-xs font-semibold text-gray-500 mb-1';
  const sectionCls = 'text-xs font-bold text-gray-400 uppercase tracking-widest mb-3';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{driver ? 'Fahrer bearbeiten' : 'Fahrer anlegen'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Person */}
          <div>
            <div className={sectionCls}>Person</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Vorname *</label>
                <input className={inputCls} value={form.vorname} onChange={e => set('vorname', e.target.value)} placeholder="Max" />
              </div>
              <div>
                <label className={labelCls}>Nachname *</label>
                <input className={inputCls} value={form.nachname} onChange={e => set('nachname', e.target.value)} placeholder="Mustermann" />
              </div>
              <div>
                <label className={labelCls}>Geburtsdatum</label>
                <input className={inputCls} type="date" value={form.geburtsdatum} onChange={e => set('geburtsdatum', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Standort</label>
                <AutocompleteInput className={inputCls} value={form.standort} onChange={v => set('standort', v)} storageKey={KEYS.standort} placeholder="z.B. Trier" extraSuggestions={alleStandorte} />
              </div>
            </div>
          </div>
          {/* Kontakt */}
          <div>
            <div className={sectionCls}>Kontaktdaten</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Telefon</label>
                <input className={inputCls} type="tel" value={form.telefon} onChange={e => set('telefon', e.target.value)} placeholder="+49 651 12345" />
              </div>
              <div>
                <label className={labelCls}>E-Mail</label>
                <input className={inputCls} type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="fahrer@beispiel.de" />
              </div>
            </div>
          </div>
          {/* Führerschein */}
          <div>
            <div className={sectionCls}>Führerschein</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Führerscheinnummer</label>
                <input className={inputCls} value={form.fuehrerscheinNr} onChange={e => set('fuehrerscheinNr', e.target.value)} placeholder="B123456789" />
              </div>
              <div>
                <label className={labelCls}>Ablaufdatum</label>
                <input className={inputCls} type="date" value={form.fuehrerscheinAblauf} onChange={e => set('fuehrerscheinAblauf', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>Führerscheinklassen</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {FS_KLASSEN.map(k => {
                    const active = form.fuehrerscheinKlassen.includes(k);
                    return (
                      <button key={k} type="button" onClick={() => toggleKlasse(k)}
                        className="px-3 py-1 rounded-lg text-xs font-bold border transition-all"
                        style={active ? { background: '#2563eb', color: '#fff', borderColor: '#2563eb' } : { background: '#f9fafb', color: '#6b7280', borderColor: '#e5e7eb' }}>
                        {k}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          {/* ADR */}
          <div>
            <div className={sectionCls}>ADR-Schein</div>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors">
                <input type="checkbox" checked={form.adrSchein} onChange={e => set('adrSchein', e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-blue-600 flex-shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-gray-800">ADR-Schein vorhanden</div>
                  <div className="text-xs text-gray-500 mt-0.5">Fahrer darf Gefahrgut mit mehr als 1.000 Punkten transportieren</div>
                </div>
              </label>
              {form.adrSchein && (
                <div>
                  <label className={labelCls}>ADR-Schein gültig bis</label>
                  <input className={inputCls} type="date" value={form.adrAblauf} onChange={e => set('adrAblauf', e.target.value)} />
                </div>
              )}
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
                <span className="text-sm font-medium text-gray-700">Fahrer aktiv</span>
              </label>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Abbrechen</button>
          <button type="button" disabled={busy} onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Speichern...' : driver ? 'Speichern' : 'Anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dokumente Modal ─────────────────────────────────────────────────────────

function DokumenteModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const isAdmin = hasRole('administrator');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dokName, setDokName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: dokumente = [], isLoading } = useQuery<VehicleDocument[]>({
    queryKey: ['fahrer-dokumente', driver._id],
    queryFn: () => driverApi.dokumenteLaden(driver._id),
  });

  const uploadMut = useMutation({
    mutationFn: () => driverApi.dokumentHochladen(driver._id, dokName.trim() || selectedFile!.name, selectedFile!),
    onSuccess: () => {
      if (dokName.trim()) saveSuggestion(KEYS.dokname, dokName.trim());
      queryClient.invalidateQueries({ queryKey: ['fahrer-dokumente', driver._id] });
      setDokName(''); setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = '';
      setUploadError('');
    },
    onError: (e: any) => setUploadError(e.response?.data?.message || 'Fehler beim Hochladen'),
  });

  const deleteMut = useMutation({
    mutationFn: (docId: string) => driverApi.dokumentLoeschen(driver._id, docId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrer-dokumente', driver._id] }); setDeleteTarget(null); },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setSelectedFile(f);
    if (f && !dokName) setDokName(f.name.replace(/\.[^.]+$/, ''));
  }

  function openDoc(doc: VehicleDocument) {
    const token = localStorage.getItem('orderdesk_token');
    fetch(driverApi.dokumentUrl(doc.filename), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => window.open(URL.createObjectURL(blob), '_blank'));
  }

  function downloadDoc(doc: VehicleDocument) {
    const token = localStorage.getItem('orderdesk_token');
    fetch(driverApi.dokumentUrl(doc.filename), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob()).then(blob => {
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
            <p className="text-xs text-gray-500 mt-0.5">{driver.vorname} {driver.nachname}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isAdmin && (
            <div className="px-6 py-4 border-b bg-gray-50">
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Dokument hochladen</div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Name des Dokuments</label>
                  <AutocompleteInput className={inputCls} value={dokName} onChange={setDokName} storageKey={KEYS.dokname} placeholder="z.B. Führerschein, ADR-Schein, Fahrzeugmodul..." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Datei (PDF oder Bild)</label>
                  <div className="flex items-center gap-3">
                    <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleFileChange} className="hidden" id="fahrer-dok-input" />
                    <label htmlFor="fahrer-dok-input" className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 cursor-pointer transition-colors flex-1">
                      <Upload className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{selectedFile ? selectedFile.name : 'Datei auswählen...'}</span>
                    </label>
                    <button type="button" disabled={!selectedFile || uploadMut.isPending} onClick={() => { setUploadError(''); uploadMut.mutate(); }}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 flex-shrink-0">
                      {uploadMut.isPending ? 'Lädt...' : 'Hochladen'}
                    </button>
                  </div>
                  {selectedFile && <p className="text-xs text-gray-400 mt-1">{formatSize(selectedFile.size)}</p>}
                  {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
                </div>
              </div>
            </div>
          )}
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
                  const uploadedBy = doc.hochgeladenVon && typeof doc.hochgeladenVon === 'object' ? doc.hochgeladenVon.name : '';
                  return (
                    <div key={doc._id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 bg-white">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: isPdf ? '#fee2e2' : '#dbeafe' }}>
                        {isPdf ? <FileText className="w-4 h-4 text-red-600" /> : <ImageIcon className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900 truncate">{doc.name}</div>
                        <div className="text-xs text-gray-400">{formatDate(doc.hochgeladenAm)}{uploadedBy && ` · ${uploadedBy}`}{' · '}{formatSize(doc.size)}</div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openDoc(doc)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Öffnen"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => downloadDoc(doc)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-green-600" title="Herunterladen"><Download className="w-3.5 h-3.5" /></button>
                        {isAdmin && <button onClick={() => setDeleteTarget(doc._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Löschen"><Trash2 className="w-3.5 h-3.5" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40" onClick={e => e.stopPropagation()}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <div><div className="font-bold text-gray-900">Dokument löschen?</div><div className="text-sm text-gray-500">Diese Aktion kann nicht rückgängig gemacht werden.</div></div>
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

export default function FahrerPage() {
  const queryClient = useQueryClient();
  const [filterStandort, setFilterStandort] = useState('');
  const [filterAktiv, setFilterAktiv] = useState<'alle' | 'aktiv' | 'inaktiv'>('aktiv');
  const [modalDriver, setModalDriver] = useState<Driver | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dokkTarget, setDokkTarget] = useState<Driver | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Driver | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const { data: fahrer = [], isLoading } = useQuery<Driver[]>({
    queryKey: ['fahrer'],
    queryFn: () => driverApi.list(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => driverApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['fahrer'] }); setDeleteTarget(null); },
    onError: (e: any) => setDeleteError(e.response?.data?.message || 'Fehler beim Löschen'),
  });

  const standorte = useMemo(() => Array.from(new Set(fahrer.map(f => f.standort).filter(Boolean))).sort(), [fahrer]);

  const filtered = useMemo(() => fahrer.filter(f => {
    if (filterStandort && f.standort !== filterStandort) return false;
    if (filterAktiv === 'aktiv' && !f.aktiv) return false;
    if (filterAktiv === 'inaktiv' && f.aktiv) return false;
    return true;
  }), [fahrer, filterStandort, filterAktiv]);

  const selectCls = 'border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <UserCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Fahrerverwaltung</h1>
            <p className="text-sm text-gray-500">{fahrer.length} Fahrer gesamt</p>
          </div>
        </div>
        <button onClick={() => { setModalDriver(null); setShowEditModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
          <Plus className="w-4 h-4" />
          Fahrer anlegen
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

      {/* Tabelle */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">Laden...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-400">
            <UserCheck className="w-8 h-8 opacity-40" />
            <span className="text-sm">Keine Fahrer gefunden</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Kontakt</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Standort</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Führerschein</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">ADR</th>
                  <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Dok.</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(f => {
                  const docCount = (f.dokumente || []).length;
                  return (
                    <tr key={f._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-gray-900">{f.nachname}, {f.vorname}</div>
                        {f.geburtsdatum && <div className="text-xs text-gray-400">{formatDate(f.geburtsdatum)}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {f.telefon && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <Phone className="w-3 h-3 text-gray-400" />{f.telefon}
                            </div>
                          )}
                          {f.email && (
                            <div className="flex items-center gap-1 text-xs text-gray-600">
                              <Mail className="w-3 h-3 text-gray-400" />{f.email}
                            </div>
                          )}
                          {!f.telefon && !f.email && <span className="text-xs text-gray-400">–</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{f.standort || <span className="text-gray-400">–</span>}</td>
                      <td className="px-4 py-3">
                        {f.fuehrerscheinKlassen.length > 0 ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-1">
                              {f.fuehrerscheinKlassen.map(k => (
                                <span key={k} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded">{k}</span>
                              ))}
                            </div>
                            {f.fuehrerscheinAblauf && <DateBadge iso={f.fuehrerscheinAblauf} />}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {f.adrSchein ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                              <span className="text-xs font-semibold text-green-700">ADR</span>
                            </div>
                            {f.adrAblauf && <DateBadge iso={f.adrAblauf} />}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setDokkTarget(f)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors hover:bg-indigo-100"
                          style={{ color: docCount > 0 ? '#4f46e5' : '#9ca3af', background: docCount > 0 ? '#e0e7ff' : '#f3f4f6' }}
                        >
                          <Paperclip className="w-3 h-3" />{docCount}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${f.aktiv ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.aktiv ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => { setModalDriver(f); setShowEditModal(true); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700" title="Bearbeiten">
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
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-green-100 border border-green-300" /> &gt; 30 Tage</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-yellow-100 border border-yellow-300" /> ≤ 30 Tage</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block bg-red-100 border border-red-300" /> Überfällig</span>
      </div>

      {/* Fahrer anlegen/bearbeiten */}
      {showEditModal && (
        <FahrerModal driver={modalDriver} alleStandorte={standorte} onClose={() => setShowEditModal(false)} />
      )}

      {/* Dokumente */}
      {dokkTarget && <DokumenteModal driver={dokkTarget} onClose={() => setDokkTarget(null)} />}

      {/* Delete Confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><Trash2 className="w-5 h-5 text-red-600" /></div>
              <div>
                <div className="font-bold text-gray-900">Fahrer löschen?</div>
                <div className="text-sm text-gray-500">{deleteTarget.vorname} {deleteTarget.nachname} — alle Dokumente werden ebenfalls gelöscht.</div>
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
