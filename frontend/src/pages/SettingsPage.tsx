import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Key, User, Shield, CheckCircle, AlertCircle, RefreshCw, Download } from 'lucide-react';
import { authApi, versionApi } from '../api';
import { useAuthStore } from '../store/authStore';
import PushNotificationPanel from '../components/ui/PushNotificationPanel';
import { PageHeader, Card, Button } from '../components/ui';
import { ROLE_LABELS, formatDateTime, cn } from '../utils';

export default function SettingsPage() {
  const { user, hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const isAdmin = hasRole('administrator');

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
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [activeField, setActiveField] = useState<'current' | 'new' | 'confirm' | null>(null);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinError, setPinError] = useState('');

  const changePinMutation = useMutation({
    mutationFn: () => authApi.changePin(currentPin, newPin),
    onSuccess: () => {
      setPinSuccess(true);
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setActiveField(null);
      setPinError('');
      setTimeout(() => setPinSuccess(false), 3000);
    },
    onError: (err: any) => {
      setPinError(err.response?.data?.message || 'Fehler beim Ändern der PIN');
    }
  });

  const handlePinKey = (digit: string) => {
    if (!activeField) return;
    if (digit === '⌫') {
      if (activeField === 'current') setCurrentPin(p => p.slice(0, -1));
      if (activeField === 'new') setNewPin(p => p.slice(0, -1));
      if (activeField === 'confirm') setConfirmPin(p => p.slice(0, -1));
      return;
    }
    const maxLen = 8;
    if (activeField === 'current' && currentPin.length < maxLen) setCurrentPin(p => p + digit);
    if (activeField === 'new' && newPin.length < maxLen) setNewPin(p => p + digit);
    if (activeField === 'confirm' && confirmPin.length < maxLen) setConfirmPin(p => p + digit);
  };

  const canSubmit = currentPin.length >= 4 && newPin.length >= 4 && newPin === confirmPin;
  const pinMismatch = confirmPin.length >= newPin.length && newPin !== confirmPin && confirmPin.length > 0;

  const PinField = ({
    label, value, fieldKey
  }: {
    label: string;
    value: string;
    fieldKey: 'current' | 'new' | 'confirm';
  }) => (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <button
        type="button"
        onClick={() => setActiveField(activeField === fieldKey ? null : fieldKey)}
        className={cn(
          'w-full px-4 py-3 border rounded-xl flex items-center gap-3 transition-all text-left',
          activeField === fieldKey
            ? 'border-orange-400 ring-2 ring-orange-100'
            : 'border-slate-200 hover:border-slate-300'
        )}
      >
        <div className="flex gap-2">
          {Array.from({ length: Math.max(4, value.length) }).map((_, i) => (
            <div
              key={i}
              className={cn(
                'w-2.5 h-2.5 rounded-full border-2 transition-all',
                i < value.length ? 'bg-orange-500 border-orange-500' : 'border-slate-300'
              )}
            />
          ))}
        </div>
        <span className="text-xs text-slate-400">
          {value.length > 0 ? `${value.length} Zeichen` : 'Klicken zum Eingeben'}
        </span>
        {fieldKey === 'confirm' && pinMismatch && (
          <AlertCircle className="w-4 h-4 text-red-500 ml-auto" />
        )}
        {fieldKey === 'confirm' && !pinMismatch && confirmPin.length >= 4 && newPin === confirmPin && (
          <CheckCircle className="w-4 h-4 text-green-500 ml-auto" />
        )}
      </button>
    </div>
  );

  return (
    <div>
      <PageHeader title="Mein Konto" subtitle="Konto & Sicherheit" />

      <div className="p-6 space-y-4 max-w-2xl">
        {/* Profile Info */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-orange-500" />
            Mein Konto
          </h2>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center flex-shrink-0">
              <span className="text-orange-600 text-xl font-bold">
                {user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-900 text-lg">{user?.name}</div>
              <div className="text-sm text-slate-500 font-mono">@{user?.username}</div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-sm text-slate-600">{ROLE_LABELS[user?.role || '']}</span>
                {user?.depot && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-sm text-slate-600">Lager: {user.depot.charAt(0).toUpperCase() + user.depot.slice(1)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {user?.lastLogin && (
            <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">
              Letzter Login: {formatDateTime(user.lastLogin)}
            </div>
          )}
        </Card>

        {/* PIN Change */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
            <Key className="w-4 h-4 text-orange-500" />
            PIN ändern
          </h2>
          <p className="text-xs text-slate-400 mb-5">Mindestens 4 Ziffern</p>

          <div className="space-y-3 mb-5">
            <PinField label="Aktuelle PIN" value={currentPin} fieldKey="current" />
            <PinField label="Neue PIN" value={newPin} fieldKey="new" />
            <PinField label="Neue PIN bestätigen" value={confirmPin} fieldKey="confirm" />
          </div>

          {/* Numpad */}
          {activeField && (
            <div className="mb-5 p-3 bg-slate-50 rounded-xl">
              <div className="text-xs text-slate-400 mb-2 text-center font-medium">
                {activeField === 'current' ? 'Aktuelle PIN' : activeField === 'new' ? 'Neue PIN' : 'Bestätigung'}
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-w-[200px] mx-auto">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                  if (k === '') return <div key={i} />;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handlePinKey(k)}
                      className="h-10 text-sm font-semibold border border-slate-200 rounded-lg bg-white hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600 transition-all active:scale-95"
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {pinMismatch && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Die PINs stimmen nicht überein
            </div>
          )}

          {pinSuccess && (
            <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-600 flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
              PIN erfolgreich geändert
            </div>
          )}

          {pinError && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {pinError}
            </div>
          )}

          <Button
            disabled={!canSubmit}
            loading={changePinMutation.isPending}
            onClick={() => changePinMutation.mutate()}
          >
            PIN ändern
          </Button>
        </Card>

        {/* Push Notifications */}
        {hasRole('administrator') && <PushNotificationPanel />}

        {/* App Info */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-500" />
            Applikation
          </h2>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-500">Version</span>
              <span className="font-mono" title={version?.commit || undefined}>
                {version?.shortCommit ? `1.0.0 · ${version.shortCommit}` : '1.0.0'}
              </span>
            </div>
            {version?.buildDate && (
              <div className="flex justify-between">
                <span className="text-slate-500">Installiert am</span>
                <span>{formatDateTime(version.buildDate)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Auto-Logout</span>
              <span>60 Minuten</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Datenbank</span>
              <span className="text-green-600 font-medium">● Verbunden</span>
            </div>
          </div>

          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-slate-100">
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
          )}
        </Card>
      </div>
    </div>
  );
}
