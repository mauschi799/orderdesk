import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Settings, Key, User, Shield, CheckCircle, AlertCircle } from 'lucide-react';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';
import PushNotificationPanel from '../components/ui/PushNotificationPanel';
import { PageHeader, Card, Button } from '../components/ui';
import { ROLE_LABELS, formatDateTime, cn } from '../utils';

export default function SettingsPage() {
  const { user } = useAuthStore();
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
      <PageHeader title="Einstellungen" subtitle="Konto & Sicherheit" />

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
        <PushNotificationPanel />

        {/* App Info */}
        <Card className="p-5">
          <h2 className="font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-500" />
            Applikation
          </h2>
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-500">Version</span>
              <span className="font-mono">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Auto-Logout</span>
              <span>60 Minuten</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Datenbank</span>
              <span className="text-green-600 font-medium">● Verbunden</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
