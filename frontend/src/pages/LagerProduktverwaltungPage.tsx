import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Package, GripVertical, Store } from 'lucide-react';
import { lagerApi } from '../api';
import { LagerProdukt } from '../types';
import { Card, Button, PageHeader, Modal } from '../components/ui';
import { cn } from '../utils';

const EINHEITEN = ['Stk', 'Kg', 'Liter', 'Flasche', 'Palette', 't'];

interface ProduktForm {
  artikelnummer: string;
  beschreibung: string;
  einheit: string;
  aktiv: boolean;
  sortierung: number;
  verfuegbarIn: string[];
}

const emptyForm = (): ProduktForm => ({
  artikelnummer: '',
  beschreibung: '',
  einheit: 'Stk',
  aktiv: true,
  sortierung: 0,
  verfuegbarIn: [],
});

export default function LagerProduktverwaltungPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProduktForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: produkte = [], isLoading } = useQuery<LagerProdukt[]>({
    queryKey: ['lager-produkte'],
    queryFn: lagerApi.produkte,
  });

  const { data: filialen = [] } = useQuery<string[]>({
    queryKey: ['lager-filialen'],
    queryFn: lagerApi.filialen,
  });

  const erstellenMutation = useMutation({
    mutationFn: (data: ProduktForm) => lagerApi.produktErstellen(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lager-produkte'] }); closeModal(); },
  });

  const aktualisierenMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProduktForm }) => lagerApi.produktAktualisieren(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lager-produkte'] }); closeModal(); },
  });

  const loeschenMutation = useMutation({
    mutationFn: (id: string) => lagerApi.produktLoeschen(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lager-produkte'] }); setDeleteConfirm(null); },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (p: LagerProdukt) => {
    setEditingId(p._id);
    setForm({
      artikelnummer: p.artikelnummer,
      beschreibung: p.beschreibung,
      einheit: p.einheit,
      aktiv: p.aktiv,
      sortierung: p.sortierung,
      verfuegbarIn: p.verfuegbarIn || [],
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const handleSubmit = () => {
    if (editingId) {
      aktualisierenMutation.mutate({ id: editingId, data: form });
    } else {
      erstellenMutation.mutate(form);
    }
  };

  const toggleFiliale = (name: string) => {
    setForm(f => ({
      ...f,
      verfuegbarIn: f.verfuegbarIn.includes(name)
        ? f.verfuegbarIn.filter(x => x !== name)
        : [...f.verfuegbarIn, name],
    }));
  };

  const isPending = erstellenMutation.isPending || aktualisierenMutation.isPending;
  const error = erstellenMutation.error || aktualisierenMutation.error;

  return (
    <div>
      <PageHeader
        title="Produkte verwalten"
        subtitle={`${produkte.length} Produkte konfiguriert`}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Neues Produkt
          </Button>
        }
      />

      <div className="p-6 max-w-3xl">
        <Card>
          {isLoading && (
            <div className="p-8 text-center text-sm text-slate-400">Lädt...</div>
          )}

          {!isLoading && produkte.length === 0 && (
            <div className="p-10 text-center">
              <Package className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-4">Noch keine Produkte angelegt</p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" />
                Erstes Produkt anlegen
              </Button>
            </div>
          )}

          {produkte.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['', 'Art.-Nr.', 'Bezeichnung', 'Einheit', 'Verfügbar für', 'Status', ''].map((h, i) => (
                      <th key={i} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {produkte.map(p => (
                    <tr key={p._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-2 py-3 text-slate-200">
                        <GripVertical className="w-4 h-4" />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {p.artikelnummer || '–'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800 text-sm">
                        {p.beschreibung}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {p.einheit}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500">
                        {p.verfuegbarIn.length === 0 ? (
                          <span className="text-xs text-slate-400 italic">Alle Filialen</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {p.verfuegbarIn.map(f => (
                              <span key={f} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5">
                                <Store className="w-2.5 h-2.5" />
                                {f}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-xs font-medium px-2 py-1 rounded-full',
                          p.aktiv ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'
                        )}>
                          {p.aktiv ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(p._id)}
                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? 'Produkt bearbeiten' : 'Neues Produkt'}
        size="md"
      >
        <div className="p-6 space-y-4">
          {/* Beschreibung */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Bezeichnung *</label>
            <input
              value={form.beschreibung}
              onChange={e => setForm(f => ({ ...f, beschreibung: e.target.value }))}
              placeholder="z.B. Propangas 11 kg"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Artikelnummer + Einheit nebeneinander */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Artikelnummer</label>
              <input
                value={form.artikelnummer}
                onChange={e => setForm(f => ({ ...f, artikelnummer: e.target.value }))}
                placeholder="optional"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Einheit</label>
              <select
                value={form.einheit}
                onChange={e => setForm(f => ({ ...f, einheit: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {EINHEITEN.map(e => <option key={e}>{e}</option>)}
              </select>
            </div>
          </div>

          {/* Sortierung */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Reihenfolge</label>
            <input
              type="number"
              value={form.sortierung}
              onChange={e => setForm(f => ({ ...f, sortierung: parseInt(e.target.value) || 0 }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <p className="text-xs text-slate-400 mt-1">Niedrigere Zahl = weiter oben in der Meldemaske</p>
          </div>

          {/* Filialen */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Verfügbar für
              <span className="ml-2 text-xs text-slate-400 font-normal">
                {form.verfuegbarIn.length === 0 ? '(alle Filialen)' : `${form.verfuegbarIn.length} ausgewählt`}
              </span>
            </label>
            {filialen.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Noch keine Filialen bekannt — Produkt wird in allen Filialen angezeigt</p>
            ) : (
              <div className="space-y-2 border border-slate-100 rounded-xl p-3 max-h-48 overflow-y-auto">
                <label className="flex items-center gap-2 text-sm cursor-pointer text-slate-500 pb-2 border-b border-slate-50">
                  <input
                    type="checkbox"
                    checked={form.verfuegbarIn.length === 0}
                    onChange={() => setForm(f => ({ ...f, verfuegbarIn: [] }))}
                    className="accent-orange-500"
                  />
                  <span className="italic">Alle Filialen</span>
                </label>
                {filialen.map(f => (
                  <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.verfuegbarIn.includes(f)}
                      onChange={() => toggleFiliale(f)}
                      className="accent-orange-500"
                    />
                    <Store className="w-3.5 h-3.5 text-green-500" />
                    <span className="text-slate-700">{f}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Aktiv */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium text-slate-700">Produkt aktiv</div>
              <div className="text-xs text-slate-400">Inaktive Produkte erscheinen nicht in der Meldemaske</div>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, aktiv: !f.aktiv }))}
              className={cn('w-12 h-6 rounded-full transition-colors relative', form.aktiv ? 'bg-orange-500' : 'bg-slate-200')}
            >
              <span className={cn('absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all', form.aktiv ? 'left-7' : 'left-1')} />
            </button>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {(error as any)?.response?.data?.message || 'Fehler beim Speichern'}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={closeModal}>Abbrechen</Button>
            <Button
              loading={isPending}
              disabled={!form.beschreibung.trim()}
              onClick={handleSubmit}
            >
              {editingId ? 'Speichern' : 'Anlegen'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-bold text-slate-900 mb-2">Produkt löschen?</h3>
            <p className="text-sm text-slate-600 mb-5">Das Produkt wird aus allen Melde-Masken entfernt. Bereits gespeicherte Meldungen bleiben erhalten.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Abbrechen</Button>
              <Button
                variant="danger"
                loading={loeschenMutation.isPending}
                onClick={() => loeschenMutation.mutate(deleteConfirm)}
              >
                Löschen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
