import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Edit, Trash2, User, Shield, Eye, Package, RefreshCw, Store, ClipboardList, BarChart3
} from 'lucide-react';
import { usersApi, lagerApi } from '../api';
import { User as UserType, Role } from '../types';
import { PageHeader, Card, Button, Modal } from '../components/ui';
import { ROLE_LABELS, formatDateTime, cn } from '../utils';
import { useAuthStore } from '../store/authStore';

const ROLES: { value: Role; label: string; icon: any; color: string }[] = [
  { value: 'administrator', label: 'Administrator', icon: Shield, color: 'text-red-500' },
  { value: 'disponent', label: 'Disponent', icon: Package, color: 'text-blue-500' },
  { value: 'lagerist', label: 'Lagerist', icon: User, color: 'text-amber-500' },
  { value: 'viewer', label: 'Betrachter', icon: Eye, color: 'text-slate-500' },
  { value: 'filialen', label: 'Filiale', icon: Store, color: 'text-green-500' },
];

const DEPOTS = [
  { value: '', label: 'Kein Lager' },
  { value: 'frei', label: 'Frei' },
  { value: 'bengel', label: 'Bengel' },
  { value: 'trier', label: 'Trier' },
];

interface LagerBerechtigungForm {
  aktiv: boolean;
  filialen: string[];
}

interface UserForm {
  name: string;
  username: string;
  pin: string;
  role: Role;
  depot: string;
  filiale: string;
  isActive: boolean;
  lagerMelden: LagerBerechtigungForm;
  lagerLesen: LagerBerechtigungForm;
}

const emptyForm: UserForm = {
  name: '',
  username: '',
  pin: '',
  role: 'viewer',
  depot: '',
  filiale: '',
  isActive: true,
  lagerMelden: { aktiv: false, filialen: [] },
  lagerLesen:  { aktiv: false, filialen: [] },
};

// Rollen die eine Berechtigung BEREITS über ihre Rolle haben (kein individuelles Toggle nötig)
const ROLE_HAS_MELDEN = new Set<Role>(['administrator', 'filialen']);
const ROLE_HAS_LESEN  = new Set<Role>(['administrator', 'lagerist']);

