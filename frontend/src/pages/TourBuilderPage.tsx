import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, useDroppable, useDraggable,
  PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft, Save, Truck, UserCheck, Package, X, GripVertical,
  AlertTriangle, ShieldCheck, ShieldOff, Weight, Users, Car,
} from 'lucide-react';
import { vehicleApi, driverApi, deliveriesApi, toursApi } from '../api';
import { Driver, Vehicle, Delivery, Tour } from '../types';
import { LAGER_LABELS, calcNettoGG, calcGesamtgewicht } from '../utils';

// ─── Weight helpers ──────────────────────────────────────────────────────────

/** Netto-GG = Summe von gewicht×menge nur für Artikel-Gruppen 101–109 (Gasfüllungen) */
function getNettoGG(d: Delivery): number {
  return calcNettoGG(d.positionen || []);
}

/** Gesamtgewicht = Summe von gewicht×menge aller Positionen */
function getTotalWeight(d: Delivery): number {
  return calcGesamtgewicht(d.positionen || []);
}

function totalNettoGG(deliveries: Delivery[]): number {
  return deliveries.reduce((s, d) => s + getNettoGG(d), 0);
}

function totalWeight(deliveries: Delivery[]): number {
  return deliveries.reduce((s, d) => s + getTotalWeight(d), 0);
}

// ─── Route calculation helpers ────────────────────────────────────────────────

const AVG_SPEED_KMH = 55;
const STOP_MINUTES = 15;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m === 0 ? `${h} Std.` : `${h} Std. ${m} min`;
}

interface RouteStats {
  stops: number;
  distanceKm: number | null;  // null wenn keine Koordinaten
  driveMinutes: number | null;
  loadMinutes: number;
  totalMinutes: number | null;
}

function calcRouteStats(deliveries: Delivery[]): RouteStats {
  const stops = deliveries.length;
  const loadMinutes = stops * STOP_MINUTES;

  const coords = deliveries
    .map(d => d.kunde?.adresse?.lat != null && d.kunde?.adresse?.lng != null
      ? { lat: d.kunde.adresse.lat!, lng: d.kunde.adresse.lng! }
      : null);

  const hasCoords = coords.some(c => c !== null);
  if (!hasCoords || stops < 2) {
    return { stops, distanceKm: null, driveMinutes: null, loadMinutes, totalMinutes: null };
  }

  let distanceKm = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    if (a && b) distanceKm += haversineKm(a.lat, a.lng, b.lat, b.lng);
  }

  const driveMinutes = (distanceKm / AVG_SPEED_KMH) * 60;
  return { stops, distanceKm, driveMinutes, loadMinutes, totalMinutes: driveMinutes + loadMinutes };
}

function RouteEstimate({ deliveries }: { deliveries: Delivery[] }) {
  if (deliveries.length === 0) return null;
  const stats = calcRouteStats(deliveries);
  const nettoGG = totalNettoGG(deliveries);
  const totalW = totalWeight(deliveries);

  return (
    <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
      <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-2">Strecken-Schätzung</div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span className="text-gray-700"><span className="font-semibold">{stats.stops}</span> Stopp{stats.stops !== 1 ? 's' : ''}</span>
        {stats.distanceKm !== null
          ? <span className="text-gray-700">~<span className="font-semibold">{Math.round(stats.distanceKm)} km</span> Fahrtstrecke</span>
          : <span className="text-gray-400 text-xs italic">Keine Koordinaten (geocodieren für Strecke)</span>
        }
        {stats.driveMinutes !== null && (
          <span className="text-gray-700"><span className="font-semibold">{formatMinutes(stats.driveMinutes)}</span> Fahrzeit</span>
        )}
        <span className="text-gray-700"><span className="font-semibold">{formatMinutes(stats.loadMinutes)}</span> Be-/Entladen</span>
        {stats.totalMinutes !== null && (
          <span className="font-bold text-blue-700">≈ {formatMinutes(stats.totalMinutes)} gesamt</span>
        )}
        {totalW > 0 && <span className="text-gray-500">{totalW.toFixed(0)} kg Gesamtgew.</span>}
        {nettoGG > 0 && <span className="text-gray-500">{nettoGG.toFixed(0)} kg Netto GG</span>}
      </div>
    </div>
  );
}

