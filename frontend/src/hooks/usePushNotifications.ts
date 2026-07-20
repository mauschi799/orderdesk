import { useState, useEffect, useCallback } from 'react';
import api from '../api';

const PUBLIC_KEY_URL = '/api/push/vapid-public-key';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

export interface PushStatus {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

export interface PushPreferences {
  statusGeaendert: boolean;
  lagerZugewiesen: boolean;
  importAbgeschlossen: boolean;
  auslieferungGestartet: boolean;
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>({
    supported: 'serviceWorker' in navigator && 'PushManager' in window,
    configured: false,
    permission: 'default',
    subscribed: false,
    loading: true,
    error: null,
  });

  const [preferences, setPreferencesState] = useState<PushPreferences>({
    statusGeaendert: true,
    lagerZugewiesen: true,
    importAbgeschlossen: true,
    auslieferungGestartet: true,
  });

  // Initialize: check server config & current permission
  useEffect(() => {
    const init = async () => {
      try {
        const { configured } = await api.get(PUBLIC_KEY_URL).then(r => r.data);
        const permission = Notification.permission;
        
        let subscribed = false;
        if (configured && 'serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager?.getSubscription();
          subscribed = !!sub;
        }

        setStatus(s => ({ ...s, configured, permission, subscribed, loading: false }));
      } catch {
        setStatus(s => ({ ...s, loading: false }));
      }
    };
    init();
  }, []);

  const subscribe = useCallback(async () => {
    setStatus(s => ({ ...s, loading: true, error: null }));
    try {
      // Register service worker
      const reg = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(s => ({ ...s, permission, loading: false, error: 'Berechtigung verweigert' }));
        return;
      }

      // Get VAPID key
      const { publicKey } = await api.get(PUBLIC_KEY_URL).then(r => r.data);
      if (!publicKey) throw new Error('VAPID Key nicht konfiguriert');

      // Subscribe to push
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource
      });

      // Send to backend
      await api.post('/push/subscribe', {
        subscription: sub.toJSON(),
        preferences
      });

      setStatus(s => ({ ...s, permission, subscribed: true, loading: false }));
    } catch (err: any) {
      setStatus(s => ({ ...s, loading: false, error: err.message || 'Fehler beim Aktivieren' }));
    }
  }, [preferences]);

  const unsubscribe = useCallback(async () => {
    setStatus(s => ({ ...s, loading: true, error: null }));
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        await api.delete('/push/unsubscribe', { data: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setStatus(s => ({ ...s, subscribed: false, loading: false }));
    } catch (err: any) {
      setStatus(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const sendTestNotification = useCallback(async () => {
    try {
      await api.post('/push/test');
    } catch (err: any) {
      setStatus(s => ({ ...s, error: err.response?.data?.message || err.message }));
    }
  }, []);

  const savePreferences = useCallback(async (prefs: PushPreferences) => {
    setPreferencesState(prefs);
    try {
      await api.patch('/push/preferences', { preferences: prefs });
    } catch {}
  }, []);

  return { status, preferences, subscribe, unsubscribe, sendTestNotification, savePreferences };
}
