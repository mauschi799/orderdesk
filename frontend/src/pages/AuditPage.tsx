import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, Filter } from 'lucide-react';
import { auditApi } from '../api';
import { AuditLog } from '../types';
import { PageHeader, Card, StatusBadge } from '../components/ui';
import { AKTION_LABELS, STATUS_LABELS, LAGER_LABELS, formatDateTime, cn } from '../utils';

const AKTION_OPTIONS = [
  { value: '', label: 'Alle Aktionen' },
  { value: 'login', label: 'Anmeldungen' },
  { value: 'status_geaendert', label: 'Statusänderungen' },
  { value: 'lager_zugewiesen', label: 'Lagerzuweisungen' },
  { value: 'gedruckt', label: 'Druckaufträge' },
  { value: 'import_abgeschlossen', label: 'Importe' },
  { value: 'kanban_verschoben', label: 'Kanban-Bewegungen' },
  { value: 'lieferschein_erstellt', label: 'Erstellt' },
  { value: 'lieferschein_geloescht', label: 'Gelöscht' },
  { value: 'benutzer_erstellt', label: 'Benutzer erstellt' },
];

const AKTION_ICON_COLORS: Record<string, string> = {
  login: 'bg-green-100 text-green-600',
  logout: 'bg-slate-100 text-slate-500',
  status_geaendert: 'bg-blue-100 text-blue-600',
  lager_zugewiesen: 'bg-amber-100 text-amber-600',
  gedruckt: 'bg-violet-100 text-violet-600',
  import_abgeschlossen: 'bg-orange-100 text-orange-600',
  import_gestartet: 'bg-orange-50 text-orange-400',
  lieferschein_erstellt: 'bg-teal-100 text-teal-600',
  lieferschein_geaendert: 'bg-sky-100 text-sky-600',
  lieferschein_geloescht: 'bg-red-100 text-red-600',
  kanban_verschoben: 'bg-indigo-100 text-indigo-600',
  benutzer_erstellt: 'bg-pink-100 text-pink-600',
  benutzer_geaendert: 'bg-pink-50 text-pink-500',
  benutzer_geloescht: 'bg-red-100 text-red-500',
};

export default function AuditPage() {
  const [aktion, setAktion] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit', aktion, page],
    queryFn: () => auditApi.list({ aktion, page, limit: 50 }),
    placeholderData: prev => prev,
  });

  const logs: AuditLog[] = data?.logs || [];

  return (
    <div>
      <PageHeader
        title="Audit-Log"
        subtitle="Alle Änderungen und Aktionen protokolliert"
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
        <Filter className="w-4 h-4 text-slate-400" />
        <select
          value={aktion}
          onChange={e => { setAktion(e.target.value); setPage(1); }}
          className="text-sm border border-slate-200 rounded-lg px-2 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-orange-400"
        >
          {AKTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {data?.pagination && (
          <span className="text-xs text-slate-400 ml-auto">
            {data.pagination.total} Einträge
          </span>
        )}
      </div>

      <div className="p-6">
        <Card>
          {isError ? (
            <div className="py-12 flex flex-col items-center gap-4">
              <ScrollText className="w-10 h-10 opacity-30 text-red-400" />
              <p className="text-sm text-slate-500">Audit-Log konnte nicht geladen werden.</p>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
              >
                Erneut versuchen
              </button>
            </div>
          ) : isLoading ? (
            <div className="py-12 text-center text-slate-400">Lädt...</div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Keine Einträge gefunden</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {logs.map((log) => {
                const benutzer = typeof log.benutzer === 'object' ? log.benutzer : null;
                const lieferschein = typeof log.lieferschein === 'object' ? log.lieferschein : null;
                const iconColor = AKTION_ICON_COLORS[log.aktion] || 'bg-slate-100 text-slate-500';

                return (
                  <div key={log._id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors">
                    {/* Icon */}
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold', iconColor)}>
                      {(log.benutzerName || benutzer?.name || 'S')?.charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">
                          {log.benutzerName || benutzer?.name || 'System'}
                        </span>
                        <span className="text-xs text-slate-400">{benutzer?.username && `@${benutzer.username}`}</span>
                        <span className="text-sm text-slate-600">
                          {AKTION_LABELS[log.aktion] || log.aktion}
                        </span>
                        {(log.lieferscheinNr || (lieferschein as any)?.lieferscheinNr) && (
                          <span className="font-mono text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">
                            {log.lieferscheinNr || (lieferschein as any)?.lieferscheinNr}
                          </span>
                        )}
                      </div>

                      {/* Details */}
                      {log.details && (
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {log.details.vonStatus && log.details.zuStatus && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <StatusBadge status={log.details.vonStatus} />
                              <span className="text-slate-400">→</span>
                              <StatusBadge status={log.details.zuStatus} />
                            </div>
                          )}
                          {log.details.vonLager !== undefined && log.details.zuLager !== undefined && (
                            <span className="text-xs text-slate-500">
                              Lager: {log.details.vonLager ? LAGER_LABELS[log.details.vonLager] : 'Keins'}
                              {' → '}
                              {log.details.zuLager ? LAGER_LABELS[log.details.zuLager] : 'Keins'}
                            </span>
                          )}
                          {log.details.beschreibung && (
                            <span className="text-xs text-slate-500">{log.details.beschreibung}</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Timestamp */}
                    <div className="text-xs text-slate-400 flex-shrink-0 text-right">
                      {formatDateTime(log.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {data?.pagination && data.pagination.pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
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
