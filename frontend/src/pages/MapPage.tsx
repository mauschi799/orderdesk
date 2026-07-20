import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPin, RefreshCw, Filter, Navigation, Route, X, Plus, ChevronDown } from 'lucide-react';
import api from '../api';
import { PageHeader, StatusBadge, Modal, Button } from '../components/ui';
import { formatDate, calcGesamtgewicht, formatWeight, STATUS_LABELS, cn } from '../utils';
import { Delivery } from '../types';
import { useNavigate } from 'react-router-dom';

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

const STATUS_MAP_COLORS: Record<string, string> = {
  neu: '#64748b',
  nicht_zugewiesen: '#ef4444',
  zugewiesen: '#3b82f6',
  gedruckt: '#8b5cf6',
  in_auslieferung: '#f59e0b',
  abgeschlossen: '#22c55e',
  storniert: '#9ca3af',
};

interface QuickTourForm {
  name: string;
  datum: string;
  fahrer: string;
  fahrzeug: string;
}

export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);
  const markerMapRef = useRef<Map<string, any>>(new Map());
  const planModeRef = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [lagerFilter, setLagerFilter] = useState('');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [leafletReady, setLeafletReady] = useState(false);

  // Plan mode state
  const [planMode, setPlanMode] = useState(false);
  const [selectedForTour, setSelectedForTour] = useState<string[]>([]);
  const [showTourDropdown, setShowTourDropdown] = useState(false);
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [quickForm, setQuickForm] = useState<QuickTourForm>({
    name: '',
    datum: new Date().toISOString().split('T')[0],
    fahrer: '',
    fahrzeug: '',
  });

  const { data: deliveries = [], isLoading, refetch } = useQuery<Delivery[]>({
    queryKey: ['map-deliveries', statusFilter, lagerFilter],
    queryFn: () => api.get('/geocode/deliveries', {
      params: { status: statusFilter || undefined, lager: lagerFilter || undefined },
    }).then(r => r.data),
  });

  // Existing plannable tours
  const { data: toursData } = useQuery({
    queryKey: ['tours-plannable'],
    queryFn: () => api.get('/tours', { params: { status: 'geplant' } }).then(r => r.data),
    enabled: planMode,
  });
  const plannableTours: any[] = toursData?.tours || [];

  const geocodeMutation = useMutation({
    mutationFn: (deliveryId: string) =>
      api.post(`/geocode/delivery/${deliveryId}`).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['map-deliveries'] }),
  });

  const addToTourMutation = useMutation({
    mutationFn: async ({ tourId, deliveryIds }: { tourId: string; deliveryIds: string[] }) => {
      const tourRes = await api.get(`/tours/${tourId}`).then(r => r.data);
      const existingIds: string[] = (tourRes.lieferscheine || []).map((item: any) =>
        typeof item.delivery === 'object' ? item.delivery._id : item.delivery,
      );
      const merged = [...new Set([...existingIds, ...deliveryIds])];
      return api.patch(`/tours/${tourId}/deliveries`, { lieferscheinIds: merged }).then(r => r.data);
    },
    onSuccess: () => {
      setSelectedForTour([]);
      setPlanMode(false);
      setShowTourDropdown(false);
      queryClient.invalidateQueries({ queryKey: ['tours-plannable'] });
    },
  });

  const createTourMutation = useMutation({
    mutationFn: (data: any) => api.post('/tours', data).then(r => r.data),
    onSuccess: () => {
      setSelectedForTour([]);
      setPlanMode(false);
      setShowQuickCreateModal(false);
      queryClient.invalidateQueries({ queryKey: ['tours-plannable'] });
    },
  });

  // Keep planModeRef in sync
  useEffect(() => { planModeRef.current = planMode; }, [planMode]);

  // ── Initialize Leaflet ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }

    let cancelled = false;
    const init = async () => {
      if (!mapContainerRef.current || mapRef.current) return;
      const L = (await import('leaflet')).default;
      if (cancelled) return;
      leafletRef.current = L;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      const map = L.map(mapContainerRef.current, { center: [49.75, 6.64], zoom: 9 });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      markersRef.current = L.layerGroup().addTo(map);
      setLeafletReady(true);
    };
    init();
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, []);

  // ── Build markers ────────────────────────────────────────────────────────────
  const updateMarkers = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!L || !map || !layer) return;

    layer.clearLayers();
    markerMapRef.current.clear();

    const withCoords = (deliveries as Delivery[]).filter(
      d => d.kunde?.adresse?.lat != null && d.kunde?.adresse?.lng != null,
    );
    if (withCoords.length === 0) return;

    const bounds: [number, number][] = [];

    withCoords.forEach(delivery => {
      const lat = delivery.kunde.adresse!.lat!;
      const lng = delivery.kunde.adresse!.lng!;
      bounds.push([lat, lng]);

      const color = STATUS_MAP_COLORS[delivery.status] || '#64748b';
      const gkg = calcGesamtgewicht(delivery.positionen);

      const marker = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9,
      });

      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:190px;padding:2px;">
          <div style="font-weight:700;font-size:13px;color:#1e293b;margin-bottom:4px;">${delivery.kunde.name}</div>
          <div style="font-family:monospace;font-size:11px;color:#64748b;margin-bottom:6px;">${delivery.lieferscheinNr}</div>
          <div style="font-size:11px;color:#475569;margin-bottom:2px;">📅 ${formatDate(delivery.lieferdatum)}</div>
          ${delivery.kunde.adresse?.strasse ? `<div style="font-size:11px;color:#475569;margin-bottom:6px;">📍 ${delivery.kunde.adresse.strasse}, ${delivery.kunde.adresse.plz} ${delivery.kunde.adresse.ort}</div>` : ''}
          <div style="font-size:11px;color:#475569;margin-bottom:8px;">📦 ${delivery.positionen.length} Pos · ⚖ ${formatWeight(gkg)}</div>
          <div style="margin-bottom:8px;">
            <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:500;background:${color}20;color:${color};border:1px solid ${color}50;">
              ● ${STATUS_LABELS[delivery.status] || delivery.status}
            </span>
          </div>
          <a href="/lieferscheine/${delivery._id}"
            onclick="event.preventDefault();window.__gasDispoNavigate('${delivery._id}');"
            style="display:block;text-align:center;padding:5px 12px;background:#f48a1a;color:white;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none;">
            Öffnen →
          </a>
        </div>
      `, { maxWidth: 240 });

      marker.on('click', () => {
        if (planModeRef.current) {
          setSelectedForTour(prev =>
            prev.includes(delivery._id)
              ? prev.filter(id => id !== delivery._id)
              : [...prev, delivery._id],
          );
        } else {
          marker.openPopup();
          setSelectedDelivery(delivery);
        }
      });

      layer.addLayer(marker);
      markerMapRef.current.set(delivery._id, marker);
    });

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }, [deliveries]);

  useEffect(() => { if (leafletReady) updateMarkers(); }, [leafletReady, updateMarkers]);

  // ── Update marker styles on selection / plan mode change ─────────────────────
  useEffect(() => {
    if (!leafletRef.current) return;
    markerMapRef.current.forEach((marker, deliveryId) => {
      const delivery = (deliveries as Delivery[]).find(d => d._id === deliveryId);
      const color = delivery ? (STATUS_MAP_COLORS[delivery.status] || '#64748b') : '#64748b';
      const isSelected = selectedForTour.includes(deliveryId);

      if (isSelected) {
        marker.setStyle({ radius: 13, fillColor: color, color: '#f48a1a', weight: 3.5, fillOpacity: 1 });
      } else if (planMode) {
        marker.setStyle({ radius: 10, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.45 });
      } else {
        marker.setStyle({ radius: 10, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 });
      }
    });
  }, [selectedForTour, planMode, deliveries]);

  // ── Close popups when entering plan mode ─────────────────────────────────────
  useEffect(() => {
    if (planMode) {
      mapRef.current?.closePopup();
      setSelectedDelivery(null);
    } else {
      setSelectedForTour([]);
    }
  }, [planMode]);

  // ── Auto-geocode missing coords ───────────────────────────────────────────────
  useEffect(() => {
    const missing = (deliveries as Delivery[]).filter(
      d => d.kunde?.adresse && (d.kunde.adresse.lat == null || d.kunde.adresse.lng == null),
    );
    if (missing.length === 0) return;
    const run = async () => {
      for (const delivery of missing) {
        try { await geocodeMutation.mutateAsync(delivery._id); } catch { /* continue */ }
      }
      refetch();
    };
    run();
  }, [deliveries]);

  useEffect(() => {
    (window as any).__gasDispoNavigate = (id: string) => navigate(`/lieferscheine/${id}`);
    return () => { delete (window as any).__gasDispoNavigate; };
  }, [navigate]);

  const withCoords = (deliveries as Delivery[]).filter(d => d.kunde?.adresse?.lat != null);
  const withoutCoords = (deliveries as Delivery[]).filter(d => d.kunde?.adresse?.lat == null);
  const selectedDeliveryObjects = (deliveries as Delivery[]).filter(d => selectedForTour.includes(d._id));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Kartenansicht"
        subtitle={`${withCoords.length} von ${deliveries.length} Adressen geocodiert`}
        actions={
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
            >
              <option value="">Alle Status</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <select
              value={lagerFilter}
              onChange={e => setLagerFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none"
            >
              <option value="">Alle Lager</option>
              <option value="trier">Trier</option>
              <option value="bengel">Bengel</option>
              <option value="frei">Frei</option>
            </select>
            <button onClick={() => refetch()} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500">
              <RefreshCw className="w-4 h-4" />
            </button>
            {/* Plan mode toggle */}
            <button
              onClick={() => setPlanMode(m => !m)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                planMode
                  ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
              )}
            >
              <Route className="w-4 h-4" />
              {planMode ? 'Planung beenden' : 'Route planen'}
            </button>
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative">
          <div ref={mapContainerRef} className="w-full h-full" style={{ minHeight: 400 }} />

          {/* Plan mode banner */}
          {planMode && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-orange-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none select-none">
              Stopps anklicken zum Auswählen
            </div>
          )}

          {/* Floating selection action bar */}
          {planMode && selectedForTour.length > 0 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-2xl shadow-2xl border border-slate-200 px-4 py-3 flex items-center gap-3 min-w-[420px]">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 flex-shrink-0">
                <span className="w-6 h-6 rounded-full bg-orange-500 text-white text-xs flex items-center justify-center font-bold">
                  {selectedForTour.length}
                </span>
                Stopp{selectedForTour.length !== 1 ? 's' : ''} ausgewählt
              </div>

              <div className="flex-1 border-l border-slate-200 pl-3 flex items-center gap-2">
                {/* Add to existing tour */}
                {plannableTours.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowTourDropdown(s => !s)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg font-medium transition-colors"
                    >
                      Zu Tour hinzufügen
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showTourDropdown && (
                      <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden min-w-[200px] z-10">
                        {plannableTours.map((tour: any) => (
                          <button
                            key={tour._id}
                            onClick={() => {
                              addToTourMutation.mutate({ tourId: tour._id, deliveryIds: selectedForTour });
                              setShowTourDropdown(false);
                            }}
                            disabled={addToTourMutation.isPending}
                            className="w-full text-left px-4 py-2.5 hover:bg-orange-50 transition-colors"
                          >
                            <div className="text-sm font-medium text-slate-800">{tour.name}</div>
                            <div className="text-xs text-slate-400">
                              {tour.lieferscheine?.length || 0} Stopps · {new Date(tour.datum).toLocaleDateString('de-DE')}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Create new tour */}
                <button
                  onClick={() => {
                    setShowTourDropdown(false);
                    setShowQuickCreateModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-sm rounded-lg font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Neue Tour
                </button>
              </div>

              <button
                onClick={() => setSelectedForTour([])}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 flex-shrink-0"
                title="Auswahl aufheben"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Legend */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-white rounded-xl shadow-lg border border-slate-200 p-3">
            <div className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-wider">Status</div>
            <div className="space-y-1.5">
              {Object.entries(STATUS_MAP_COLORS).map(([status, color]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full border-2 border-white shadow-sm" style={{ background: color }} />
                  <span className="text-[10px] text-slate-600">{STATUS_LABELS[status] || status}</span>
                </div>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-[999]">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="w-72 border-l border-slate-200 bg-white flex flex-col overflow-hidden">

          {/* Plan mode: show selected deliveries */}
          {planMode ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100">
                <div className="text-xs font-semibold text-orange-700 mb-0.5">Routen-Planungs-Modus</div>
                <div className="text-xs text-orange-600">
                  {selectedForTour.length === 0
                    ? 'Stopps auf der Karte anklicken'
                    : `${selectedForTour.length} Stopp${selectedForTour.length !== 1 ? 's' : ''} ausgewählt`}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
                {selectedDeliveryObjects.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs">
                    Noch keine Stopps ausgewählt
                  </div>
                ) : (
                  selectedDeliveryObjects.map((d, i) => (
                    <div key={d._id} className="flex items-center gap-2 px-4 py-2.5">
                      <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-slate-700 truncate">{d.kunde.name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {d.kunde.adresse?.strasse}, {d.kunde.adresse?.ort}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedForTour(prev => prev.filter(id => id !== d._id))}
                        className="p-1 text-slate-300 hover:text-red-400 rounded flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Normal mode: delivery detail */}
              {selectedDelivery && (
                <div className="p-4 border-b border-slate-100 bg-orange-50 animate-fade-in">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-mono text-xs text-orange-600">{selectedDelivery.lieferscheinNr}</div>
                      <div className="font-semibold text-slate-800 text-sm">{selectedDelivery.kunde.name}</div>
                    </div>
                    <button onClick={() => setSelectedDelivery(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
                  </div>
                  <StatusBadge status={selectedDelivery.status} />
                  <div className="mt-2 text-xs text-slate-500">
                    {selectedDelivery.kunde.adresse?.strasse && <div>{selectedDelivery.kunde.adresse.strasse}</div>}
                    <div>{selectedDelivery.kunde.adresse?.plz} {selectedDelivery.kunde.adresse?.ort}</div>
                  </div>
                  <button
                    onClick={() => navigate(`/lieferscheine/${selectedDelivery._id}`)}
                    className="mt-2 w-full text-xs bg-orange-500 text-white py-1.5 rounded-lg font-medium hover:bg-orange-600 transition-colors"
                  >
                    Lieferschein öffnen →
                  </button>
                </div>
              )}

              {/* Without coords */}
              {withoutCoords.length > 0 ? (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 sticky top-0">
                    <div className="text-xs font-semibold text-amber-700">{withoutCoords.length} nicht geocodiert</div>
                    <div className="text-xs text-amber-600">Klicken zum Geocodieren</div>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {withoutCoords.map(d => (
                      <div key={d._id} className="flex items-start gap-2 px-4 py-3 hover:bg-slate-50">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-slate-400">{d.lieferscheinNr}</div>
                          <div className="text-sm font-medium text-slate-700 truncate">{d.kunde.name}</div>
                          <div className="text-xs text-slate-400 truncate">
                            {[d.kunde.adresse?.strasse, d.kunde.adresse?.plz, d.kunde.adresse?.ort].filter(Boolean).join(', ')}
                          </div>
                        </div>
                        <button
                          onClick={() => geocodeMutation.mutate(d._id)}
                          disabled={geocodeMutation.isPending}
                          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-colors mt-1"
                          title="Adresse geocodieren"
                        >
                          {geocodeMutation.isPending && geocodeMutation.variables === d._id ? (
                            <div className="w-4 h-4 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Navigation className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <MapPin className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">Alle Adressen geocodiert</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick-create tour modal */}
      <Modal
        isOpen={showQuickCreateModal}
        onClose={() => setShowQuickCreateModal(false)}
        title="Neue Tour aus Auswahl"
      >
        <div className="p-6 space-y-4">
          {/* Selected stops summary */}
          <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
            <div className="text-xs font-semibold text-orange-700 mb-2">
              {selectedForTour.length} ausgewählte Stopps
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {selectedDeliveryObjects.map((d, i) => (
                <div key={d._id} className="flex items-center gap-2 text-xs text-orange-800">
                  <span className="font-bold">{i + 1}.</span>
                  <span className="font-medium">{d.kunde.name}</span>
                  <span className="text-orange-500">·</span>
                  <span className="text-orange-600">{d.kunde.adresse?.ort}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Tour-Name *</label>
              <input
                value={quickForm.name}
                onChange={e => setQuickForm(f => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Tour Eifel 20.05."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Datum *</label>
              <input
                type="date"
                value={quickForm.datum}
                onChange={e => setQuickForm(f => ({ ...f, datum: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Fahrer</label>
              <input
                value={quickForm.fahrer}
                onChange={e => setQuickForm(f => ({ ...f, fahrer: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Fahrzeug</label>
              <input
                value={quickForm.fahrzeug}
                onChange={e => setQuickForm(f => ({ ...f, fahrzeug: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="ghost" onClick={() => setShowQuickCreateModal(false)}>Abbrechen</Button>
            <Button
              loading={createTourMutation.isPending}
              disabled={!quickForm.name || !quickForm.datum}
              onClick={() => createTourMutation.mutate({
                name: quickForm.name,
                datum: quickForm.datum,
                fahrer: quickForm.fahrer,
                fahrzeug: quickForm.fahrzeug,
                lieferscheinIds: selectedForTour,
              })}
            >
              Tour erstellen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
