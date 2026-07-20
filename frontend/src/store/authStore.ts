import { create } from 'zustand';
import { User, Role } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  permissions: string[];
  isAuthenticated: boolean;
  setAuth: (user: User, token: string, permissions: string[]) => void;
  clearAuth: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (...roles: Role[]) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: (() => {
    try {
      const stored = localStorage.getItem('gasdispo_user');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  })(),
  token: localStorage.getItem('gasdispo_token'),
  permissions: (() => {
    try {
      const stored = localStorage.getItem('gasdispo_permissions');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  })(),
  isAuthenticated: !!localStorage.getItem('gasdispo_token'),

  setAuth: (user, token, permissions) => {
    localStorage.setItem('gasdispo_token', token);
    localStorage.setItem('gasdispo_user', JSON.stringify(user));
    localStorage.setItem('gasdispo_permissions', JSON.stringify(permissions));
    set({ user, token, permissions, isAuthenticated: true });
  },

  clearAuth: () => {
    localStorage.removeItem('gasdispo_token');
    localStorage.removeItem('gasdispo_user');
    localStorage.removeItem('gasdispo_permissions');
    set({ user: null, token: null, permissions: [], isAuthenticated: false });
  },

  hasPermission: (permission) => get().permissions.includes(permission),
  hasRole: (...roles) => !!get().user && roles.includes(get().user!.role),
}));
