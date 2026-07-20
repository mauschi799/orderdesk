import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '../api';
import { PageHeader, Card } from '../components/ui';
import { STATUS_LABELS, LAGER_LABELS, AKTION_LABELS, formatDateTime, STATUS_DOT_COLORS } from '../utils';
import {
  Package, Truck, CheckCircle, Clock, AlertCircle, TrendingUp, Activity, RefreshCw
} from 'lucide-react';
import { cn } from '../utils';

const STAT_CONFIG = [
  { key: 'gesamt', label: 'Gesamt', icon: Package, color: 'text-slate-600', bg: 'bg-slate-100' },
  { key: 'offen', label: 'Offen', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
  { key: 'heute', label: 'Heute fällig', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
];

export default function DashboardPage() {
  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: dashboardApi.stats,
    refetchInterval: 30_000,
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Übersicht & Statistiken" />
        <div className="p-6">
          <Card className="p-10 flex flex-col items-center text-center gap-4">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-slate-600">Statistiken konnten nicht geladen werden.</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
            >
              Erneut versuchen
            </button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Übersicht & Statistiken" />

      <div className="p-6 space-y-6">
        {/* Top Stats */}
        <div className="grid grid-cols-3 gap-4">
          {STAT_CONFIG.map(({ key, label, icon: Icon, color, bg }) => (
            <Card key={key} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500 font-medium">{label}</p>
                  <p className="text-3xl font-bold text-slate-900 mt-1">
                    {isLoading ? '–' : (stats?.[key as keyof typeof stats] as number) ?? 0}
                  </p>
                </div>
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', bg)}>
                  <Icon className={cn('w-6 h-6', color)} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Status Distribution */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-orange-500" />
              Nach Status
            </h3>
            <div className="space-y-2.5">
              {Object.entries(stats?.nachStatus || {}).map(([status, count]) => {
                const total = stats?.gesamt || 1;
                const pct = Math.round((count as number / total) * 100);
                return (
                  <div key={status}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full', STATUS_DOT_COLORS[status] || 'bg-gray-400')} />
                        <span className="text-slate-600">{STATUS_LABELS[status] || status}</span>
                      </div>
                      <span className="font-mono font-medium text-slate-900">{count as number}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!isLoading && !stats?.nachStatus && (
                <p className="text-sm text-slate-400">Keine Daten</p>
              )}
            </div>
          </Card>

          {/* Lager Distribution */}
          <Card className="p-5">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <Package className="w-4 h-4 text-orange-500" />
              Nach Lager
            </h3>
            <div className="space-y-3">
              {Object.entries(stats?.nachLager || {}).map(([lager, count]) => (
                <div key={lager} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 font-medium">
                    {LAGER_LABELS[lager] || lager}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-orange-100 rounded-full" style={{ width: '80px' }}>
                      <div
                        className="h-2 bg-orange-500 rounded-full"
                        style={{ width: `${Math.min(100, (count as number / (stats?.gesamt || 1)) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono text-sm font-bold text-slate-900 w-6 text-right">{count as number}</span>
                  </div>
                </div>
              ))}
              {!isLoading && !Object.keys(stats?.nachLager || {}).length && (
                <p className="text-sm text-slate-400">Keine Lagerzuweisungen</p>
              )}
            </div>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-500" />
            Letzte Aktivitäten
          </h3>
          <div className="space-y-1">
            {stats?.recentActivity?.map((log: any) => {
              const isSyncEvent = ['import_manuell', 'import_auto', 'import_gestartet', 'import_abgeschlossen'].includes(log.aktion);
              const isAutoSync = log.aktion === 'import_auto';
              return (
                <div key={log._id} className="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
                    isSyncEvent ? 'bg-blue-50' : 'bg-slate-100'
                  )}>
                    {isSyncEvent ? (
                      <RefreshCw className={cn('w-3.5 h-3.5', isAutoSync ? 'text-blue-500' : 'text-indigo-500')} />
                    ) : (
                      <span className="text-xs font-bold text-slate-500">
                        {(log.benutzerName || log.benutzer?.name || 'S')?.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-slate-700">
                      <span className="font-medium">{log.benutzerName || log.benutzer?.name || 'System'}</span>
                      {' '}
                      <span className="text-slate-500">{AKTION_LABELS[log.aktion] || log.aktion}</span>
                      {log.lieferscheinNr && (
                        <span className="font-mono text-xs text-orange-600 ml-1">{log.lieferscheinNr}</span>
                      )}
                    </span>
                    {isSyncEvent && log.details?.beschreibung && (
                      <div className="text-xs text-slate-400 mt-0.5">{log.details.beschreibung}</div>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{formatDateTime(log.timestamp)}</span>
                </div>
              );
            })}
            {!isLoading && !stats?.recentActivity?.length && (
              <p className="text-sm text-slate-400 py-4 text-center">Keine Aktivitäten</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