export default function UsersPage() {
  const { user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [pinInput, setPinInput] = useState('');

  const { data: users = [], isLoading } = useQuery<UserType[]>({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  // Alle bekannten Filialen (für Checkboxen im Berechtigungs-Block)
  const { data: alleFilialen = [] } = useQuery<string[]>({
    queryKey: ['lager-filialen'],
    queryFn: lagerApi.filialen,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => usersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      setForm(emptyForm);
      setPinInput('');
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowModal(false);
      setEditingUser(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setDeleteConfirm(null);
    }
  });

  const openCreate = () => {
    setEditingUser(null);
    setForm(emptyForm);
    setPinInput('');
    setShowModal(true);
  };

  const openEdit = (user: UserType) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      username: user.username,
      pin: '',
      role: user.role,
      depot: user.depot || '',
      filiale: user.filiale || '',
      isActive: user.isActive,
      lagerMelden: { aktiv: user.lagerMelden?.aktiv ?? false, filialen: user.lagerMelden?.filialen ?? [] },
      lagerLesen:  { aktiv: user.lagerLesen?.aktiv ?? false,  filialen: user.lagerLesen?.filialen ?? [] },
    });
    setPinInput('');
    setShowModal(true);
  };

  const handleSubmit = () => {
    const data = {
      ...form,
      depot: form.depot || null,
      filiale: form.filiale || null,
      ...(pinInput && { pin: pinInput }),
      ...(!editingUser && { pin: pinInput }),
    };
    if (editingUser) {
      updateMutation.mutate({ id: editingUser._id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handlePinKey = (digit: string) => {
    if (pinInput.length >= 8) return;
    setPinInput(p => p + digit);
  };

  const toggleLagerFiliale = (type: 'lagerMelden' | 'lagerLesen', filiale: string) => {
    setForm(f => {
      const cur = f[type].filialen;
      return {
        ...f,
        [type]: {
          ...f[type],
          filialen: cur.includes(filiale) ? cur.filter(x => x !== filiale) : [...cur, filiale],
        },
      };
    });
  };

  const isLoading2 = createMutation.isPending || updateMutation.isPending;
  const error = createMutation.error || updateMutation.error;

  // Zeige Lager-Berechtigungs-Block nur wenn Rolle nicht schon alle Rechte per Rolle hat
  const showMeldenToggle = !ROLE_HAS_MELDEN.has(form.role);
  const showLesenToggle  = !ROLE_HAS_LESEN.has(form.role);
  const showLagerBlock   = showMeldenToggle || showLesenToggle;

  return (
    <div>
      <PageHeader
        title="Benutzerverwaltung"
        subtitle={`${users.length} Benutzer`}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Neuer Benutzer
          </Button>
        }
      />

      <div className="p-6">
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Name', 'Benutzername', 'Rolle', 'Lager / Filiale', 'Lager-Zugang', 'Status', 'Letzter Login', ''].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Lädt...</td></tr>
                )}
                {users.map((user) => {
                  const roleConf = ROLES.find(r => r.value === user.role);
                  const RoleIcon = roleConf?.icon || User;
                  const hasMeldenExtra = user.lagerMelden?.aktiv;
                  const hasLesenExtra  = user.lagerLesen?.aktiv;
                  return (
                    <tr key={user._id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
                            <span className="text-orange-600 text-xs font-bold">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-slate-800 text-sm">{user.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-slate-600">{user.username}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <RoleIcon className={cn('w-3.5 h-3.5', roleConf?.color)} />
                          <span className="text-sm text-slate-700">{ROLE_LABELS[user.role]}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {user.role === 'filialen'
                          ? (user.filiale || '–')
                          : (user.depot ? user.depot.charAt(0).toUpperCase() + user.depot.slice(1) : '–')}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {(hasMeldenExtra || ROLE_HAS_MELDEN.has(user.role)) && (
                            <span title="Bestand melden" className={cn(
                              'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md',
                              hasMeldenExtra && !ROLE_HAS_MELDEN.has(user.role)
                                ? 'bg-orange-50 text-orange-600 border border-orange-200'
                                : 'bg-slate-50 text-slate-400'
                            )}>
                              <ClipboardList className="w-3 h-3" />
                              {hasMeldenExtra && !ROLE_HAS_MELDEN.has(user.role) && user.lagerMelden!.filialen.length > 0
                                ? user.lagerMelden!.filialen.join(', ')
                                : 'Melden'}
                            </span>
                          )}
                          {(hasLesenExtra || ROLE_HAS_LESEN.has(user.role)) && (
                            <span title="Bestände einsehen" className={cn(
                              'inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-md',
                              hasLesenExtra && !ROLE_HAS_LESEN.has(user.role)
                                ? 'bg-blue-50 text-blue-600 border border-blue-200'
                                : 'bg-slate-50 text-slate-400'
                            )}>
                              <BarChart3 className="w-3 h-3" />
                              {hasLesenExtra && !ROLE_HAS_LESEN.has(user.role) && user.lagerLesen!.filialen.length > 0
                                ? user.lagerLesen!.filialen.join(', ')
                                : 'Einsicht'}
                            </span>
                          )}
                          {!hasMeldenExtra && !hasLesenExtra && !ROLE_HAS_MELDEN.has(user.role) && !ROLE_HAS_LESEN.has(user.role) && (
                            <span className="text-xs text-slate-300">–</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'text-xs font-medium px-2 py-1 rounded-full',
                          user.isActive
                            ? 'bg-green-50 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        )}>
                          {user.isActive ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {user.lastLogin ? formatDateTime(user.lastLogin) : '–'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(user)}
                            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          {user._id !== currentUser?._id && (
                            <button
                              onClick={() => setDeleteConfirm(user._id)}
                              className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingUser(null); }}
        title={editingUser ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}
        size="md"
      >
        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              placeholder="Max Mustermann"
            />
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Benutzername *</label>
            <input
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
              disabled={!!editingUser}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:bg-slate-50 font-mono"
              placeholder="benutzername"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              PIN {editingUser ? '(leer lassen = unverändert)' : '*'}
            </label>
            <div className="flex items-center gap-3 mb-2">
              <div className="flex gap-2">
                {Array.from({ length: Math.max(pinInput.length, 4) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-3 h-3 rounded-full border-2 transition-all',
                      i < pinInput.length
                        ? 'bg-orange-500 border-orange-500'
                        : 'border-slate-300'
                    )}
                  />
                ))}
              </div>
              {pinInput && (
                <button
                  onClick={() => setPinInput('')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  Löschen
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5 max-w-[180px]">
              {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => {
                if (k === '') return <div key={i} />;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => k === '⌫' ? setPinInput(p => p.slice(0,-1)) : handlePinKey(k)}
                    className="h-9 text-sm font-semibold border border-slate-200 rounded-lg hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600 transition-all"
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Rolle *</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map(r => {
                const Icon = r.icon;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, role: r.value }))}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left',
                      form.role === r.value
                        ? 'border-orange-400 bg-orange-50 text-orange-700'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                    )}
                  >
                    <Icon className={cn('w-4 h-4', form.role === r.value ? 'text-orange-500' : r.color)} />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filiale (nur für Rolle "filialen") */}
          {form.role === 'filialen' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Filialname *</label>
              <input
                value={form.filiale}
                onChange={e => setForm(f => ({ ...f, filiale: e.target.value }))}
                placeholder="z.B. Filiale Trier"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <p className="text-xs text-slate-400 mt-1">Bestandsmeldungen werden diesem Namen zugeordnet</p>
            </div>
          )}

          {/* Depot (nicht für Filialen) */}
          {form.role !== 'filialen' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Zugeordnetes Lager</label>
              <select
                value={form.depot}
                onChange={e => setForm(f => ({ ...f, depot: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              >
                {DEPOTS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          )}

          {/* Lagerbestand-Berechtigungen */}
          {showLagerBlock && (
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lagerbestand-Berechtigungen</span>
              </div>
              <div className="p-4 space-y-4">

                {/* Bestand melden */}
                {showMeldenToggle && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ClipboardList className="w-4 h-4 text-orange-500" />
                        <span className="text-sm font-medium text-slate-700">Bestand melden</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, lagerMelden: { ...f.lagerMelden, aktiv: !f.lagerMelden.aktiv } }))}
                        className={cn('w-10 h-5 rounded-full transition-colors relative flex-shrink-0', form.lagerMelden.aktiv ? 'bg-orange-500' : 'bg-slate-200')}
                      >
                        <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', form.lagerMelden.aktiv ? 'left-5' : 'left-0.5')} />
                      </button>
                    </div>
                    {form.lagerMelden.aktiv && alleFilialen.length > 0 && (
                      <div className="ml-6 space-y-1.5">
                        <p className="text-xs text-slate-400 mb-2">Für welche Filialen? (leer = alle)</p>
                        {alleFilialen.map(f => (
                          <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.lagerMelden.filialen.includes(f)}
                              onChange={() => toggleLagerFiliale('lagerMelden', f)}
                              className="accent-orange-500"
                            />
                            <Store className="w-3 h-3 text-green-500" />
                            <span className="text-slate-700">{f}</span>
                          </label>
                        ))}
                        {form.lagerMelden.filialen.length === 0 && (
                          <p className="text-xs text-orange-500">Alle Filialen</p>
                        )}
                      </div>
                    )}
                    {form.lagerMelden.aktiv && alleFilialen.length === 0 && (
                      <p className="ml-6 text-xs text-slate-400">Noch keine Filialen angelegt – Zugang zu allen zukünftigen Filialen</p>
                    )}
                  </div>
                )}

                {/* Bestände einsehen */}
                {showLesenToggle && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-500" />
                        <span className="text-sm font-medium text-slate-700">Bestände einsehen</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setForm(f => ({ ...f, lagerLesen: { ...f.lagerLesen, aktiv: !f.lagerLesen.aktiv } }))}
                        className={cn('w-10 h-5 rounded-full transition-colors relative flex-shrink-0', form.lagerLesen.aktiv ? 'bg-blue-500' : 'bg-slate-200')}
                      >
                        <span className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all', form.lagerLesen.aktiv ? 'left-5' : 'left-0.5')} />
                      </button>
                    </div>
                    {form.lagerLesen.aktiv && alleFilialen.length > 0 && (
                      <div className="ml-6 space-y-1.5">
                        <p className="text-xs text-slate-400 mb-2">Welche Filialen einsehen? (leer = alle)</p>
                        {alleFilialen.map(f => (
                          <label key={f} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.lagerLesen.filialen.includes(f)}
                              onChange={() => toggleLagerFiliale('lagerLesen', f)}
                              className="accent-blue-500"
                            />
                            <Store className="w-3 h-3 text-green-500" />
                            <span className="text-slate-700">{f}</span>
                          </label>
                        ))}
                        {form.lagerLesen.filialen.length === 0 && (
                          <p className="text-xs text-blue-500">Alle Filialen</p>
                        )}
                      </div>
                    )}
                    {form.lagerLesen.aktiv && alleFilialen.length === 0 && (
                      <p className="ml-6 text-xs text-slate-400">Noch keine Filialen angelegt – Einsicht in alle zukünftigen Filialen</p>
                    )}
                  </div>
                )}

                {/* Hinweis wenn eine Berechtigung durch Rolle abgedeckt ist */}
                {(!showMeldenToggle || !showLesenToggle) && (
                  <p className="text-xs text-slate-400 italic">
                    {ROLE_HAS_MELDEN.has(form.role) && ROLE_HAS_LESEN.has(form.role)
                      ? 'Alle Lager-Berechtigungen sind durch die Rolle abgedeckt.'
                      : ROLE_HAS_MELDEN.has(form.role)
                        ? 'Melden ist durch die Rolle abgedeckt.'
                        : 'Einsicht ist durch die Rolle abgedeckt.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Active toggle */}
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm font-medium text-slate-700">Benutzer aktiv</div>
              <div className="text-xs text-slate-400">Inaktive Benutzer können sich nicht anmelden</div>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              className={cn(
                'w-12 h-6 rounded-full transition-colors relative',
                form.isActive ? 'bg-orange-500' : 'bg-slate-200'
              )}
            >
              <span className={cn(
                'absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all',
                form.isActive ? 'left-7' : 'left-1'
              )} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
              {(error as any)?.response?.data?.message || 'Fehler beim Speichern'}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setShowModal(false); setEditingUser(null); }}>
              Abbrechen
            </Button>
            <Button
              loading={isLoading2}
              disabled={!form.name || !form.username || (!editingUser && !pinInput)}
              onClick={handleSubmit}
            >
              {editingUser ? 'Speichern' : 'Erstellen'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full animate-slide-in">
            <h3 className="font-bold text-slate-900 mb-2">Benutzer löschen?</h3>
            <p className="text-sm text-slate-600 mb-5">
              Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Abbrechen</Button>
              <Button
                variant="danger"
                loading={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteConfirm)}
              >
                Löschen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
