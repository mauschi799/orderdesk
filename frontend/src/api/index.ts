import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// Attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('orderdesk_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('orderdesk_token');
      localStorage.removeItem('orderdesk_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  login: (username: string, pin: string) =>
    api.post('/auth/login', { username, pin }).then(r => r.data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then(r => r.data),
  changePin: (currentPin: string, newPin: string) =>
    api.post('/auth/change-pin', { currentPin, newPin }),
};

// Deliveries
export const deliveriesApi = {
  list: (params?: Record<string, any>) =>
    api.get('/deliveries', { params }).then(r => r.data),
  kanban: () =>
    api.get('/deliveries/kanban').then(r => r.data),
  get: (id: string) => api.get(`/deliveries/${id}`).then(r => r.data),
  create: (data: any) => api.post('/deliveries', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/deliveries/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/deliveries/${id}`),
  changeStatus: (id: string, status: string, notiz?: string) =>
    api.patch(`/deliveries/${id}/status`, { status, notiz }).then(r => r.data),
  changeLager: (id: string, lager: string | null) =>
    api.patch(`/deliveries/${id}/lager`, { lager }).then(r => r.data),
  markPrinted: (id: string) =>
    api.patch(`/deliveries/${id}/print`, {}).then(r => r.data),
  kanbanMove: (deliveryId: string, spalte: string, position: number) =>
    api.patch('/deliveries/kanban/move', { deliveryId, spalte, position }).then(r => r.data),
};

// Users
export const usersApi = {
  list: () => api.get('/users').then(r => r.data),
  create: (data: any) => api.post('/users', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// Audit
export const auditApi = {
  list: (params?: Record<string, any>) =>
    api.get('/audit', { params }).then(r => r.data),
};

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats').then(r => r.data),
};

// SelectLine
export const selectlineApi = {
  import: (params: any) => api.post('/selectline/import', params).then(r => r.data),
  importManual: (data: any[]) => api.post('/selectline/import-manual', { data }).then(r => r.data),
  testConnection: () => api.get('/selectline/test').then(r => r.data),
};

export default api;

// Tours
export const toursApi = {
  list: (params?: Record<string, any>) =>
    api.get('/tours', { params }).then(r => r.data),
  get: (id: string) => api.get(`/tours/${id}`).then(r => r.data),
  create: (data: any) => api.post('/tours', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/tours/${id}`, data).then(r => r.data),
  updateDeliveries: (id: string, ids: string[]) =>
    api.patch(`/tours/${id}/deliveries`, { lieferscheinIds: ids }).then(r => r.data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/tours/${id}/status`, { status }).then(r => r.data),
  updateDeliveryStatus: (tourId: string, deliveryId: string, abgeschlossen: boolean) =>
    api.patch(`/tours/${tourId}/delivery-status`, { deliveryId, abgeschlossen }).then(r => r.data),
  geocode: (id: string) => api.post(`/tours/${id}/geocode`).then(r => r.data),
  delete: (id: string) => api.delete(`/tours/${id}`),
};

// Geocode
export const geocodeApi = {
  deliveries: (params?: Record<string, any>) =>
    api.get('/geocode/deliveries', { params }).then(r => r.data),
  single: (adresse: any) =>
    api.post('/geocode/single', { adresse }).then(r => r.data),
  delivery: (id: string) =>
    api.post(`/geocode/delivery/${id}`).then(r => r.data),
};

// Cron
export const cronApi = {
  schedule: () => api.get('/cron/schedule').then(r => r.data),
  updateSchedule: (data: any) => api.put('/cron/schedule', data).then(r => r.data),
  runNow: () => api.post('/cron/run-now').then(r => r.data),
  history: () => api.get('/cron/history').then(r => r.data),
  presets: () => api.get('/cron/presets').then(r => r.data),
};

// Push
export const pushApi = {
  vapidKey: () => api.get('/push/vapid-public-key').then(r => r.data),
  subscribe: (subscription: any, preferences?: any) =>
    api.post('/push/subscribe', { subscription, preferences }).then(r => r.data),
  unsubscribe: (endpoint?: string) =>
    api.delete('/push/unsubscribe', { data: { endpoint } }).then(r => r.data),
  status: () => api.get('/push/status').then(r => r.data),
  updatePreferences: (preferences: any) =>
    api.patch('/push/preferences', { preferences }).then(r => r.data),
  test: () => api.post('/push/test').then(r => r.data),
};

// Lagerbestand
export const lagerApi = {
  // Meldungen
  melden: (data: any) => api.post('/lager/meldung', data).then(r => r.data),
  meine: () => api.get('/lager/meine').then(r => r.data),
  aktuell: () => api.get('/lager/aktuell').then(r => r.data),
  meldungen: (params?: { filiale?: string; limit?: number }) =>
    api.get('/lager/meldungen', { params }).then(r => r.data),
  filialen: () => api.get('/lager/filialen').then(r => r.data),
  // Produkte
  produkte: () => api.get('/lager/produkte').then(r => r.data),
  produkteMeine: (filiale?: string) =>
    api.get('/lager/produkte/meine', { params: filiale ? { filiale } : undefined }).then(r => r.data),
  produktErstellen: (data: any) => api.post('/lager/produkte', data).then(r => r.data),
  produktAktualisieren: (id: string, data: any) => api.put(`/lager/produkte/${id}`, data).then(r => r.data),
  produktLoeschen: (id: string) => api.delete(`/lager/produkte/${id}`).then(r => r.data),
  meldeFilialen: () => api.get('/lager/melde-filialen').then(r => r.data),
};

// Fahrzeuge
export const vehicleApi = {
  list: (params?: { standort?: string; aktiv?: boolean }) =>
    api.get('/fahrzeuge', { params }).then(r => r.data),
  create: (data: any) => api.post('/fahrzeuge', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/fahrzeuge/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/fahrzeuge/${id}`).then(r => r.data),
  // Dokumente
  dokumenteLaden: (id: string) => api.get(`/fahrzeuge/${id}/dokumente`).then(r => r.data),
  dokumentHochladen: (id: string, name: string, file: File) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('datei', file);
    return api.post(`/fahrzeuge/${id}/dokumente`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  dokumentLoeschen: (fahrzeugId: string, docId: string) =>
    api.delete(`/fahrzeuge/${fahrzeugId}/dokumente/${docId}`).then(r => r.data),
  dokumentUrl: (filename: string) => `/api/fahrzeuge/dokumente/${filename}`,
};

// Fahrerverwaltung
export const driverApi = {
  list: (params?: { standort?: string; aktiv?: boolean }) =>
    api.get('/fahrer', { params }).then(r => r.data),
  create: (data: any) => api.post('/fahrer', data).then(r => r.data),
  update: (id: string, data: any) => api.put(`/fahrer/${id}`, data).then(r => r.data),
  delete: (id: string) => api.delete(`/fahrer/${id}`).then(r => r.data),
  dokumenteLaden: (id: string) => api.get(`/fahrer/${id}/dokumente`).then(r => r.data),
  dokumentHochladen: (id: string, name: string, file: File) => {
    const fd = new FormData();
    fd.append('name', name);
    fd.append('datei', file);
    return api.post(`/fahrer/${id}/dokumente`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  dokumentLoeschen: (fahrerId: string, docId: string) =>
    api.delete(`/fahrer/${fahrerId}/dokumente/${docId}`).then(r => r.data),
  dokumentUrl: (filename: string) => `/api/fahrer/dokumente/${filename}`,
};

// Brand / Whitelabel
export const brandApi = {
  public: () => api.get('/brand/public').then(r => r.data),
  settings: () => api.get('/brand/settings').then(r => r.data),
  update: (data: any) => api.patch('/brand/settings', data).then(r => r.data),
  reset: () => api.post('/brand/reset').then(r => r.data),
  uploadLogo: (type: string, data: string) =>
    api.post('/brand/upload-logo', { type, data }).then(r => r.data),
  uploadFavicon: (data: string) =>
    api.post('/brand/upload-favicon', { data }).then(r => r.data),
};
