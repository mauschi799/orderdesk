import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Plus, Play, CheckCircle, Clock, Package,
  MapPin, Trash2, ChevronDown, ChevronRight,
  GripVertical, ArrowRight, RefreshCw, Pencil
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../api';
import { deliveriesApi } from '../api';
import { Delivery, Tour, TourDeliveryItem } from '../types';
import { PageHeader, Card, Button, Modal, StatusBadge } from '../components/ui';
import { formatDate, LAGER_LABELS, cn } from '../utils';
import { useAuthStore } from '../store/authStore';

const TOUR_STATUS_COLORS: Record<string, string> = {
  geplant: 'bg-slate-100 text-slate-700 border-slate-200',
  bereit: 'bg-blue-50 text-blue-700 border-blue-200',
  in_auslieferung: 'bg-amber-50 text-amber-700 border-amber-200',
  abgeschlossen: 'bg-green-50 text-green-700 border-green-200',
};
const TOUR_STATUS_LABELS: Record<string, string> = {
  geplant: 'Geplant',
  bereit: 'Bereit',
  in_auslieferung: 'In Auslieferung',
  abgeschlossen: 'Abgeschlossen',
};

interface TourForm {
  name: string;
  datum: string;
  lager: string;
  fahrer: string;
  fahrzeug: string;
  notiz: string;
}

const emptyForm = (): TourForm => ({
  name: '',
  datum: new Date().toISOString().split('T')[0],
  lager: '',
  fahrer: '',
  fahrzeug: '',
  notiz: '',
});

// ── Helpers ───────────────────────────────────────────────────────────────────
const getItemId = (item: TourDeliveryItem): string => {
  if (typeof item.delivery === 'object' && item.delivery !== null) return item.delivery._id;
  if (typeof item.delivery === 'string') return item.delivery;
  return item._id || String(Math.random());
};

