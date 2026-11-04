import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Package, CheckCircle, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { versionApi } from '../api';
import { PageHeader, Card } from '../components/ui';
import { formatDateTime, cn } from '../utils';

export default function UpdatePage() {
  const queryClient = useQueryClient();
  const isAdmin = true; // Seite ist per AdminRoute nur für Administratoren erreichbar

  // Laufende Version (alle) + Update-Prüfung gegen GitHub (nur Administratoren)
  const { data: version, isFetching: versionFetching } = useQuery({
    queryKey: ['version'],
    queryFn: () => versionApi.get(),
    staleTime: 60_000,
  });
  const recheckVersion = async () => {
    const fresh = await versionApi.get(true);
    queryClient.setQueryData(['version'], fresh);
  };

  // ── Update über den Updater-Container ──
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateStartError, setUpdateStartError] = useState('');

  const { data: updateStatus, isError: updateStatusError } = useQuery({
    queryKey: ['update-status'],
    queryFn: versionApi.updateStatus,
    enabled: isAdmin && updating,
    refetchInterval: updating ? 3000 : false,
    retry: false,
    gcTime: 0,
  });

  // Seite wurde mitten im Update neu geladen -> Fortschritt wieder anzeigen
  useEffect(() => {
    if (!isAdmin) return;
    versionApi.updateStatus().then(s => { if (s?.state === 'running') setUpdating(true); }).catch(() => {});
  }, [isAdmin]);

  const startUpdate = async () => {
    setUpdateStartError('');
    try {
      await versionApi.startUpdate();
      setConfirmUpdate(false);
      setUpdating(true);
    } catch (err: any) {
      setUpdateStartError(err.response?.data?.message || 'Update konnte nicht gestartet werden');
    }
  };

  const updateState: string | undefined = updating ? (updateStatusError ? 'restarting' : updateStatus?.state) : undefined;

  // Nach erfolgreichem Update neu laden, damit das neue Frontend geladen wird
  useEffect(() => {
    if (updateState !== 'success') return;
    const t = setTimeout(() => window.location.reload(), 2500);
    return () => clearTimeout(t);
  }, [updateState]);

  return (
    <div>
      <PageHeader title="Update" subtitle="Software-Version & Aktualisierung" />

      <div className="p-6 space-y-4 max-w-2xl">
        {/* Installierte Version */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-orange-500" />
            Installierte Version
          </h2>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-500">Version</span>
              <span className="font-mono" title={version?.commit || undefined}>
                {version?.shortCommit ? `1.0.0 · ${version.shortCommit}` : '1.0.0 (Commit unbekannt)'}
              </span>
            </div>
            {version?.buildDate && (
              <div className="flex justify-between">
                <span className="text-slate-500">Installiert am</span>
                <span>{formatDateTime(version.buildDate)}</span>
              </div>
            )}
            {version?.repo && (
              <div className="flex justify-between">
                <span className="text-slate-500">Quelle</span>
                <span className="font-mono text-xs">github.com/{version.repo}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Software-Update */}
        <Card className="p-5">
          <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Software-Update</span>
        <button
          onClick={recheckVersion}
          disabled={versionFetching}
          className="text-xs text-orange-500 hover:text-orange-600 flex items-center gap-1 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3 h-3', versionFetching && 'animate-spin')} />
          Erneut prüfen
        </button>
      </div>

      {updating && (
        <div className={cn(
          'text-xs rounded-lg px-3 py-2.5 mb-2 border space-y-1.5',
          updateState === 'failed' ? 'bg-red-50 border-red-200 text-red-700'
            : updateState === 'success' ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-blue-50 border-blue-200 text-blue-700'
        )}>
          <div className="flex items-center gap-2 font-semibold">
            {updateState === 'success' ? <CheckCircle className="w-3.5 h-3.5" />
              : updateState === 'failed' ? <AlertCircle className="w-3.5 h-3.5" />
              : <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {updateState === 'success' ? 'Update abgeschlossen – Seite wird neu geladen …'
              : updateState === 'failed' ? (updateStatus?.rolledBack ? 'Update fehlgeschlagen – vorherige Version wiederhergestellt' : 'Update fehlgeschlagen')
              : updateState === 'restarting' || updateState === 'unreachable' ? 'App startet neu … (kann 1–2 Minuten dauern)'
              : (updateStatus?.step || 'Update wird gestartet …')}
          </div>
          {updateState === 'failed' && updateStatus?.error && <div>{updateStatus.error}</div>}
          {updateState === 'failed' && (
            <button onClick={() => { setUpdating(false); recheckVersion(); }} className="underline">Schließen</button>
          )}
          {updateStatus?.log?.length > 0 && (
            <details className="text-[10px]">
              <summary className="cursor-pointer opacity-70">Protokoll anzeigen</summary>
              <pre className="mt-1 max-h-40 overflow-auto bg-white/70 rounded p-2 whitespace-pre-wrap font-mono text-slate-600">{updateStatus.log.join('\n')}</pre>
            </details>
          )}
        </div>
      )}

      {version?.checkError ? (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">
          Update-Prüfung nicht möglich: {version.checkError}
        </div>
      ) : version?.updateAvailable === false ? (
        <div className="text-xs bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
          <CheckCircle className="w-3.5 h-3.5" /> Du nutzt die aktuellste Version.
        </div>
      ) : version?.updateAvailable ? (
        <div className="text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 space-y-2">
          <div className="font-semibold text-orange-700">
            {version.latest?.behindBy
              ? `${version.latest.behindBy} neue Änderung${version.latest.behindBy !== 1 ? 'en' : ''} verfügbar`
              : 'Neuere Version verfügbar'}
            {!version.commit && <span className="font-normal text-orange-600"> (laufende Version unbekannt)</span>}
          </div>
          <ul className="space-y-1 text-slate-600">
            {version.latest?.changes?.map((c: any) => (
              <li key={c.sha} className="flex gap-2">
                <span className="font-mono text-slate-400 flex-shrink-0">{c.sha}</span>
                <span>{c.message}</span>
              </li>
            ))}
          </ul>
          {version.updaterConfigured ? (
            confirmUpdate ? (
              <div className="bg-white border border-orange-200 rounded-lg p-2.5 space-y-2">
                <div className="text-slate-600">
                  Die App ist während des Updates ca. 1–3 Minuten nicht erreichbar, angemeldete Nutzer sehen kurz einen Fehler.
                  Bei einem Fehler wird automatisch die vorherige Version wiederhergestellt. Jetzt aktualisieren?
                </div>
                {updateStartError && <div className="text-red-600">{updateStartError}</div>}
                <div className="flex gap-2">
                  <button onClick={startUpdate} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium">
                    Ja, jetzt aktualisieren
                  </button>
                  <button onClick={() => { setConfirmUpdate(false); setUpdateStartError(''); }} className="px-3 py-1.5 text-slate-500 hover:bg-white rounded-lg">
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmUpdate(true)}
                disabled={updating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                <Download className="w-3.5 h-3.5" /> Version aktualisieren
              </button>
            )
          ) : (
            <div className="text-slate-500">
              Updater nicht eingerichtet. Zum Aktualisieren auf dem Server im Projektordner{' '}
              <code className="bg-white px-1 rounded border border-orange-100">./update.sh</code> ausführen
              (richtet auch den Updater für den Button ein).
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-slate-400">Prüfe auf Updates…</div>
      )}
      {version?.checkedAt && !version.checkError && (
        <div className="text-[10px] text-slate-400 mt-1.5">Zuletzt geprüft: {formatDateTime(version.checkedAt)}</div>
      )}
          </div>
        </Card>
      </div>
    </div>
  );
}
