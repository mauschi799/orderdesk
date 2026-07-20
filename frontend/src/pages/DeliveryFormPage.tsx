import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Save, Package, Star, X, MapPin, Pencil } from 'lucide-react';
import { deliveriesApi } from '../api';
import { Position } from '../types';
import { PageHeader, Card, Button } from '../components/ui';
import { formatWeight, cn } from '../utils';

// ── InputField MUST be outside the component to avoid remount on every keystroke ──
interface InputFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
  className?: string;
}

function InputField({ label, value, onChange, required = false, placeholder = '', type = 'text', className = '' }: InputFieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 transition-all"
      />
    </div>
  );
}

const emptyPosition = (): Position => ({
  artikelnummer: '', beschreibung: '', menge: 1,
  gewicht: 0, einheit: 'Stk',
});

interface FormState {
  lieferscheinNr: string;
  auftragNr: string;
  lieferdatum: string;
  notiz: string;
  kunde: {
    kundennummer: string; name: string; name2: string;
    adresse: { strasse: string; plz: string; ort: string; land: string };
    telefon: string; email: string;
  };
  positionen: Position[];
}

// ── Schnelladressen ───────────────────────────────────────────────────────────

interface SchnellAdresse {
  id: string;
  label: string;
  kundennummer: string;
  name: string;
  name2: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon: string;
}

const STORAGE_KEY = 'schnelladressen';