function nutzlast(v: Vehicle | null): number | null {
  if (!v || !v.zugelasseneGesamtmasse || !v.leergewicht) return null;
  return v.zugelasseneGesamtmasse - v.leergewicht;
}

// ─── Warning Modal ────────────────────────────────────────────────────────────

function WarningModal({ messages, onDismiss }: { messages: string[]; onDismiss: () => void }) {
  if (messages.length === 0) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Hinweis</h3>
            {messages.map((m, i) => (
              <p key={i} className="text-sm text-gray-700 mb-2 last:mb-0">{m}</p>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={onDismiss}
            className="px-6 py-2.5 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Draggable source cards (left panel) ─────────────────────────────────────

function DraggableDriverCard({ driver }: { driver: Driver }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `driver-${driver._id}`,
    data: { type: 'driver', item: driver },
  });
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className="bg-white rounded-xl border border-gray-200 p-3 cursor-grab active:cursor-grabbing select-none"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-indigo-700">{driver.vorname[0]}{driver.nachname[0]}</span>
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-800 truncate">{driver.vorname} {driver.nachname}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {driver.adrSchein
              ? <span className="inline-flex items-center gap-0.5 text-xs text-green-700"><ShieldCheck className="w-3 h-3" /> ADR</span>
              : <span className="inline-flex items-center gap-0.5 text-xs text-gray-400"><ShieldOff className="w-3 h-3" /> Kein ADR</span>
            }
            {driver.standort && <span className="text-xs text-gray-400">· {driver.standort}</span>}
          </div>
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" />
      </div>
    </div>
  );
}

function DraggableVehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const nl = nutzlast(vehicle);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `vehicle-${vehicle._id}`,
    data: { type: 'vehicle', item: vehicle },
  });
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className="bg-white rounded-xl border border-gray-200 p-3 cursor-grab active:cursor-grabbing select-none"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Truck className="w-4 h-4 text-blue-600" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-mono font-bold text-gray-800">{vehicle.nummernschild}</div>
          <div className="text-xs text-gray-500 truncate">
            {[vehicle.hersteller, vehicle.modell].filter(Boolean).join(' ')}
            {nl !== null && <span className="ml-1">· {nl.toLocaleString('de-DE')} kg NL</span>}
          </div>
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0" />
      </div>
    </div>
  );
}

function DraggableDeliveryCard({ delivery }: { delivery: Delivery }) {
  const w = getTotalWeight(delivery);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `delivery-${delivery._id}`,
    data: { type: 'delivery-source', item: delivery },
  });
  return (
    <div
      ref={setNodeRef} {...attributes} {...listeners}
      className="bg-white rounded-xl border border-gray-200 p-3 cursor-grab active:cursor-grabbing select-none"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Package className="w-4 h-4 text-orange-500" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-gray-400">{delivery.lieferscheinNr}</span>
          </div>
          <div className="text-sm font-semibold text-gray-800 truncate">{delivery.kunde?.name}</div>
          <div className="text-xs text-gray-400 truncate">{delivery.kunde?.adresse?.ort}</div>
          {w > 0 && <div className="text-xs text-gray-500 mt-0.5">{w.toFixed(1)} kg</div>}
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" />
      </div>
    </div>
  );
}

// ─── Droppable slots ──────────────────────────────────────────────────────────

