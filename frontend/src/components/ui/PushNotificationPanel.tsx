import { useState } from 'react';
import { Bell, BellOff, BellRing, CheckCircle, AlertCircle, Settings } from 'lucide-react';
import { usePushNotifications, PushPreferences } from '../../hooks/usePushNotifications';
import { Card, Button } from '../ui';
import { cn } from '../../utils';

const PREFERENCE_LABELS: Record<keyof PushPreferences, string> = {
  statusGeaendert: 'Statusänderungen',
  lagerZugewiesen: 'Lagerzuweisungen',
  importAbgeschlossen: 'Import abgeschlossen',
  auslieferungGestartet: 'Auslieferung gestartet',
};

export default function PushNotificationPanel() {
  const { status, preferences, subscribe, unsubscribe, sendTestNotification, savePreferences } = usePushNotifications();
  const [localPrefs, setLocalPrefs] = useState<PushPreferences>(preferences);
  const [prefsSaved, setPrefsSaved] = useState(false);

  const handleTogglePref = (key: keyof PushPreferences) => {
    const updated = { ...localPrefs, [key]: !localPrefs[key] };
    setLocalPrefs(updated);
  };

  const handleSavePrefs = async () => {
    await savePreferences(localPrefs);
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  };

  return (
    <Card className="p-5">
      <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <Bell className="w-4 h-4 text-orange-500" />
        Push-Benachrichtigungen
      </h2>

      {/* Not supported */}
      {!status.supported && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Push-Notifications werden in diesem Browser nicht unterstützt.
        </div>
      )}

      {/* Not configured on server */}
      {status.supported && !status.configured && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            VAPID-Schlüssel nicht konfiguriert. Push-Notifications erfordern{' '}
            <code className="bg-amber-100 px-1 rounded text-xs">VAPID_PUBLIC_KEY</code> und{' '}
            <code className="bg-amber-100 px-1 rounded text-xs">VAPID_PRIVATE_KEY</code> im Backend.
            <div className="mt-1 text-xs font-mono bg-amber-100 p-1.5 rounded">
              npm run generate-vapid
            </div>
          </div>
        </div>
      )}

      {/* Configured & supported */}
      {status.supported && status.configured && (
        <>
          {/* Status display */}
          <div className={cn(
            'flex items-center justify-between p-3 rounded-xl border mb-4',
            status.subscribed
              ? 'bg-green-50 border-green-200'
              : 'bg-slate-50 border-slate-200'
          )}>
            <div className="flex items-center gap-2">
              {status.subscribed ? (
                <BellRing className="w-5 h-5 text-green-500" />
              ) : (
                <BellOff className="w-5 h-5 text-slate-400" />
              )}
              <div>
                <div className="text-sm font-medium text-slate-700">
                  {status.subscribed ? 'Benachrichtigungen aktiv' : 'Benachrichtigungen deaktiviert'}
                </div>
                {status.permission === 'denied' && (
                  <div className="text-xs text-red-500">Berechtigung verweigert – Browser-Einstellungen prüfen</div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              {status.subscribed && (
                <button
                  onClick={sendTestNotification}
                  className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-50 transition-all"
                >
                  Test
                </button>
              )}
              {status.subscribed ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={unsubscribe}
                  loading={status.loading}
                >
                  <BellOff className="w-3.5 h-3.5" />
                  Deaktivieren
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={subscribe}
                  loading={status.loading}
                  disabled={status.permission === 'denied'}
                >
                  <Bell className="w-3.5 h-3.5" />
                  Aktivieren
                </Button>
              )}
            </div>
          </div>

          {status.error && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              {status.error}
            </div>
          )}

          {/* Preferences (only when subscribed) */}
          {status.subscribed && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <Settings className="w-3 h-3 inline mr-1" />
                  Benachrichtigungen für
                </label>
                {prefsSaved && (
                  <span className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Gespeichert
                  </span>
                )}
              </div>
              <div className="space-y-2 mb-3">
                {(Object.keys(PREFERENCE_LABELS) as Array<keyof PushPreferences>).map(key => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-1.5"
                  >
                    <span className="text-sm text-slate-600">{PREFERENCE_LABELS[key]}</span>
                    <button
                      type="button"
                      onClick={() => handleTogglePref(key)}
                      className={cn(
                        'w-9 h-5 rounded-full transition-colors relative flex-shrink-0',
                        localPrefs[key] ? 'bg-orange-500' : 'bg-slate-200'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                        localPrefs[key] ? 'left-4.5' : 'left-0.5'
                      )}
                        style={{ left: localPrefs[key] ? '17px' : '2px' }}
                      />
                    </button>
                  </div>
                ))}
              </div>
              <Button size="sm" variant="outline" onClick={handleSavePrefs}>
                Einstellungen speichern
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