function loadSchnelladressen(): SchnellAdresse[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveSchnelladressen(list: SchnellAdresse[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

const EMPTY_SCHNELL: Omit<SchnellAdresse, 'id'> = {
  label: '', kundennummer: '', name: '', name2: '', strasse: '', plz: '', ort: '', telefon: '',
};

function SchnelladressenPanel({ onSelect }: { onSelect: (a: SchnellAdresse) => void }) {
  const [adressen, setAdressen] = useState<SchnellAdresse[]>(loadSchnelladressen);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<SchnellAdresse, 'id'>>(EMPTY_SCHNELL);

  const set = (k: keyof typeof EMPTY_SCHNELL, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setForm(EMPTY_SCHNELL); setEditId(null); setShowForm(true); };
  const openEdit = (a: SchnellAdresse) => {
    const { id, ...rest } = a;
    setForm(rest); setEditId(id); setShowForm(true);
  };

  const save = () => {
    if (!form.label.trim() || !form.name.trim()) return;
    let next: SchnellAdresse[];
    if (editId) {
      next = adressen.map(a => a.id === editId ? { ...form, id: editId } : a);
    } else {
      next = [...adressen, { ...form, id: Date.now().toString() }];
    }
    saveSchnelladressen(next);
    setAdressen(next);
    setShowForm(false);
    setEditId(null);
  };

  const remove = (id: string) => {
    const next = adressen.filter(a => a.id !== id);
    saveSchnelladressen(next);
    setAdressen(next);
  };

  return (
    <div className="w-72 shrink-0">
      <div className="sticky top-[73px]">
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-slate-700">Schnelladressen</span>
            </div>
            <button
              onClick={openAdd}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-orange-600 hover:bg-orange-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Neu
            </button>
          </div>

          {/* Add / Edit form */}
          {showForm && (
            <div className="border-b border-slate-100 p-3 bg-orange-50/50 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-orange-700">{editId ? 'Adresse bearbeiten' : 'Neue Schnelladresse'}</span>
                <button onClick={() => setShowForm(false)} className="p-0.5 text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {([
                { k: 'label',        label: 'Bezeichnung *',  ph: 'z.B. TÜV Trier' },
                { k: 'kundennummer', label: 'Kundennummer',   ph: 'K-001' },
                { k: 'name',         label: 'Firmenname *',   ph: 'TÜV Rheinland GmbH' },
                { k: 'name2',        label: 'Name 2',         ph: 'Abteilung' },
                { k: 'strasse',      label: 'Straße',         ph: 'Musterstraße 1' },
                { k: 'plz',          label: 'PLZ',            ph: '54290' },
                { k: 'ort',          label: 'Ort',            ph: 'Trier' },
                { k: 'telefon',      label: 'Telefon',        ph: '0651-12345' },
              ] as { k: keyof typeof EMPTY_SCHNELL; label: string; ph: string }[]).map(({ k, label, ph }) => (
                <div key={k}>
                  <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</label>
                  <input
                    value={form[k]}
                    onChange={e => set(k, e.target.value)}
                    placeholder={ph}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                  />
                </div>
              ))}
              <button
                onClick={save}
                disabled={!form.label.trim() || !form.name.trim()}
                className="w-full mt-1 py-1.5 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 disabled:opacity-40 transition-colors"
              >
                {editId ? 'Speichern' : 'Hinzufügen'}
              </button>
            </div>
          )}

          {/* Address list */}
          <div className="divide-y divide-slate-50 max-h-[calc(100vh-220px)] overflow-y-auto">
            {adressen.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-400">
                <MapPin className="w-6 h-6 mx-auto mb-2 opacity-30" />
                Noch keine Schnelladressen.<br />Klicke auf „Neu" um eine hinzuzufügen.
              </div>
            ) : (
              adressen.map(a => (
                <div
                  key={a.id}
                  className="group px-4 py-3 hover:bg-orange-50 cursor-pointer transition-colors"
                  onClick={() => onSelect(a)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-xs font-bold text-orange-600 truncate">{a.label}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-800 truncate">{a.name}</div>
                      {a.name2 && <div className="text-xs text-slate-500 truncate">{a.name2}</div>}
                      {(a.strasse || a.ort) && (
                        <div className="text-xs text-slate-400 truncate mt-0.5">
                          {[a.strasse, [a.plz, a.ort].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(a); }}
                        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700"
                        title="Bearbeiten"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); remove(a.id); }}
                        className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500"
                        title="Entfernen"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DeliveryFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = !!id && id !== 'neu';

  const { data: existing } = useQuery({
    queryKey: ['delivery', id],
    queryFn: () => deliveriesApi.get(id!),
    enabled: isEdit,
  });

  const [form, setForm] = useState<FormState>(() => ({
    lieferscheinNr: existing?.lieferscheinNr || '',
    auftragNr: existing?.auftragNr || '',
    lieferdatum: existing?.lieferdatum
      ? new Date(existing.lieferdatum).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    notiz: existing?.notiz || '',
    kunde: {
      kundennummer: existing?.kunde?.kundennummer || '',
      name: existing?.kunde?.name || '',
      name2: existing?.kunde?.name2 || '',
      adresse: {
        strasse: existing?.kunde?.adresse?.strasse || '',
        plz: existing?.kunde?.adresse?.plz || '',
        ort: existing?.kunde?.adresse?.ort || '',
        land: existing?.kunde?.adresse?.land || 'DE',
      },
      telefon: existing?.kunde?.telefon || '',
      email: existing?.kunde?.email || '',
    },
    positionen: existing?.positionen || [emptyPosition()],
  }));

  const [error, setError] = useState('');
  const [appliedLabel, setAppliedLabel] = useState<string | null>(null);

  const setField = useCallback(<K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm(f => ({ ...f, [key]: val }));
  }, []);

  const setKundeField = useCallback(<K extends keyof FormState['kunde']>(key: K, val: string) => {
    setForm(f => ({ ...f, kunde: { ...f.kunde, [key]: val } }));
  }, []);

  const setAdresseField = useCallback(<K extends keyof FormState['kunde']['adresse']>(key: K, val: string) => {
    setForm(f => ({ ...f, kunde: { ...f.kunde, adresse: { ...f.kunde.adresse, [key]: val } } }));
  }, []);

  const updatePosition = useCallback((i: number, field: keyof Position, value: any) => {
    setForm(f => ({
      ...f,
      positionen: f.positionen.map((p, idx) => idx === i ? { ...p, [field]: value } : p),
    }));
  }, []);

  const addPosition = useCallback(() => {
    setForm(f => ({ ...f, positionen: [...f.positionen, emptyPosition()] }));
  }, []);

  const removePosition = useCallback((i: number) => {
    setForm(f => ({ ...f, positionen: f.positionen.filter((_, idx) => idx !== i) }));
  }, []);

  const applySchnelladresse = useCallback((a: SchnellAdresse) => {
    setForm(f => ({
      ...f,
      kunde: {
        ...f.kunde,
        kundennummer: a.kundennummer || f.kunde.kundennummer,
        name: a.name,
        name2: a.name2 || '',
        adresse: {
          strasse: a.strasse || '',
          plz: a.plz || '',
          ort: a.ort || '',
          land: f.kunde.adresse.land,
        },
        telefon: a.telefon || f.kunde.telefon,
      },
    }));
    setAppliedLabel(a.label);
    setTimeout(() => setAppliedLabel(null), 2500);
  }, []);

  const createMutation = useMutation({
    mutationFn: (data: any) => deliveriesApi.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      navigate(`/lieferscheine/${data._id}`);
    },
    onError: (err: any) => setError(err.response?.data?.message || 'Fehler beim Speichern'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => deliveriesApi.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
      queryClient.invalidateQueries({ queryKey: ['deliveries'] });
      navigate(`/lieferscheine/${id}`);
    },
    onError: (err: any) => setError(err.response?.data?.message || 'Fehler beim Speichern'),
  });

  const handleSubmit = () => {
    if (!form.lieferscheinNr.trim()) return setError('Lieferscheinnummer ist erforderlich');
    if (!form.kunde.name.trim()) return setError('Kundenname ist erforderlich');
    if (!form.positionen.length) return setError('Mindestens eine Position erforderlich');
    setError('');
    const data = {
      ...form,
      lieferdatum: new Date(form.lieferdatum),
      positionen: form.positionen.map(p => ({
        ...p, menge: Number(p.menge), gewicht: Number(p.gewicht),
      })),
    };
    if (isEdit) updateMutation.mutate(data);
    else createMutation.mutate(data);
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;
  const gesamtgewicht = form.positionen.reduce((sum, pos) => sum + Number(pos.gewicht) * Number(pos.menge), 0);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-slate-900">
            {isEdit ? 'Lieferschein bearbeiten' : 'Neuer Lieferschein'}
          </h1>
          <p className="text-xs text-slate-400">Manuell erstellen</p>
        </div>
        {appliedLabel && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 font-semibold animate-pulse">
            <Star className="w-3 h-3" /> {appliedLabel} übernommen
          </div>
        )}
        <Button onClick={handleSubmit} loading={isLoading}>
          <Save className="w-3.5 h-3.5" />
          {isEdit ? 'Speichern' : 'Erstellen'}
        </Button>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-5 p-6 items-start">

        {/* Left: form */}
        <div className="flex-1 min-w-0 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}

          {/* Header info */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-4 text-sm">Lieferschein-Daten</h2>
            <div className="grid grid-cols-3 gap-4">
              <InputField label="Lieferschein-Nr." value={form.lieferscheinNr}
                onChange={v => setField('lieferscheinNr', v)} required placeholder="LS-2024-0001" />
              <InputField label="Auftrag-Nr." value={form.auftragNr}
                onChange={v => setField('auftragNr', v)} placeholder="Optional" />
              <InputField label="Lieferdatum" type="date" value={form.lieferdatum}
                onChange={v => setField('lieferdatum', v)} required />
            </div>
          </Card>

          {/* Customer */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-4 text-sm">Kundendaten</h2>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Kundennummer" value={form.kunde.kundennummer}
                onChange={v => setKundeField('kundennummer', v)} placeholder="K-1001" />
              <InputField label="Kundenname" value={form.kunde.name}
                onChange={v => setKundeField('name', v)} required placeholder="Musterfirma GmbH" />
              <InputField label="Name 2" value={form.kunde.name2}
                onChange={v => setKundeField('name2', v)} placeholder="Abteilung / Zusatz" />
              <InputField label="Straße" value={form.kunde.adresse.strasse}
                onChange={v => setAdresseField('strasse', v)} placeholder="Musterstraße 1" />
              <InputField label="PLZ" value={form.kunde.adresse.plz}
                onChange={v => setAdresseField('plz', v)} placeholder="54290" />
              <InputField label="Ort" value={form.kunde.adresse.ort}
                onChange={v => setAdresseField('ort', v)} placeholder="Trier" />
              <InputField label="Telefon" value={form.kunde.telefon}
                onChange={v => setKundeField('telefon', v)} placeholder="0651-12345" />
              <InputField label="E-Mail" type="email" value={form.kunde.email}
                onChange={v => setKundeField('email', v)} placeholder="kunde@example.com" />
            </div>
          </Card>

          {/* Positions */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Package className="w-4 h-4 text-orange-500" /> Positionen
                </h2>
                {gesamtgewicht > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    Gesamtgewicht: <span className="font-bold text-orange-600">{formatWeight(gesamtgewicht)}</span>
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={addPosition}>
                <Plus className="w-3.5 h-3.5" /> Position hinzufügen
              </Button>
            </div>

            <div className="grid grid-cols-[110px_1fr_75px_100px_70px_36px] gap-2 px-2 mb-1.5">
              {['Art.-Nr.', 'Beschreibung', 'Menge', 'Gewicht (kg)', 'Einheit', ''].map(h => (
                <div key={h} className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{h}</div>
              ))}
            </div>

            <div className="space-y-2">
              {form.positionen.map((pos, i) => {
                const gesamt = Number(pos.gewicht) * Number(pos.menge);
                return (
                  <div key={i} className="grid grid-cols-[110px_1fr_75px_100px_70px_36px] gap-2 items-center bg-slate-50 rounded-xl p-2">
                    <input
                      value={pos.artikelnummer}
                      onChange={e => updatePosition(i, 'artikelnummer', e.target.value)}
                      placeholder="G-11KG"
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-mono bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <input
                      value={pos.beschreibung}
                      onChange={e => updatePosition(i, 'beschreibung', e.target.value)}
                      placeholder="Propangas 11kg Flasche"
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <input
                      type="number" value={pos.menge} min="0"
                      onChange={e => updatePosition(i, 'menge', e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-center bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <input
                      type="number" value={pos.gewicht} step="0.1" min="0"
                      onChange={e => updatePosition(i, 'gewicht', e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                    <select
                      value={pos.einheit}
                      onChange={e => updatePosition(i, 'einheit', e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                    >
                      {['Stk', 'kg', 'L', 'Pkt'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => removePosition(i)}
                        disabled={form.positionen.length === 1}
                        className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-500 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      {gesamt > 0 && (
                        <span className="text-[9px] text-orange-500 font-bold">{gesamt.toFixed(1)}kg</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Notes */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-3 text-sm">Notiz</h2>
            <textarea
              value={form.notiz}
              onChange={e => setField('notiz', e.target.value)}
              rows={3}
              placeholder="Interne Bemerkungen..."
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </Card>
        </div>

        {/* Right: Schnelladressen */}
        <SchnelladressenPanel onSelect={applySchnelladresse} />
      </div>
    </div>
  );
}
