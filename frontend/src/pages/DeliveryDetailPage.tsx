import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Printer, Package, Truck, CheckCircle,
  Edit, MapPin, Phone, Calendar, Hash, Weight, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { deliveriesApi, selectlineApi } from '../api';
import { Delivery } from '../types';
import {
  PageHeader, Card, StatusBadge, LagerBadge, Button, Modal
} from '../components/ui';
import {
  formatDate, formatDateTime, formatWeight, calcGesamtgewicht, calcNettoGG,
  STATUS_LABELS, LAGER_LABELS, cn
} from '../utils';
import { useAuthStore } from '../store/authStore';

const STATUS_TRANSITIONS: Record<string, string[]> = {
  neu: ['nicht_zugewiesen', 'zugewiesen'],
  nicht_zugewiesen: ['zugewiesen', 'storniert'],
  zugewiesen: ['gedruckt', 'nicht_zugewiesen'],
  gedruckt: ['in_auslieferung', 'zugewiesen'],
  in_auslieferung: ['abgeschlossen'],
  abgeschlossen: [],
  storniert: [],
};

const LAGER_OPTIONS = ['frei', 'bengel', 'trier'];

export default function DeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasRole } = useAuthStore();
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showLagerModal, setShowLagerModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedLager, setSelectedLager] = useState('');
  const [notiz, setNotiz] = useState('');
  const [printError, setPrintError] = useState('');

  type SortKey = 'artikelnummer' | 'beschreibung' | 'menge';
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data: delivery, isLoading } = useQuery<Delivery>({
    queryKey: ['delivery', id],
    queryFn: () => deliveriesApi.get(id!),
    enabled: !!id
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, notiz }: any) =>
      deliveriesApi.changeStatus(id!, status, notiz),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setShowStatusModal(false);
    }
  });

  const lagerMutation = useMutation({
    mutationFn: (lager: string | null) => deliveriesApi.changeLager(id!, lager),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
      setShowLagerModal(false);
    }
  });

  // SelectLine-Importe drucken den Original-PDF-Ausdruck aus SelectLine;
  // manuell angelegte Lieferscheine haben kein SelectLine-Dokument und
  // fallen auf den einfachen Browser-Ausdruck der Seite zurück.
  const printMutation = useMutation({
    mutationFn: async () => {
      const documentKey = delivery?.selectlineId || delivery?.lieferscheinNr;
      if (delivery?.importQuelle === 'selectline' && documentKey) {
        const blob = await selectlineApi.printPdf(documentKey);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        await deliveriesApi.markPrinted(id!);
        window.print();
      }
    },
    onSuccess: () => {
      setPrintError('');
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
      queryClient.invalidateQueries({ queryKey: ['kanban'] });
    },
    onError: (err: any) => {
      setPrintError(err.response?.data?.message || 'Drucken fehlgeschlagen');
    }
  });

  // All hooks must be before early returns (Rules of Hooks)
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortedPositionen = useMemo(() => {
    const positionen = delivery?.positionen ?? [];
    if (!sortKey) return positionen;
    return [...positionen].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      const cmp = typeof av === 'number' ? (av as number) - (bv as number)
                : String(av ?? '').localeCompare(String(bv ?? ''), 'de');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [delivery?.positionen, sortKey, sortDir]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  if (!delivery) return <div className="p-6 text-slate-500">Lieferschein nicht gefunden.</div>;

  const gesamtgewicht = calcGesamtgewicht(delivery.positionen);
  const nettoGG       = calcNettoGG(delivery.positionen);
  const gesamtMenge   = delivery.positionen.reduce((s, p) => s + p.menge, 0);
  const nextStatuses = STATUS_TRANSITIONS[delivery.status] || [];
  const canEditStatus = hasRole('administrator', 'disponent', 'lagerist') && nextStatuses.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-10 no-print">
        <button
          onClick={() => navigate(-1)}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-slate-900 font-mono">{delivery.lieferscheinNr}</h1>
            <StatusBadge status={delivery.status} />
            <LagerBadge lager={delivery.lager} />
            {delivery.importQuelle === 'selectline' && (
              <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-md font-medium">
                SelectLine Import
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-0.5">{delivery.kunde.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasRole('administrator', 'disponent') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedLager(delivery.lager || ''); setShowLagerModal(true); }}
            >
              <Package className="w-3.5 h-3.5" />
              Lager
            </Button>
          )}
          {canEditStatus && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setSelectedStatus(''); setNotiz(''); setShowStatusModal(true); }}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Status ändern
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => printMutation.mutate()}
            loading={printMutation.isPending}
          >
            <Printer className="w-3.5 h-3.5" />
            Drucken
          </Button>
        </div>
      </div>
      {printError && (
        <div className="mx-6 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 no-print">
          {printError}
        </div>
      )}

      {/* Content */}
      <div className="p-6 grid grid-cols-3 gap-4 max-w-6xl">
        {/* Left column - 2/3 */}
        <div className="col-span-2 space-y-4">
          {/* Positions */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Hash className="w-4 h-4 text-orange-500" />
              Positionen
            </h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {([
                    { label: 'Art.-Nr.',     key: 'artikelnummer' as SortKey },
                    { label: 'Beschreibung', key: 'beschreibung'  as SortKey },
                    { label: 'Menge',        key: 'menge'         as SortKey },
                  ] as const).map(({ label, key }) => (
                    <th key={key} className="text-left py-2 pr-3">
                      <button
                        onClick={() => toggleSort(key)}
                        className="flex items-center gap-1 text-xs font-semibold text-slate-400 uppercase hover:text-slate-600 transition-colors"
                      >
                        {label}
                        {sortKey === key
                          ? sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          : <ArrowUpDown className="w-3 h-3 opacity-40" />
                        }
                      </button>
                    </th>
                  ))}
                  {['Gewicht/Stk', 'Gesamt', 'Netto GG'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase py-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedPositionen.map((pos, i) => {
                  const isGas = pos.artikelGruppeNr && parseInt(pos.artikelGruppeNr) >= 101 && parseInt(pos.artikelGruppeNr) <= 109;
                  return (
                    <tr key={i}>
                      <td className="py-2.5 pr-3 text-xs font-mono text-slate-500">{pos.artikelnummer}</td>
                      <td className="py-2.5 pr-3 text-sm text-slate-800 font-medium">{pos.beschreibung}</td>
                      <td className="py-2.5 pr-3 text-sm font-bold text-slate-900">{pos.menge} {pos.einheit}</td>
                      <td className="py-2.5 pr-3 text-sm text-slate-500">{formatWeight(pos.gewicht)}</td>
                      <td className="py-2.5 pr-3 text-sm font-semibold text-slate-700">
                        {formatWeight(pos.gewicht * pos.menge)}
                      </td>
                      <td className="py-2.5 text-sm font-semibold">
                        {isGas
                          ? <span className="text-emerald-600">{formatWeight(pos.gewicht * Math.abs(pos.menge))}</span>
                          : <span className="text-slate-300">—</span>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={2} className="pt-3 text-sm font-bold text-slate-700">Gesamt</td>
                  <td className="pt-3 text-sm font-bold text-slate-900">{gesamtMenge} Stk</td>
                  <td />
                  <td className="pt-3 text-sm font-bold text-orange-600">{formatWeight(gesamtgewicht)}</td>
                  <td className="pt-3 text-sm font-bold text-emerald-600">{formatWeight(nettoGG)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {/* Notes */}
          {delivery.notiz && (
            <Card className="p-5">
              <h2 className="font-semibold text-slate-800 mb-2">Notiz</h2>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{delivery.notiz}</p>
            </Card>
          )}

          {/* Auslieferung */}
          {delivery.auslieferung?.fahrer && (
            <Card className="p-5">
              <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-orange-500" />
                Auslieferung
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-500">Fahrer:</span> <span className="font-medium">{delivery.auslieferung.fahrer}</span></div>
                <div><span className="text-slate-500">Fahrzeug:</span> <span className="font-medium">{delivery.auslieferung.fahrzeug}</span></div>
                {delivery.auslieferung.gestartetAm && (
                  <div><span className="text-slate-500">Gestartet:</span> <span className="font-medium">{formatDateTime(delivery.auslieferung.gestartetAm)}</span></div>
                )}
                {delivery.auslieferung.abgeschlossenAm && (
                  <div><span className="text-slate-500">Abgeschlossen:</span> <span className="font-medium">{formatDateTime(delivery.auslieferung.abgeschlossenAm)}</span></div>
                )}
              </div>
            </Card>
          )}
        </div>

        {/* Right column - 1/3 */}
        <div className="space-y-4">
          {/* Customer */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-orange-500" />
              Kundendaten
            </h2>
            <div className="space-y-2 text-sm">
              {delivery.kunde.kundennummer && (
                <div className="text-xs font-mono text-slate-400">#{delivery.kunde.kundennummer}</div>
              )}
              <div className="font-semibold text-slate-800">{delivery.kunde.name}</div>
              {delivery.kunde.name2 && <div className="text-slate-600">{delivery.kunde.name2}</div>}
              {delivery.kunde.adresse && (
                <div className="text-slate-600">
                  <div>{delivery.kunde.adresse.strasse}</div>
                  <div>{delivery.kunde.adresse.plz} {delivery.kunde.adresse.ort}</div>
                </div>
              )}
              {delivery.kunde.telefon && (
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Phone className="w-3.5 h-3.5" />
                  {delivery.kunde.telefon}
                </div>
              )}
            </div>
          </Card>

          {/* Delivery Info */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-orange-500" />
              Lieferinformationen
            </h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Lieferdatum</span>
                <span className="font-medium">{formatDate(delivery.lieferdatum)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Erstellt</span>
                <span className="font-medium">{formatDate(delivery.erstelltAm || delivery.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Quelle</span>
                <span className="font-medium capitalize">{delivery.importQuelle}</span>
              </div>
              {delivery.auftragNr && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Auftrag-Nr.</span>
                  <span className="font-mono text-xs">{delivery.auftragNr}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gesamtgewicht</span>
                  <span className="font-bold text-orange-600">{formatWeight(gesamtgewicht)}</span>
                </div>
                {nettoGG > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Netto GG</span>
                    <span className="font-bold text-emerald-600">{formatWeight(nettoGG)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Positionen</span>
                  <span className="font-medium">{delivery.positionen.length} · {gesamtMenge} Stk</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Print Status */}
          <Card className="p-5">
            <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
              <Printer className="w-4 h-4 text-orange-500" />
              Druckstatus
            </h2>
            {delivery.druckStatus?.gedruckt ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Gedruckt ({delivery.druckStatus.druckAnzahl}×)
                </div>
                {delivery.druckStatus.gedrucktAm && (
                  <div className="text-slate-500">{formatDateTime(delivery.druckStatus.gedrucktAm)}</div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Noch nicht gedruckt</p>
            )}
          </Card>
        </div>
      </div>

      {/* Status Change Modal */}
      <Modal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} title="Status ändern">
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Neuer Status</label>
            <div className="space-y-2">
              {nextStatuses.map(s => (
                <button
                  key={s}
                  onClick={() => setSelectedStatus(s)}
                  className={cn(
                    'w-full text-left px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
                    selectedStatus === s
                      ? 'border-orange-400 bg-orange-50 text-orange-700'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notiz (optional)</label>
            <textarea
              value={notiz}
              onChange={e => setNotiz(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Bemerkung zur Statusänderung..."
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowStatusModal(false)}>Abbrechen</Button>
            <Button
              disabled={!selectedStatus}
              loading={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ status: selectedStatus, notiz })}
            >
              Status setzen
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lager Modal */}
      <Modal isOpen={showLagerModal} onClose={() => setShowLagerModal(false)} title="Lager zuweisen">
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[null, ...LAGER_OPTIONS].map(l => (
              <button
                key={l || 'none'}
                onClick={() => setSelectedLager(l || '')}
                className={cn(
                  'px-4 py-2.5 rounded-xl border text-sm font-medium transition-all',
                  selectedLager === (l || '')
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-slate-200 hover:bg-slate-50'
                )}
              >
                {l ? LAGER_LABELS[l] : 'Kein Lager'}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowLagerModal(false)}>Abbrechen</Button>
            <Button
              loading={lagerMutation.isPending}
              onClick={() => lagerMutation.mutate(selectedLager || null)}
            >
              Speichern
            </Button>
          </div>
        </div>
      </Modal>

      {/* Print View */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
