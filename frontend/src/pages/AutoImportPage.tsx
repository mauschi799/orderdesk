import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Play, Settings, CheckCircle, AlertCircle,
  RefreshCw, History, ToggleLeft, ToggleRight, Zap
} from 'lucide-react';
import api from '../api';
import { Card, Button, PageHeader } from '../components/ui';
import { formatDateTime, cn } from '../utils';

interface CronSchedule {
  aktiv: boolean;
  cronExpression: string;
  beschreibung: string;
  tageRueckblick: number;
  letzterLauf?: string;
  letzterLaufErgebnis?: {
    imported: number;
    updated: number;
    skipped: number;
    errors: string[];
    dauer: number;
  };
  naechsterLauf?: string;
  historie?: Array<{
    zeitpunkt: string;
    ergebnis: {
      imported: number;
      updated: number;
      skipped: number;
      errors: string[];
      dauer: number;
    };
  }>;
}

interface Preset {
  label: string;
  expression: string;
}

export default function AutoImportPage() {
  const queryClient = useQueryClient();
  const [customCron, setCustomCron] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const { data: schedule, isLoading } = useQuery<CronSchedule>({
    queryKey: ['cron-schedule'],
    queryFn: () => api.get('/cron/schedule').then(r => r.data),
  });

  const { data: presets = [] } = useQuery<Preset[]>({
    queryKey: ['cron-presets'],
    queryFn: () => api.get('/cron/presets').then(r => r.data),
  });

  const { data: history } = useQuery({
    queryKey: ['cron-history'],
    queryFn: () => api.get('/cron/history').then(r => r.data),
    enabled: showHistory,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<CronSchedule>) =>
      api.put('/cron/schedule', data).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron-schedule'] })
  });

  const runNowMutation = useMutation({
    mutationFn: () => api.post('/cron/run-now', {}, { timeout: 120_000 }).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cron-schedule'] })
  });

  const toggleActive = () => {
    updateMutation.mutate({ aktiv: !schedule?.aktiv });
  };

  const applyPreset = (preset: Preset) => {
    updateMutation.mutate({
      cronExpression: preset.expression,
      beschreibung: preset.label
    });
  };

  const applyCustomCron = () => {
    if (!customCron.trim()) return;
    updateMutation.mutate({ cronExpression: customCron });
  };

  const lastResult = schedule?.letzterLaufErgebnis;

  return (
    <div>
      <PageHeader
        title="Automatischer Import"
        subtitle="Geplanter SelectLine-Abgleich"
      />

      <div className="p-6 space-y-4 max-w-3xl">
        {/* Status Card */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center',
                schedule?.aktiv ? 'bg-green-50' : 'bg-slate-100'
              )}>
                <Clock className={cn('w-5 h-5', schedule?.aktiv ? 'text-green-500' : 'text-slate-400')} />
              </div>
              <div>
                <div className="font-semibold text-slate-800">
                  Auto-Import {schedule?.aktiv ? 'aktiv' : 'deaktiviert'}
                </div>
                <div className="text-xs text-slate-500">
                  {schedule?.beschreibung || schedule?.cronExpression || 'Nicht konfiguriert'}
                </div>
              </div>
            </div>

            <button
              onClick={toggleActive}
              disabled={updateMutation.isPending || isLoading}
              className="flex-shrink-0"
              title={schedule?.aktiv ? 'Deaktivieren' : 'Aktivieren'}
            >
              {schedule?.aktiv ? (
                <ToggleRight className="w-10 h-10 text-green-500 hover:text-green-600 transition-colors" />
              ) : (
                <ToggleLeft className="w-10 h-10 text-slate-300 hover:text-slate-400 transition-colors" />
              )}
            </button>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Letzter Lauf</div>
              <div className="text-sm font-medium text-slate-700">
                {schedule?.letzterLauf ? formatDateTime(schedule.letzterLauf) : '–'}
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Rückblick</div>
              <div className="text-sm font-medium text-slate-700">
                {schedule?.tageRueckblick || 7} Tage
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xs text-slate-500 mb-1">Zeitzone</div>
              <div className="text-sm font-medium text-slate-700">Europe/Berlin</div>
            </div>
          </div>

          {/* Last result */}
          {lastResult && (
            <div className={cn(
              'mt-4 p-3 rounded-xl border flex items-start gap-3',
              lastResult.errors?.length > 0
                ? 'bg-amber-50 border-amber-200'
                : 'bg-green-50 border-green-200'
            )}>
              {lastResult.errors?.length > 0 ? (
                <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <span className="font-semibold text-slate-700">Letztes Ergebnis: </span>
                <span className="text-green-600">{lastResult.imported} neu</span>
                {' · '}
                <span className="text-blue-600">{lastResult.updated} aktualisiert</span>
                {' · '}
                <span className="text-slate-500">{lastResult.skipped} übersprungen</span>
                {lastResult.dauer && (
                  <span className="text-slate-400"> · {(lastResult.dauer / 1000).toFixed(1)}s</span>
                )}
                {lastResult.errors?.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="font-semibold text-amber-700">{lastResult.errors.length} Fehler:</div>
                    {lastResult.errors.map((e, i) => (
                      <div key={i} className="bg-amber-100 text-amber-800 px-2 py-1 rounded font-mono break-all">{e}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Manual Run */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-500" />
                Jetzt importieren
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Manueller Import unabhängig vom Zeitplan
              </p>
            </div>
            <Button
              onClick={() => runNowMutation.mutate()}
              loading={runNowMutation.isPending}
            >
              <Play className="w-4 h-4" />
              {runNowMutation.isPending ? 'Importiert...' : 'Import starten'}
            </Button>
          </div>

          {runNowMutation.isPending && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-600 flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
              Lädt Lieferscheine von SelectLine... Kann bei vielen Dokumenten 30–60 Sekunden dauern.
            </div>
          )}

          {runNowMutation.isSuccess && (
            <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl animate-fade-in">
              <div className="text-sm font-medium text-green-700 mb-1">Import abgeschlossen ✓</div>
              <div className="text-xs text-green-600 space-x-3">
                <span>{(runNowMutation.data as any)?.imported || 0} neu importiert</span>
                <span>{(runNowMutation.data as any)?.updated || 0} aktualisiert</span>
                <span>{(runNowMutation.data as any)?.skipped || 0} übersprungen</span>
              </div>
              {(runNowMutation.data as any)?.errors?.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-semibold text-amber-700">{(runNowMutation.data as any).errors.length} Fehler:</div>
                  {(runNowMutation.data as any).errors.map((e: string, i: number) => (
                    <div key={i} className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded font-mono break-all">{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {runNowMutation.isError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {(runNowMutation.error as any)?.response?.data?.message
                || (runNowMutation.error as any)?.message
                || 'Import fehlgeschlagen'}
            </div>
          )}
        </Card>

        {/* Schedule Config */}
        <Card className="p-5">
          <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-500" />
            Zeitplan konfigurieren
          </h3>

          {/* Presets */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Vorlagen
            </label>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.expression}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    'text-left px-3 py-2 rounded-xl border text-sm transition-all',
                    schedule?.cronExpression === preset.expression
                      ? 'border-orange-400 bg-orange-50 text-orange-700 font-medium'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                  )}
                >
                  <div className="font-medium">{preset.label}</div>
                  <div className="text-xs font-mono text-slate-400 mt-0.5">{preset.expression}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom cron */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Eigener Cron-Ausdruck
            </label>
            <div className="flex gap-2">
              <input
                value={customCron}
                onChange={e => setCustomCron(e.target.value)}
                placeholder={schedule?.cronExpression || '0 6 * * *'}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={applyCustomCron}
                disabled={!customCron.trim()}
                loading={updateMutation.isPending}
              >
                Anwenden
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Format: Minute Stunde Tag Monat Wochentag · Beispiel: <code className="bg-slate-100 px-1 rounded">0 6 * * *</code> = täglich 06:00
            </p>
          </div>

          {/* Lookback days */}
          <div className="mt-4">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Rückblick-Zeitraum
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max="30"
                value={schedule?.tageRueckblick || 7}
                onChange={e => updateMutation.mutate({ tageRueckblick: parseInt(e.target.value) })}
                className="flex-1 accent-orange-500"
              />
              <span className="text-sm font-bold text-slate-700 w-16">
                {schedule?.tageRueckblick || 7} Tage
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Wie viele Tage in die Vergangenheit soll SelectLine beim Import abgefragt werden
            </p>
          </div>
        </Card>

        {/* History */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <History className="w-4 h-4 text-orange-500" />
              Import-Verlauf
            </h3>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs text-orange-500 hover:text-orange-600"
            >
              {showHistory ? 'Ausblenden' : 'Anzeigen'}
            </button>
          </div>

          {showHistory && (
            <div className="space-y-2">
              {history?.historie?.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">Kein Verlauf vorhanden</p>
              )}
              {[...(history?.historie || [])].reverse().map((entry: any, i: number) => (
                <div key={i} className={cn(
                  'flex items-center gap-4 p-3 rounded-xl border text-sm',
                  entry.ergebnis?.errors?.length > 0
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-green-200 bg-green-50'
                )}>
                  <div className="text-xs text-slate-500 flex-shrink-0 w-32">
                    {formatDateTime(entry.zeitpunkt)}
                  </div>
                  <div className="flex-1 flex items-center gap-3 text-xs">
                    <span className="text-green-600 font-medium">{entry.ergebnis?.imported || 0} neu</span>
                    <span className="text-blue-600">{entry.ergebnis?.updated || 0} upd</span>
                    <span className="text-slate-500">{entry.ergebnis?.skipped || 0} skip</span>
                    {entry.ergebnis?.errors?.length > 0 && (
                      <span className="text-amber-600">{entry.ergebnis.errors.length} Fehler</span>
                    )}
                    {entry.ergebnis?.dauer && (
                      <span className="text-slate-400">{(entry.ergebnis.dauer / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
