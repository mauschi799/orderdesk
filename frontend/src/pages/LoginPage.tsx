import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { cn } from '../utils';
import { Flame, Delete } from 'lucide-react';
import { authApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { useBrandStore } from '../store/brandStore';

const PIN_LENGTH = 4;

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const settings = useBrandStore(s => s.settings);

  const loginMutation = useMutation({
    mutationFn: ({ username, pin }: { username: string; pin: string }) =>
      authApi.login(username, pin),
    onSuccess: (data) => {
      setAuth(data.user, data.token, data.permissions);
      navigate('/kanban');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Anmeldung fehlgeschlagen');
      setPin('');
    }
  });

  const handlePinInput = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError('');
    if (newPin.length === PIN_LENGTH && username) {
      loginMutation.mutate({ username, pin: newPin });
    }
  };

  const handleDelete = () => setPin(p => p.slice(0, -1));
  const handleClear = () => setPin('');

  const numKeys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className={cn('min-h-screen bg-gradient-to-br flex items-center justify-center p-4', settings.login.backgroundGradient)}>
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4 shadow-lg shadow-orange-500/30">
            <Flame className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">GasDispo</h1>
          <p className="text-slate-400 text-sm mt-1">Lieferschein Disposition</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 animate-slide-in">
          {/* Username */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Benutzername
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value.toLowerCase()); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && document.getElementById('pin-1')?.focus()}
              placeholder="Benutzername eingeben"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* PIN display */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
              PIN
            </label>
            <div className="flex justify-center gap-3">
              {Array.from({ length: PIN_LENGTH }).map((_, i) => (
                <div
                  key={i}
                  className={`pin-dot transition-all duration-150 ${i < pin.length ? 'filled scale-110' : ''}`}
                />
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 text-center animate-fade-in">
              {error}
            </div>
          )}

          {/* PIN Pad */}
          <div className="grid grid-cols-3 gap-2">
            {numKeys.map((key, i) => {
              if (key === '') return <div key={i} />;
              if (key === '⌫') {
                return (
                  <button
                    key={i}
                    onClick={handleDelete}
                    className="flex items-center justify-center h-12 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-all active:scale-95"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                );
              }
              return (
                <button
                  key={i}
                  id={`pin-${key}`}
                  onClick={() => handlePinInput(key)}
                  disabled={loginMutation.isPending}
                  className="h-12 rounded-xl bg-slate-50 hover:bg-orange-50 hover:text-orange-600 font-semibold text-lg text-slate-700 border border-slate-200 hover:border-orange-300 transition-all active:scale-95 disabled:opacity-50"
                >
                  {key}
                </button>
              );
            })}
          </div>

          {loginMutation.isPending && (
            <div className="mt-4 text-center text-sm text-slate-500 animate-pulse">
              Anmeldung läuft...
            </div>
          )}

          {/* Hint */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 text-center">
              Demo: admin / 1234 • disponent / 2345 • lagerist / 3456
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