function DriverSlot({ driver, onRemove }: { driver: Driver | null; onRemove: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'slot-driver' });
  return (
    <div
      ref={setNodeRef}
      className="rounded-2xl border-2 border-dashed p-4 min-h-[100px] flex items-center transition-colors"
      style={{
        borderColor: isOver ? '#6366f1' : '#e5e7eb',
        background: isOver ? '#eef2ff' : '#f9fafb',
      }}
    >
      {driver ? (
        <div className="flex items-center gap-3 w-full">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
            <span className="text-sm font-bold text-indigo-700">{driver.vorname[0]}{driver.nachname[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-gray-900">{driver.vorname} {driver.nachname}</div>
            <div className="flex items-center gap-2 mt-1">
              {driver.adrSchein
                ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full"><ShieldCheck className="w-3 h-3" /> ADR</span>
                : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full"><ShieldOff className="w-3 h-3" /> Kein ADR</span>
              }
              {driver.standort && <span className="text-xs text-gray-500">{driver.standort}</span>}
            </div>
          </div>
          <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full gap-2 text-gray-400">
          <Users className="w-8 h-8 opacity-40" />
          <span className="text-sm">Fahrer hierher ziehen</span>
        </div>
      )}
    </div>
  );
}

function VehicleSlot({ vehicle, onRemove }: { vehicle: Vehicle | null; onRemove: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'slot-vehicle' });
  const nl = nutzlast(vehicle);
  return (
    <div
      ref={setNodeRef}
      className="rounded-2xl border-2 border-dashed p-4 min-h-[100px] flex items-center transition-colors"
      style={{
        borderColor: isOver ? '#3b82f6' : '#e5e7eb',
        background: isOver ? '#eff6ff' : '#f9fafb',
      }}
    >
      {vehicle ? (
        <div className="flex items-center gap-3 w-full">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Truck className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold font-mono text-gray-900">{vehicle.nummernschild}</div>
            <div className="text-sm text-gray-500">{[vehicle.hersteller, vehicle.modell].filter(Boolean).join(' ')}</div>
            {nl !== null && (
              <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                <Weight className="w-3 h-3" /> Nutzlast: {nl.toLocaleString('de-DE')} kg
              </div>
            )}
          </div>
          <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full gap-2 text-gray-400">
          <Car className="w-8 h-8 opacity-40" />
          <span className="text-sm">Fahrzeug hierher ziehen</span>
        </div>
      )}
    </div>
  );
}

// ─── Sortable delivery in the list ───────────────────────────────────────────