// ── Sortable row component ─────────────────────────────────────────────────────
function SortableDeliveryRow({
  item, idx, navigate, canSort,
}: {
  item: TourDeliveryItem;
  idx: number;
  navigate: (path: string) => void;
  canSort: boolean;
}) {
  const id = getItemId(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !canSort });

  const delivery = typeof item.delivery === 'object' ? item.delivery as Delivery : null;
  if (!delivery) return null;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-3 px-5 py-3 transition-colors',
        item.abgeschlossen ? 'bg-green-50/50' : 'hover:bg-slate-50',
        isDragging && 'shadow-lg bg-white rounded-lg border border-slate-200 opacity-80 z-50 relative',
      )}
    >
      {/* Drag handle */}
      {canSort ? (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex-shrink-0 touch-none"
          title="Reihenfolge per Drag & Drop ändern"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      ) : (
        <div className="w-4 flex-shrink-0" />
      )}

      {/* Order badge */}
      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-slate-500">{idx + 1}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-slate-400">{delivery.lieferscheinNr}</span>
          <span className="font-medium text-sm text-slate-800 truncate">{delivery.kunde?.name}</span>
          {item.abgeschlossen && (
            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          )}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {item.adresse ||
            [delivery.kunde?.adresse?.strasse, delivery.kunde?.adresse?.plz, delivery.kunde?.adresse?.ort]
              .filter(Boolean)
              .join(', ')}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <StatusBadge status={delivery.status} />
        <button
          onClick={() => navigate(`/lieferscheine/${delivery._id}`)}
          className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ToursPage() {
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(false);
  const [form, setForm] = useState<TourForm>(emptyForm());
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState<string[]>([]);
  const [expandedTour, setExpandedTour] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  // Local sorted order per tour (optimistic UI for drag & drop)
  const [sortedMap, setSortedMap] = useState<Record<string, TourDeliveryItem[]>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const { data, isLoading } = useQuery({
    queryKey: ['tours', statusFilter],
    queryFn: () => api.get('/tours', { params: { status: statusFilter || undefined } }).then(r => r.data),
  });

  const { data: availableDeliveries } = useQuery({
    queryKey: ['deliveries-for-tour'],
    queryFn: () => deliveriesApi.list({ status: 'zugewiesen', limit: 100 }),
    enabled: showDeliveryPicker,
  });

  const [createError, setCreateError] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/tours', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tours'] });
      setShowCreateModal(false);
      setSelectedDeliveryIds([]);
      setForm(emptyForm());
      setCreateError('');
    },
    onError: (err: any) => setCreateError(err.response?.data?.message || err.message || 'Fehler'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tours/${id}/status`, { status }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tours'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tours/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tours'] }),
  });

  const geocodeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tours/${id}/geocode`).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tours'] }),
  });

  const reorderMutation = useMutation({
    mutationFn: ({ tourId, ids }: { tourId: string; ids: string[] }) =>
      api.patch(`/tours/${tourId}/deliveries`, { lieferscheinIds: ids }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tours'] }),
    onError: (_err, { tourId }) => {
      // Revert to server order
      const tour = tours.find((t: any) => t._id === tourId);
      if (tour) setSortedMap(prev => ({ ...prev, [tourId]: tour.lieferscheine || [] }));
    },
  });

  const tours: Tour[] = data?.tours || [];

  // Keep sortedMap in sync when server data changes (e.g. initial load)
  useEffect(() => {
    tours.forEach((tour: any) => {
      setSortedMap(prev => {
        // Don't overwrite if we have local state and counts match (mid-drag or already initialised)
        if (prev[tour._id] && prev[tour._id].length === (tour.lieferscheine?.length || 0)) {
          return prev;
        }
        return { ...prev, [tour._id]: tour.lieferscheine || [] };
      });
    });
  }, [tours]);

  const handleExpandTour = (tourId: string) => {
    setExpandedTour(prev => (prev === tourId ? null : tourId));
    // Initialise local sorted order on first expand
    if (!sortedMap[tourId]) {
      const tour = tours.find((t: any) => t._id === tourId);
      if (tour) setSortedMap(prev => ({ ...prev, [tourId]: tour.lieferscheine || [] }));
    }
  };

  const handleDragEnd = (event: DragEndEvent, tourId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const items = sortedMap[tourId] || [];
    const oldIdx = items.findIndex(item => getItemId(item) === active.id);
    const newIdx = items.findIndex(item => getItemId(item) === over.id);
    if (oldIdx === -1 || newIdx === -1) return;

    const reordered = arrayMove(items, oldIdx, newIdx);
    setSortedMap(prev => ({ ...prev, [tourId]: reordered }));

    const ids = reordered
      .map(item => (typeof item.delivery === 'object' ? item.delivery._id : item.delivery as string))
      .filter(Boolean);
    reorderMutation.mutate({ tourId, ids });
  };

  const toggleDelivery = (id: string) =>
    setSelectedDeliveryIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div>
      <PageHeader
        title="Tourenplanung"
        subtitle={`${tours.length} Touren`}
        actions={
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
            >
              <option value="">Alle Status</option>
              {Object.entries(TOUR_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {hasRole('administrator', 'disponent') && (
              <Button size="sm" onClick={() => navigate('/touren/neu')}>
                <Plus className="w-3.5 h-3.5" />
                Neue Tour
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-3">
        {isLoading && <div className="text-center py-12 text-slate-400">Lädt...</div>}

        {!isLoading && tours.length === 0 && (
          <Card className="py-16 text-center">
            <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-400">Keine Touren gefunden</p>
          </Card>
        )}

        {tours.map((tour: any) => {
          const isExpanded = expandedTour === tour._id;
          const items: TourDeliveryItem[] = sortedMap[tour._id] || tour.lieferscheine || [];
          const done = items.filter(l => l.abgeschlossen).length;
          const total = items.length;
          const canSort =
            hasRole('administrator', 'disponent') &&
            ['geplant', 'bereit'].includes(tour.status);
          const itemIds = items.map(getItemId);

          return (
            <Card key={tour._id} className="overflow-hidden">
              {/* Tour header */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => handleExpandTour(tour._id)}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-orange-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-bold text-slate-800">{tour.name}</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', TOUR_STATUS_COLORS[tour.status])}>
                      {TOUR_STATUS_LABELS[tour.status]}
                    </span>
                    {tour.lager && (
                      <span className="text-xs text-slate-500">{LAGER_LABELS[tour.lager]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>📅 {formatDate(tour.datum)}</span>
                    {tour.fahrer && <span>👤 {tour.fahrer}</span>}
                    {tour.fahrzeug && <span>🚐 {tour.fahrzeug}</span>}
                    <span>📦 {total} Stopps</span>
                    {total > 0 && (
                      <span className="text-green-600 font-medium">{done}/{total} erledigt</span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="mt-2 h-1.5 bg-slate-100 rounded-full w-48">
                      <div
                        className="h-full bg-green-400 rounded-full transition-all"
                        style={{ width: `${(done / total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {hasRole('administrator', 'disponent') && ['geplant', 'bereit'].includes(tour.status) && (
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/touren/${tour._id}/bearbeiten`); }}
                      className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                      title="Tour bearbeiten"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {hasRole('administrator', 'disponent') && tour.status === 'geplant' && (
                    <button
                      onClick={e => { e.stopPropagation(); statusMutation.mutate({ id: tour._id, status: 'bereit' }); }}
                      className="p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-500 rounded-lg transition-colors"
                      title="Als bereit markieren"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  {hasRole('administrator', 'disponent') && tour.status === 'bereit' && (
                    <button
                      onClick={e => { e.stopPropagation(); statusMutation.mutate({ id: tour._id, status: 'in_auslieferung' }); }}
                      className="p-1.5 hover:bg-amber-50 text-slate-400 hover:text-amber-500 rounded-lg transition-colors"
                      title="Tour starten"
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  {tour.status === 'in_auslieferung' && (
                    <button
                      onClick={e => { e.stopPropagation(); statusMutation.mutate({ id: tour._id, status: 'abgeschlossen' }); }}
                      className="p-1.5 hover:bg-green-50 text-slate-400 hover:text-green-500 rounded-lg transition-colors"
                      title="Tour abschließen"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); geocodeMutation.mutate(tour._id); }}
                    className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                    title="Adressen geocodieren"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                  {hasRole('administrator', 'disponent') && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        if (window.confirm('Tour wirklich löschen?')) deleteMutation.mutate(tour._id);
                      }}
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Expanded: sortable delivery list */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {items.length === 0 ? (
                    <div className="px-5 py-8 text-center text-slate-400 text-sm">
                      Keine Lieferscheine in dieser Tour
                    </div>
                  ) : (
                    <>
                      {canSort && (
                        <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 text-xs text-slate-400">
                          <GripVertical className="w-3 h-3" />
                          Reihenfolge per Drag & Drop anpassen
                          {reorderMutation.isPending && (
                            <span className="ml-auto flex items-center gap-1 text-orange-500">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Speichern…
                            </span>
                          )}
                        </div>
                      )}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={e => handleDragEnd(e, tour._id)}
                      >
                        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                          <div className="divide-y divide-slate-50">
                            {items.map((item, idx) => (
                              <SortableDeliveryRow
                                key={getItemId(item)}
                                item={item}
                                idx={idx}
                                navigate={navigate}
                                canSort={canSort}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Create Tour Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Neue Tour erstellen" size="lg">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Tour Trier 01.01."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Datum *</label>
              <input
                type="date"
                value={form.datum}
                onChange={e => setForm(f => ({ ...f, datum: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fahrer</label>
              <input
                value={form.fahrer}
                onChange={e => setForm(f => ({ ...f, fahrer: e.target.value }))}
                placeholder="Name des Fahrers"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fahrzeug</label>
              <input
                value={form.fahrzeug}
                onChange={e => setForm(f => ({ ...f, fahrzeug: e.target.value }))}
                placeholder="Kennzeichen / Bezeichnung"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Lager</label>
              <select
                value={form.lager}
                onChange={e => setForm(f => ({ ...f, lager: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                <option value="">Kein Lager</option>
                {['frei', 'bengel', 'trier'].map(l => (
                  <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notiz</label>
              <input
                value={form.notiz}
                onChange={e => setForm(f => ({ ...f, notiz: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Delivery picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">
                Lieferscheine hinzufügen
                {selectedDeliveryIds.length > 0 && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                    {selectedDeliveryIds.length} ausgewählt
                  </span>
                )}
              </label>
              <button
                type="button"
                onClick={() => setShowDeliveryPicker(!showDeliveryPicker)}
                className="text-xs text-orange-500 hover:text-orange-600"
              >
                {showDeliveryPicker ? 'Ausblenden' : 'Anzeigen'}
              </button>
            </div>

            {showDeliveryPicker && (
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                {!availableDeliveries?.deliveries?.length ? (
                  <div className="p-4 text-sm text-slate-400 text-center">
                    Keine zugewiesenen Lieferscheine verfügbar
                  </div>
                ) : (
                  availableDeliveries.deliveries.map((d: Delivery) => (
                    <div
                      key={d._id}
                      onClick={() => toggleDelivery(d._id)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-slate-50 last:border-0 transition-colors',
                        selectedDeliveryIds.includes(d._id) ? 'bg-orange-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <div className={cn(
                        'w-4 h-4 rounded border-2 flex-shrink-0 transition-all',
                        selectedDeliveryIds.includes(d._id) ? 'bg-orange-500 border-orange-500' : 'border-slate-300',
                      )}>
                        {selectedDeliveryIds.includes(d._id) && (
                          <svg viewBox="0 0 16 16" fill="white" className="w-full h-full p-0.5">
                            <path d="M13 3L6 11l-3-3" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
                          </svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">{d.lieferscheinNr}</span>
                          <span className="font-medium text-sm text-slate-700 truncate">{d.kunde.name}</span>
                        </div>
                        <div className="text-xs text-slate-400">
                          {d.kunde.adresse?.ort} · {formatDate(d.lieferdatum)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {createError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{createError}</div>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="ghost" onClick={() => { setShowCreateModal(false); setCreateError(''); }}>
              Abbrechen
            </Button>
            <Button
              loading={createMutation.isPending}
              disabled={!form.name || !form.datum}
              onClick={() => createMutation.mutate({ ...form, lieferscheinIds: selectedDeliveryIds })}
            >
              Tour erstellen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
