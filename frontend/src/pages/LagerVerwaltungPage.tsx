import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { warehousesApi } from '../api';
import { Warehouse } from '../types';
import { Card, Button, PageHeader, Modal } from '../components/ui';
import { cn, LAGER_FARBEN, LAGER_FARBE_CLASSES } from '../utils';

interface LagerForm {
  code: string;
  name: string;
  farbe: string;
  sortierung: number;
  aktiv: boolean;
}

const emptyForm = (): LagerForm => ({
  code: '',
  name: '',
  farbe: 'slate',
  sortierung: 0,
  aktiv: true,
});

export default function LagerVerwaltungPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LagerForm>(emptyForm());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: warehouses = [], isLoading } = useQuery<Warehouse[]>({
    queryKey: ['warehouses'],
    queryFn: () => warehousesApi.list(),
  });

  const erstellenMutation = useMutation({
    mutationFn: (data: LagerForm) => warehousesApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warehouses'] }); closeModal(); },
  });

  const aktualisierenMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: LagerForm }) => warehousesApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warehouses'] }); closeModal(); },
  });

  const loeschenMutation = useMutation({
    mutationFn: (id: string) => warehousesApi.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['warehouses'] }); setDeleteConfirm(null); },
    onError: () => { /* Fehlermeldung (z.B. "wird noch verwendet") wird unten im Confirm-Dialog angezeigt */ },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (w: Warehouse) => {
    setEditingId(w._id);
    setForm({ code: w.code, name: w.name, farbe: w.farbe, sortierung: w.sortierung, aktiv: w.aktiv });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const handleSubmit = () => {
    if (editingId) {
      // Code ist beim Bearbeiten fix (siehe Backend) - wird trotzdem mitgeschickt, aber ignoriert
      aktualisierenMutation.mutate({ id: editingId, data: form });
    } else {
      erstellenMutation.mutate(form);
    }
  };

  const isPending = erstellenMutation.isPending || aktualisierenMutation.isPending;
  const error = erstellenMutation.error || aktualisierenMutation.error;
  const deleteError = loeschenMutation.error;

  return (
    <div>
      <PageHeader
        title="Läger verwalten"
        subtitle={`${warehouses.length} Auslieferungsläger konfiguriert`}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Neues Lager
          </Button>
        }
      />

      <div className="p-6 max-w-3xl">
        <Card>
          {isLoading && (
            <div className="p-8 text-center text-sm text-slate-400">Lädt...</div>
          )}

          {!isLoading && warehouses.length === 0 && (
            <div className="p-10 text-center">
              <WarehouseIcon className="w-8 h-8 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-4">Noch keine Läger angelegt</p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" />
                Erstes Lager anlegen
              </Button>
            </div>
          )}

          {warehouses.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['', 'Code', 'Name', 'Reihenfolge', 'Status', ''].map((h, i) => (
                      <th key={i} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {warehouses.map(w => {
                    const c = LAGER_FARBE_CLASSES[w.farbe] || LAGER_FARBE_CLASSES.slate;
                    return (
                      <tr key={w._id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className={cn('w-3 h-3 rounded-full', c.swatch)} />
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-400">{w.code}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 text-sm">{w.name}</td>
                        <td className="px-4 py-3 text-sm text-slate-500">{w.sortierung}</td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            'text-xs font-medium px-2 py-1 rounded-full',
                            w.aktiv ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-400'
                          )}>
                            {w.aktiv ? 'Aktiv' : 'Inaktiv'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEdit(w)}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(w._id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            >
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
        </Card>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editingId ? 'Lager bearbeiten' : 'Neues Lager'}
        size="md"
      >
        <div className="p-6 space-y-4">
          {/* Code */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
            <input
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))}
              placeholder="z.B. wittlich"
              disabled={!!editingId}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 font-mono disabled:bg-slate-50 disabled:text-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1">
              {editingId ? 'Kann nachträglich nicht mehr geändert werden.' : 'Kleinbuchstaben, Zahlen, - und _. Wird intern als Kanban-Spalte & Filterwert verwendet.'}
            </p>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Anzeigename *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="z.B. Wittlich"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Farbe */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Farbe</label>
            <div className="flex flex-wrap gap-2">
              {LAGER_FARBEN.map(farbe => (
                <button
                  key={farbe}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, farbe }))}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                    LAGER_FARBE_CLASSES[farbe].swatch,
                    form.farbe === farbe ? 'ring-2 ring-offset-2 ring-slate-400' : ''
                  )}
                  title={farbe}
                />
              ))}
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
            <p className="text-xs text-slate-400 mt-1">Niedrigere Zahl = weiter links im Kanban-Board</p>
          </div>

          {/* Aktiv */}
          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm font-medium text-slate-700">Lager aktiv</div>
              <div className="text-xs text-slate-400">Inaktive Läger haben keine Kanban-Spalte und stehen bei Zuweisungen nicht mehr zur Auswahl</div>
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
              disabled={!form.code.trim() || !form.name.trim()}
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
            <h3 className="font-bold text-slate-900 mb-2">Lager löschen?</h3>
            <p className="text-sm text-slate-600 mb-3">
              Nur möglich, wenn kein Lieferschein, keine Tour und kein Benutzer diesem Lager mehr zugeordnet ist.
            </p>
            {deleteError && (
              <div className="p-3 mb-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {(deleteError as any)?.response?.data?.message || 'Fehler beim Löschen'}
              </div>
            )}
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