function SortableDeliveryItem({ delivery, onRemove }: { delivery: Delivery; onRemove: () => void }) {
  const w = getTotalWeight(delivery);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sel-${delivery._id}`,
    data: { type: 'delivery-sorted', item: delivery },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-3 group"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 touch-none">
        <GripVertical className="w-4 h-4" />
      </div>
      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
        <Package className="w-4 h-4 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-400">{delivery.lieferscheinNr}</span>
          <span className="font-semibold text-sm text-gray-800 truncate">{delivery.kunde?.name}</span>
        </div>
        <div className="text-xs text-gray-400">{delivery.kunde?.adresse?.ort}{w > 0 && ` · ${w.toFixed(1)} kg`}</div>
      </div>
      <button onClick={onRemove} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Delivery drop zone ───────────────────────────────────────────────────────

function DeliveryDropZone({ deliveries, onRemove }: { deliveries: Delivery[]; onRemove: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'slot-deliveries' });
  const itemIds = deliveries.map(d => `sel-${d._id}`);
  const totalW = totalWeight(deliveries);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-gray-700">Lieferscheine ({deliveries.length})</h3>
        {totalW > 0 && (
          <span className="text-sm text-gray-500 flex items-center gap-1">
            <Weight className="w-3.5 h-3.5" /> Gesamt: {totalW.toFixed(1)} kg
          </span>
        )}
      </div>
      <div
        ref={setNodeRef}
        className="min-h-[120px] rounded-2xl border-2 border-dashed transition-colors p-3 space-y-2"
        style={{
          borderColor: isOver ? '#f97316' : '#e5e7eb',
          background: isOver ? '#fff7ed' : '#f9fafb',
        }}
      >
        {deliveries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2 text-gray-400">
            <Package className="w-8 h-8 opacity-40" />
            <span className="text-sm">Lieferscheine hierher ziehen</span>
          </div>
        ) : (
          <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
            {deliveries.map(d => (
              <SortableDeliveryItem key={d._id} delivery={d} onRemove={() => onRemove(d._id)} />
            ))}
          </SortableContext>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TourBuilderPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [leftTab, setLeftTab] = useState<'fahrer' | 'fahrzeuge' | 'lieferscheine'>('lieferscheine');
  const [deliverySearch, setDeliverySearch] = useState('');

  // Tour form state
  const [tourName, setTourName] = useState('');
  const [datum, setDatum] = useState(new Date().toISOString().slice(0, 10));
  const [lager, setLager] = useState('');
  const [notiz, setNotiz] = useState('');

  // Builder state
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [selectedDeliveries, setSelectedDeliveries] = useState<Delivery[]>([]);

  // DnD overlay
  const [activeDrag, setActiveDrag] = useState<{ type: string; item: any } | null>(null);

  // Warnings
  const [warningMessages, setWarningMessages] = useState<string[]>([]);
  const [saveError, setSaveError] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Data queries ──

  const { data: drivers = [] } = useQuery<Driver[]>({
    queryKey: ['fahrer'],
    queryFn: () => driverApi.list({ aktiv: true }),
  });

  const { data: vehicles = [] } = useQuery<Vehicle[]>({
    queryKey: ['fahrzeuge'],
    queryFn: () => vehicleApi.list({ aktiv: true }),
  });

  const { data: deliveriesResp } = useQuery({
    queryKey: ['deliveries-builder'],
    queryFn: () => deliveriesApi.list({ limit: 300 }),
  });
  const allDeliveries: Delivery[] = deliveriesResp?.deliveries || [];

  // Load existing tour for edit mode
  const { isLoading: tourLoading } = useQuery<Tour>({
    queryKey: ['tour', id],
    queryFn: async () => {
      const tour = await toursApi.get(id!);
      setTourName(tour.name);
      setDatum(tour.datum.slice(0, 10));
      setLager(tour.lager || '');
      setNotiz(tour.notiz || '');
      if (tour.fahrerId && typeof tour.fahrerId === 'object') setSelectedDriver(tour.fahrerId as Driver);
      if (tour.fahrzeugId && typeof tour.fahrzeugId === 'object') setSelectedVehicle(tour.fahrzeugId as Vehicle);
      const dels = (tour.lieferscheine || [])
        .map(item => (typeof item.delivery === 'object' ? item.delivery as Delivery : null))
        .filter(Boolean) as Delivery[];
      setSelectedDeliveries(dels);
      return tour;
    },
    enabled: isEdit,
  });

  // ── Validation ──

  function validate(driver: Driver | null, vehicle: Vehicle | null, deliveries: Delivery[]) {
    const warnings: string[] = [];
    if (deliveries.length === 0) return;

    const nettoGG = totalNettoGG(deliveries);
    const gesamt = totalWeight(deliveries);

    if (driver && !driver.adrSchein && nettoGG > 333) {
      warnings.push(
        `Fahrer ${driver.vorname} ${driver.nachname} hat keinen ADR-Schein und darf maximal 333 kg Netto-Gefahrgutgewicht transportieren. ` +
        `Das aktuelle Netto-GG beträgt ${nettoGG.toFixed(1)} kg.`
      );
    }
    if (vehicle) {
      const nl = nutzlast(vehicle);
      if (nl !== null && gesamt > nl) {
        warnings.push(
          `Die Nutzlast von ${vehicle.nummernschild} beträgt ${nl.toLocaleString('de-DE')} kg. ` +
          `Das Gesamtgewicht der Ladung (${gesamt.toFixed(1)} kg) überschreitet diese Grenze.`
        );
      }
    }
    if (warnings.length > 0) setWarningMessages(warnings);
  }

  // ── DnD handlers ──

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data) setActiveDrag({ type: data.type, item: data.item });
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null);
    const { active, over } = event;
    if (!over) return;

    const activeType = active.data.current?.type as string;
    const overId = String(over.id);

    if (activeType === 'driver' && overId === 'slot-driver') {
      const driver = active.data.current!.item as Driver;
      setSelectedDriver(driver);
      validate(driver, selectedVehicle, selectedDeliveries);
      return;
    }

    if (activeType === 'vehicle' && overId === 'slot-vehicle') {
      const vehicle = active.data.current!.item as Vehicle;
      setSelectedVehicle(vehicle);
      validate(selectedDriver, vehicle, selectedDeliveries);
      return;
    }

    if (activeType === 'delivery-source') {
      const delivery = active.data.current!.item as Delivery;
      if (overId === 'slot-deliveries' || overId.startsWith('sel-')) {
        if (!selectedDeliveries.find(d => d._id === delivery._id)) {
          const next = [...selectedDeliveries, delivery];
          setSelectedDeliveries(next);
          validate(selectedDriver, selectedVehicle, next);
        }
      }
      return;
    }

    if (activeType === 'delivery-sorted' && overId.startsWith('sel-')) {
      const oldIdx = selectedDeliveries.findIndex(d => `sel-${d._id}` === String(active.id));
      const newIdx = selectedDeliveries.findIndex(d => `sel-${d._id}` === overId);
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        setSelectedDeliveries(prev => arrayMove(prev, oldIdx, newIdx));
      }
    }
  }

  // ── Save ──

  const createMut = useMutation({
    mutationFn: (data: any) => toursApi.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tours'] }); navigate('/touren'); },
    onError: (e: any) => setSaveError(e.response?.data?.message || 'Fehler beim Speichern'),
  });

  const updateMut = useMutation({
    mutationFn: async (data: any) => {
      await toursApi.update(id!, data);
      await toursApi.updateDeliveries(id!, selectedDeliveries.map(d => d._id));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tours'] }); navigate('/touren'); },
    onError: (e: any) => setSaveError(e.response?.data?.message || 'Fehler beim Speichern'),
  });

  function handleSave() {
    if (!tourName.trim()) { setSaveError('Name ist erforderlich'); return; }
    if (!datum) { setSaveError('Datum ist erforderlich'); return; }
    setSaveError('');
    const payload = {
      name: tourName.trim(),
      datum,
      lager: lager || null,
      notiz,
      fahrer: selectedDriver ? `${selectedDriver.vorname} ${selectedDriver.nachname}` : '',
      fahrzeug: selectedVehicle ? selectedVehicle.nummernschild : '',
      fahrerId: selectedDriver?._id || null,
      fahrzeugId: selectedVehicle?._id || null,
      lieferscheinIds: selectedDeliveries.map(d => d._id),
    };
    isEdit ? updateMut.mutate(payload) : createMut.mutate(payload);
  }

  // ── Left panel content ──

  const availableDrivers = useMemo(() =>
    drivers.filter(d => d._id !== selectedDriver?._id), [drivers, selectedDriver]);

  const availableVehicles = useMemo(() =>
    vehicles.filter(v => v._id !== selectedVehicle?._id), [vehicles, selectedVehicle]);

  const availableDeliveries = useMemo(() => {
    const selectedIds = new Set(selectedDeliveries.map(d => d._id));
    return allDeliveries.filter(d => {
      if (selectedIds.has(d._id)) return false;
      if (['abgeschlossen', 'storniert'].includes(d.status)) return false;
      if (!deliverySearch) return true;
      const q = deliverySearch.toLowerCase();
      return d.lieferscheinNr?.toLowerCase().includes(q) || d.kunde?.name?.toLowerCase().includes(q) || d.kunde?.adresse?.ort?.toLowerCase().includes(q);
    });
  }, [allDeliveries, selectedDeliveries, deliverySearch]);

  const isSaving = createMut.isPending || updateMut.isPending;

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

  if (isEdit && tourLoading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">Tour wird geladen...</div>;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/touren')} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{isEdit ? 'Tour bearbeiten' : 'Neue Tour'}</h1>
              {tourName && <p className="text-sm text-gray-500">{tourName}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveError && <span className="text-red-600 text-sm">{saveError}</span>}
            <button onClick={() => navigate('/touren')} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200">
              Abbrechen
            </button>
            <button onClick={handleSave} disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50">
              <Save className="w-4 h-4" />
              {isSaving ? 'Speichern...' : 'Speichern'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Left panel ── */}
          <div className="w-72 flex-shrink-0 border-r bg-white flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b">
              {(['lieferscheine', 'fahrer', 'fahrzeuge'] as const).map(tab => (
                <button key={tab} onClick={() => setLeftTab(tab)}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wide transition-colors ${leftTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                  {tab === 'lieferscheine' ? 'Aufträge' : tab === 'fahrer' ? 'Fahrer' : 'Fahrzeuge'}
                </button>
              ))}
            </div>

            {/* Search (only for deliveries) */}
            {leftTab === 'lieferscheine' && (
              <div className="px-3 pt-3 pb-1">
                <input
                  value={deliverySearch}
                  onChange={e => setDeliverySearch(e.target.value)}
                  placeholder="Suchen..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            )}

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {leftTab === 'fahrer' && (
                availableDrivers.length === 0
                  ? <p className="text-center text-gray-400 text-sm py-8">Keine Fahrer verfügbar</p>
                  : availableDrivers.map(d => <DraggableDriverCard key={d._id} driver={d} />)
              )}
              {leftTab === 'fahrzeuge' && (
                availableVehicles.length === 0
                  ? <p className="text-center text-gray-400 text-sm py-8">Keine Fahrzeuge verfügbar</p>
                  : availableVehicles.map(v => <DraggableVehicleCard key={v._id} vehicle={v} />)
              )}
              {leftTab === 'lieferscheine' && (
                availableDeliveries.length === 0
                  ? <p className="text-center text-gray-400 text-sm py-8">Keine Aufträge gefunden</p>
                  : availableDeliveries.map(d => <DraggableDeliveryCard key={d._id} delivery={d} />)
              )}
            </div>
          </div>

          {/* ── Right panel ── */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Tour meta */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-bold text-gray-700 mb-4">Tour-Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
                  <input className={inputCls} value={tourName} onChange={e => setTourName(e.target.value)} placeholder="z.B. Tour Trier 17.07." />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Datum *</label>
                  <input className={inputCls} type="date" value={datum} onChange={e => setDatum(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Lager</label>
                  <select className={inputCls} value={lager} onChange={e => setLager(e.target.value)}>
                    <option value="">Kein Lager</option>
                    {['frei', 'bengel', 'trier'].map(l => <option key={l} value={l}>{LAGER_LABELS[l] || l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Notiz</label>
                  <input className={inputCls} value={notiz} onChange={e => setNotiz(e.target.value)} placeholder="Optional..." />
                </div>
              </div>
            </div>

            {/* Driver + Vehicle slots */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h2 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-indigo-500" /> Fahrer
                </h2>
                <DriverSlot driver={selectedDriver} onRemove={() => setSelectedDriver(null)} />
              </div>
              <div>
                <h2 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-500" /> Fahrzeug
                </h2>
                <VehicleSlot vehicle={selectedVehicle} onRemove={() => setSelectedVehicle(null)} />
              </div>
            </div>

            {/* Deliveries */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <DeliveryDropZone
                deliveries={selectedDeliveries}
                onRemove={id => setSelectedDeliveries(prev => prev.filter(d => d._id !== id))}
              />
              <RouteEstimate deliveries={selectedDeliveries} />
            </div>
          </div>
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDrag?.type === 'driver' && (
          <div className="bg-white rounded-xl border-2 border-indigo-300 p-3 shadow-xl w-64 opacity-95">
            <div className="text-sm font-semibold text-gray-800">{activeDrag.item.vorname} {activeDrag.item.nachname}</div>
          </div>
        )}
        {activeDrag?.type === 'vehicle' && (
          <div className="bg-white rounded-xl border-2 border-blue-300 p-3 shadow-xl w-64 opacity-95">
            <div className="font-mono font-bold text-gray-800">{activeDrag.item.nummernschild}</div>
          </div>
        )}
        {(activeDrag?.type === 'delivery-source' || activeDrag?.type === 'delivery-sorted') && (
          <div className="bg-white rounded-xl border-2 border-orange-300 p-3 shadow-xl w-64 opacity-95">
            <div className="text-xs text-gray-400 font-mono">{activeDrag.item.lieferscheinNr}</div>
            <div className="text-sm font-semibold text-gray-800">{activeDrag.item.kunde?.name}</div>
          </div>
        )}
      </DragOverlay>

      {/* Warning modal */}
      <WarningModal messages={warningMessages} onDismiss={() => setWarningMessages([])} />
    </DndContext>
  );
}
