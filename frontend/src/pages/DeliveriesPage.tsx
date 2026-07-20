import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Package, Filter, X } from 'lucide-react';
import { deliveriesApi } from '../api';
import { Delivery } from '../types';
import { PageHeader, Card, StatusBadge, LagerBadge, Button, EmptyState } from '../components/ui';
import { formatDate, formatWeight, calcGesamtgewicht } from '../utils';
import { useAuthStore } from '../store/authStore';

const STATUS_OPTIONS = [
  { value: '', label: 'Alle Status' },
  { value: 'neu', label: 'Neu' },
  { value: 'nicht_zugewiesen', label: 'Nicht zugewiesen' },
  { value: 'zugewiesen', label: 'Zugewiesen' },
  { value: 'gedruckt', label: 'Gedruckt' },
  { value: 'in_auslieferung', label: 'In Auslieferung' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
];

const LAGER_OPTIONS = [
  { value: '', label: 'Alle Lager' },
  { value: 'frei', label: 'Frei' },
  { value: 'bengel', label: 'Bengel' },
  { value: 'trier', label: 'Trier' },
];

export default function DeliveriesPage() {
  const navigate = useNavigate();
  const { hasRole } = useAuthStore();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [lager, setLager] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['deliveries', search, status, lager, page],
    queryFn: () => deliveriesApi.list({ search, status, lager, page, limit: 30 }),
    placeholderData: prev => prev
  });

  const hasFilters = search || status || lager;

  return (
    <div>
      <PageHeader
        title="Lieferscheine"
        subtitle={`${data?.pagination?.total ?? 0} Lieferscheine gesamt`}
        actions={
          <div className="flex items-center gap-2">
            {hasRole('administrator', 'disponent') && (
              <Button size="sm" onClick={() => navigate('/lieferscheine/neu')}>
                <Plus className="w-3.5 h-3.5" />
                Manuell erstellen
              </Button>
            )}
          </div>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Suche nach Nr., Kunde..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={lager}
            onChange={e => { setLager(e.target.value); setPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
          >
            {LAGER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setStatus(''); setLager(''); setPage(1); }}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="p-6">
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Lieferschein-Nr.', 'Kunde', 'Lieferdatum', 'Positionen', 'Gewicht', 'Lager', 'Status', 'Quelle'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">Lädt...</td></tr>
                )}
                {!isLoading && !data?.deliveries?.length && (
                  <tr><td colSpan={8}><EmptyState message="Keine Lieferscheine gefunden" icon={Package} /></td></tr>
                )}
                {data?.deliveries?.map((delivery: Delivery) => (
                  <tr
                    key={delivery._id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/lieferscheine/${delivery._id}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium text-slate-700">
                        {delivery.lieferscheinNr}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-800">{delivery.kunde.name}</div>
                        {delivery.kunde.adresse?.ort && (
                          <div className="text-xs text-slate-400">{delivery.kunde.adresse.ort}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatDate(delivery.lieferdatum)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {delivery.positionen.length} Pos. · {delivery.positionen.reduce((s, p) => s + p.menge, 0)} Stk
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {formatWeight(calcGesamtgewicht(delivery.positionen))}
                    </td>
                    <td className="px-4 py-3">
                      <LagerBadge lager={delivery.lager} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={delivery.status} />
                    </td>
                    <td className="px-4 py-3">
                      {delivery.importQuelle === 'selectline' ? (
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded font-medium">SelectLine</span>
                      ) : (
                        <span className="text-xs text-slate-400">Manuell</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data?.pagination && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <span className="text-sm text-slate-500">
                Seite {data.pagination.page} von {data.pagination.pages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                >
                  Zurück
                </button>
                <button
                  disabled={page >= data.pagination.pages}
                  onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50"
                >
                  Weiter
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
